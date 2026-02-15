/**
 * Import complet autonome - Charge toutes les données depuis les APIs publiques + fichiers CSV seed
 *
 * Usage:
 *   npx tsx scripts/import-all.ts [--skip-geo] [--skip-enrezo] [--skip-seed] [--seed-only]
 *
 * Étapes:
 *   1. Territoires (régions, départements, communes, groupements) depuis geo.api.gouv.fr + BANATIC
 *   2. Géométries (contours régions, départements, communes) depuis geo.api.gouv.fr
 *   3. EnRezo (CEREMA) : réseaux chaleur, gisements, zones d'opportunité
 *   4. Structures spécialisées (CAUE, ALEC, AREC) depuis recherche-entreprises.api.gouv.fr
 *   5. FINESS (établissements de santé) depuis data.gouv.fr
 *   6. Données seed CSV (lauréats, structures métier, aliases, adhésions)
 *   7. Géométries dérivées (union EPCI pour PETR/SMO/SMF)
 *   8. Géométries ALEC (copie depuis dept/région/EPCI)
 *
 * Durée estimée : ~30-45 minutes (selon débit réseau)
 */

import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

const STEPS = {
  territories: 'Territoires (régions, départements, communes, groupements)',
  geometries: 'Géométries (contours PostGIS)',
  enrezo: 'EnRezo CEREMA (réseaux chaleur, gisements, zones)',
  caue: 'CAUE (Conseil Architecture Urbanisme Environnement)',
  arec: 'AREC (Agences Régionales Énergie Climat)',
  finess: 'FINESS (établissements de santé)',
  seed: 'Données seed (lauréats, structures, aliases, adhésions)',
  derivedGeom: 'Géométries dérivées (union EPCI → PETR/SMO/SMF)',
  alecGeom: 'Géométries ALEC (copie dept/région/EPCI)',
}

function log(step: string, msg: string) {
  const timestamp = new Date().toISOString().slice(11, 19)
  console.log(`[${timestamp}] [${step}] ${msg}`)
}

function runScript(scriptName: string, step: string): boolean {
  const scriptPath = path.join(__dirname, scriptName)
  if (!fs.existsSync(scriptPath)) {
    log(step, `Script ${scriptName} non trouvé, ignoré`)
    return false
  }

  log(step, `Lancement de ${scriptName}...`)
  try {
    execSync(`npx tsx ${scriptPath}`, {
      stdio: 'inherit',
      timeout: 30 * 60 * 1000, // 30 min max par script
      env: { ...process.env },
    })
    log(step, `${scriptName} terminé avec succès`)
    return true
  } catch (error: any) {
    log(step, `ERREUR dans ${scriptName}: ${error.message}`)
    return false
  }
}

async function importSeedCSV(filename: string, tableName: string, step: string): Promise<number> {
  const filePath = path.join(__dirname, '..', 'data', filename)
  if (!fs.existsSync(filePath)) {
    log(step, `Fichier ${filename} non trouvé, ignoré`)
    return 0
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')
  const headers = lines[0].split(',').map((h) => h.trim())
  let imported = 0

  log(step, `Import de ${filename} (${lines.length - 1} lignes)...`)

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length !== headers.length) continue

    const row: Record<string, any> = {}
    headers.forEach((h, idx) => {
      const val = values[idx]
      if (val === '' || val === undefined) {
        row[h] = null
      } else if (val === 't' || val === 'true') {
        row[h] = true
      } else if (val === 'f' || val === 'false') {
        row[h] = false
      } else if (h.endsWith('_at')) {
        row[h] = new Date(val)
      } else if (
        !isNaN(Number(val)) &&
        h !== 'id' &&
        h !== 'siren' &&
        h !== 'code_postal' &&
        h !== 'finess' &&
        h !== 'finess_ej' &&
        h !== 'code_officiel' &&
        h !== 'code_insee' &&
        h !== 'region_code' &&
        h !== 'departement_code' &&
        h !== 'commune_code' &&
        h !== 'groupement_siren' &&
        h !== 'adhesion_siren' &&
        h !== 'groupement_siren' &&
        h !== 'telephone'
      ) {
        row[h] = Number(val)
      } else {
        row[h] = val
      }
    })

    try {
      await (prisma as any)[toPrismaModel(tableName)].upsert({
        where: idWhere(tableName, row),
        create: row,
        update: row,
      })
      imported++
    } catch {
      // Silently skip duplicates or errors on individual rows
    }
  }

  log(step, `${filename}: ${imported}/${lines.length - 1} importés`)
  return imported
}

function toPrismaModel(tableName: string): string {
  const map: Record<string, string> = {
    laureat: 'laureat',
    structure: 'structure',
    alias: 'alias',
  }
  return map[tableName] || tableName
}

function idWhere(tableName: string, row: Record<string, any>): Record<string, any> {
  if (tableName === 'alias') return { id: row.id }
  return { id: row.id }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

async function importGroupementAdhesions(step: string): Promise<number> {
  const filePath = path.join(__dirname, '..', 'data', 'groupement-adhesions.csv')
  if (!fs.existsSync(filePath)) {
    log(step, 'groupement-adhesions.csv non trouvé, ignoré')
    return 0
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')
  let imported = 0

  log(step, `Import adhésions groupements (${lines.length - 1} lignes)...`)

  for (let i = 1; i < lines.length; i++) {
    const [groupementSiren, adhesionSiren] = lines[i].split(',').map((s) => s.trim())
    if (!groupementSiren || !adhesionSiren) continue

    try {
      await prisma.groupementAdhesion.upsert({
        where: {
          groupementSiren_adhesionSiren: { groupementSiren, adhesionSiren },
        },
        create: { groupementSiren, adhesionSiren },
        update: {},
      })
      imported++
    } catch {
      // Skip invalid foreign keys
    }
  }

  log(step, `Adhésions: ${imported}/${lines.length - 1} importées`)
  return imported
}

async function printStats() {
  const [regions, depts, communes, groupements, structures, laureats, aliases] = await Promise.all([
    prisma.region.count(),
    prisma.departement.count(),
    prisma.commune.count(),
    prisma.groupement.count(),
    prisma.structure.count(),
    prisma.laureat.count(),
    prisma.alias.count(),
  ])

  console.log('\n=== RÉSULTAT FINAL ===')
  console.log(`Régions:      ${regions}`)
  console.log(`Départements: ${depts}`)
  console.log(`Communes:     ${communes}`)
  console.log(`Groupements:  ${groupements}`)
  console.log(`Structures:   ${structures}`)
  console.log(`Lauréats:     ${laureats}`)
  console.log(`Aliases:      ${aliases}`)
  console.log('=====================\n')
}

async function main() {
  const args = process.argv.slice(2)
  const skipGeo = args.includes('--skip-geo')
  const skipEnrezo = args.includes('--skip-enrezo')
  const skipSeed = args.includes('--skip-seed')
  const seedOnly = args.includes('--seed-only')

  console.log('=== API TERRITOIRES - Import complet autonome ===\n')
  const startTime = Date.now()

  if (!seedOnly) {
    // Étape 1 : Territoires de base
    log('territories', STEPS.territories)
    runScript('import-territoires.ts', 'territories')

    // Étape 2 : Géométries
    if (!skipGeo) {
      log('geometries', STEPS.geometries)
      runScript('import-geometries.ts', 'geometries')
    } else {
      log('geometries', 'Ignoré (--skip-geo)')
    }

    // Étape 3 : EnRezo CEREMA
    if (!skipEnrezo) {
      log('enrezo', STEPS.enrezo)
      runScript('import-enrezo.ts', 'enrezo')
    } else {
      log('enrezo', 'Ignoré (--skip-enrezo)')
    }

    // Étape 4 : CAUE + AREC depuis APIs publiques
    log('caue', STEPS.caue)
    runScript('import-caue-annuaire.ts', 'caue')
    runScript('import-caue-alec.ts', 'caue')

    log('arec', STEPS.arec)
    runScript('import-arec.ts', 'arec')
    runScript('import-arec-contacts.ts', 'arec')

    // Étape 5 : FINESS
    log('finess', STEPS.finess)
    runScript('import-finess.ts', 'finess')
  }

  // Étape 6 : Données seed CSV
  if (!skipSeed) {
    log('seed', STEPS.seed)
    await importSeedCSV('laureats.csv', 'laureat', 'seed')
    await importSeedCSV('structures.csv', 'structure', 'seed')
    await importSeedCSV('aliases.csv', 'alias', 'seed')
    await importGroupementAdhesions('seed')
  } else {
    log('seed', 'Ignoré (--skip-seed)')
  }

  // Étape 7 : Géométries dérivées (union EPCI pour PETR/SMO/SMF)
  if (!seedOnly && !skipGeo) {
    log('derivedGeom', STEPS.derivedGeom)
    runScript('generate-geom-from-epci.ts', 'derivedGeom')
  }

  // Étape 8 : Géométries ALEC
  if (!seedOnly && !skipGeo) {
    log('alecGeom', STEPS.alecGeom)
    runScript('assign-alec-geometry.ts', 'alecGeom')
  }

  // Stats finales
  await printStats()

  const elapsed = Math.round((Date.now() - startTime) / 1000 / 60)
  console.log(`Import terminé en ${elapsed} minutes.`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('ERREUR FATALE:', err)
  process.exit(1)
})
