/**
 * Import COMPLET des groupements depuis BANATIC (data.gouv.fr)
 *
 * Source: https://www.data.gouv.fr/fr/datasets/base-nationale-sur-les-intercommunalites/
 *
 * Ce script télécharge les fichiers CSV BANATIC et importe:
 * - Tous les types de groupements (EPCI, Syndicats, PETR, etc.)
 * - Les liens commune-groupement
 * - Génère les géométries par union des communes
 *
 * ATTENTION: Script CPU-intensif pour les géométries
 *   run-limited -c 30 npx tsx scripts/import-banatic.ts
 *
 * Usage:
 *   npx tsx scripts/import-banatic.ts --download     # Télécharge les CSV
 *   npx tsx scripts/import-banatic.ts --import       # Importe les données
 *   npx tsx scripts/import-banatic.ts --geometries   # Génère les géométries
 *   npx tsx scripts/import-banatic.ts --all          # Tout faire
 */

import { PrismaClient, TypeGroupement } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'

const prisma = new PrismaClient()

// Config
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100')
const PAUSE_MS = parseInt(process.env.PAUSE_MS || '2000')
const GEOMETRY_PAUSE_MS = parseInt(process.env.GEOMETRY_PAUSE_MS || '300')
const DATA_DIR = process.env.DATA_DIR || '/tmp/banatic'

// URLs BANATIC (data.gouv.fr) - Mise à jour Janvier 2025
const BANATIC_URLS = {
  // Liste des groupements (TOUS types)
  groupements:
    'https://static.data.gouv.fr/resources/base-nationale-sur-les-intercommunalites/20250203-143929/liste-des-groupements-france-entiere-20250127.csv',
  // Périmètre EPCI à FP (communes membres)
  perimetreEpci:
    'https://static.data.gouv.fr/resources/base-nationale-sur-les-intercommunalites/20250203-144053/perimetre-epci-a-fp.csv',
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Télécharger un fichier avec fetch (convertit Latin-1 → UTF-8)
async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`   Téléchargement: ${path.basename(dest)}...`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const buffer = await response.arrayBuffer()

  // Les CSV BANATIC sont encodés en Latin-1 (ISO-8859-1)
  // On les convertit en UTF-8 pour un stockage correct
  const latin1Content = new TextDecoder('iso-8859-1').decode(buffer)
  fs.writeFileSync(dest, latin1Content, 'utf-8')

  console.log(`   ✓ ${path.basename(dest)} (${(buffer.byteLength / 1024).toFixed(0)} Ko) - converti Latin-1 → UTF-8`)
}

// Parse CSV BANATIC (séparateur ; et encodage potentiellement Latin-1)
function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  // Première ligne = headers (normaliser les caractères spéciaux)
  const headers = lines[0].split(';').map((h) =>
    h
      .replace(/"/g, '')
      .replace(/[\uFFFD]/g, '') // Caractères invalides
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Accents
      .trim()
  )

  console.log(`   Headers CSV: ${headers.slice(0, 5).join(', ')}...`)

  const rows: Array<Record<string, string>> = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';').map((v) => v.replace(/"/g, '').trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] || ''
    })
    rows.push(row)
  }

  return rows
}

// Mapping nature juridique BANATIC -> TypeGroupement
function mapNatureJuridique(nature: string): TypeGroupement | null {
  const natureUpper = nature.toUpperCase()

  // EPCI à fiscalité propre
  if (natureUpper.includes('METROPOLE') || natureUpper === 'ME' || natureUpper === 'MET') {
    return 'EPCI_METROPOLE'
  }
  if (natureUpper.includes('COMMUNAUTE URBAINE') || natureUpper === 'CU') {
    return 'EPCI_CU'
  }
  if (
    natureUpper.includes("COMMUNAUTE D'AGGLOMERATION") ||
    natureUpper.includes('COMMUNAUTE D AGGLOMERATION') ||
    natureUpper === 'CA'
  ) {
    return 'EPCI_CA'
  }
  if (natureUpper.includes('COMMUNAUTE DE COMMUNES') || natureUpper === 'CC') {
    return 'EPCI_CC'
  }
  if (natureUpper.includes('EPT') || natureUpper.includes('ETABLISSEMENT PUBLIC TERRITORIAL')) {
    return 'EPCI_EPT'
  }

  // Syndicats
  if (natureUpper === 'SIVU' || natureUpper.includes('SYNDICAT INTERCOMMUNAL A VOCATION UNIQUE')) {
    return 'SYNDICAT'
  }
  if (natureUpper === 'SIVOM' || natureUpper.includes('SYNDICAT INTERCOMMUNAL A VOCATION MULTIPLE')) {
    return 'SYNDICAT'
  }
  if (natureUpper === 'SMF' || natureUpper.includes('SYNDICAT MIXTE FERME')) {
    return 'SYNDICAT_MIXTE'
  }
  if (natureUpper === 'SMO' || natureUpper.includes('SYNDICAT MIXTE OUVERT')) {
    return 'SYNDICAT_MIXTE'
  }
  if (natureUpper.includes('SYNDICAT')) {
    return 'SYNDICAT'
  }

  // Autres structures
  if (natureUpper === 'PETR' || natureUpper.includes("POLE D'EQUILIBRE")) {
    return 'PETR'
  }
  if (natureUpper.includes('PAYS')) {
    return 'PAYS'
  }
  if (natureUpper.includes('PNR') || natureUpper.includes('PARC NATUREL REGIONAL')) {
    return 'PNR'
  }

  return null
}

// ============================================
// TÉLÉCHARGEMENT FICHIERS BANATIC
// ============================================
async function downloadBanaticFiles(): Promise<void> {
  console.log('\n📥 Téléchargement des fichiers BANATIC depuis data.gouv.fr...')

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  // Télécharger tous les fichiers CSV
  await downloadFile(BANATIC_URLS.groupements, path.join(DATA_DIR, 'groupements.csv'))
  await downloadFile(BANATIC_URLS.perimetreEpci, path.join(DATA_DIR, 'perimetre-epci.csv'))

  console.log('   ✅ Fichiers BANATIC téléchargés')
}

// ============================================
// IMPORT GROUPEMENTS DEPUIS CSV BANATIC
// ============================================
async function importGroupementsFromCSV(): Promise<void> {
  console.log('\n📍 Import des GROUPEMENTS depuis CSV BANATIC...')

  const csvPath = path.join(DATA_DIR, 'groupements.csv')
  if (!fs.existsSync(csvPath)) {
    console.log('   ⚠️ Fichier groupements.csv non trouvé, téléchargement...')
    await downloadFile(BANATIC_URLS.groupements, csvPath)
  }

  const content = fs.readFileSync(csvPath, 'utf-8')
  const rows = parseCSV(content)

  console.log(`   Trouvé ${rows.length} groupements dans le CSV`)

  let imported = 0
  let skipped = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      // Colonnes normalisées (sans accents): N SIREN, Nom du groupement, Nature juridique
      const siren = row['N SIREN'] || row['N° SIREN'] || row['siren'] || row['SIREN'] || ''
      const nom = row['Nom du groupement'] || row['nom'] || row['NOM'] || ''
      const nature = row['Nature juridique'] || row['nature_juridique'] || ''
      const departement = row['Departement'] || row['Département'] || ''
      const population = row['Population totale'] || ''

      if (!siren || siren.length !== 9) {
        skipped++
        continue
      }

      const type = mapNatureJuridique(nature)
      if (!type) {
        skipped++
        continue
      }

      try {
        const pop = population ? parseInt(population.replace(/\s/g, '')) : null
        await prisma.groupement.upsert({
          where: { siren },
          create: {
            siren,
            nom: nom || `Groupement ${siren}`,
            type,
            nature: nature.substring(0, 100),
            population: pop && !isNaN(pop) ? pop : null,
          },
          update: {
            nom: nom || `Groupement ${siren}`,
            type,
            nature: nature.substring(0, 100),
            population: pop && !isNaN(pop) ? pop : null,
          },
        })
        imported++
      } catch (e) {
        skipped++
      }
    }

    console.log(`   ... ${imported}/${rows.length} importés`)
    await sleep(PAUSE_MS / 2)
  }

  console.log(`   ✅ ${imported} groupements importés, ${skipped} ignorés`)
}

// ============================================
// IMPORT PÉRIMÈTRE EPCI (COMMUNES MEMBRES)
// ============================================
async function importPerimetreFromCSV(): Promise<void> {
  console.log('\n📍 Import du PÉRIMÈTRE EPCI depuis CSV...')

  const csvPath = path.join(DATA_DIR, 'perimetre-epci.csv')
  if (!fs.existsSync(csvPath)) {
    console.log('   ⚠️ Fichier perimetre-epci.csv non trouvé, téléchargement...')
    await downloadFile(BANATIC_URLS.perimetreEpci, csvPath)
  }

  const content = fs.readFileSync(csvPath, 'utf-8')
  const rows = parseCSV(content)

  console.log(`   Trouvé ${rows.length} liens commune-EPCI dans le CSV`)

  let created = 0
  let errors = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      // Colonnes du fichier: siren, insee, nom_membre...
      const sirenEpci = row['siren'] || row['SIREN'] || ''
      const codeCommune = row['insee'] || row['INSEE'] || ''

      if (!sirenEpci || sirenEpci.length !== 9 || !codeCommune || codeCommune.length !== 5) {
        errors++
        continue
      }

      try {
        // Vérifier que les deux existent
        const [commune, groupement] = await Promise.all([
          prisma.commune.findUnique({ where: { code: codeCommune }, select: { code: true } }),
          prisma.groupement.findUnique({ where: { siren: sirenEpci }, select: { siren: true } }),
        ])

        if (!commune || !groupement) {
          errors++
          continue
        }

        await prisma.communeGroupement.upsert({
          where: {
            communeCode_groupementSiren: {
              communeCode: codeCommune,
              groupementSiren: sirenEpci,
            },
          },
          create: {
            communeCode: codeCommune,
            groupementSiren: sirenEpci,
          },
          update: {},
        })
        created++
      } catch {
        errors++
      }
    }

    console.log(`   ... ${created}/${rows.length} liens créés`)
    await sleep(PAUSE_MS / 4)
  }

  // Mettre à jour le nombre de communes par groupement
  console.log('   Mise à jour des compteurs...')
  await prisma.$executeRaw`
    UPDATE groupement g SET nb_communes = (
      SELECT COUNT(*) FROM commune_groupement cg WHERE cg.groupement_siren = g.siren
    )
  `

  console.log(`   ✅ ${created} liens créés, ${errors} erreurs`)
}

// ============================================
// IMPORT DEPUIS GEO API (EPCI)
// ============================================
async function importEpciFromGeoApi(): Promise<void> {
  console.log('\n📍 Import des EPCI depuis geo.api.gouv.fr...')

  const response = await fetch('https://geo.api.gouv.fr/epcis?fields=code,nom,population')
  if (!response.ok) throw new Error(`Erreur API: ${response.status}`)

  const epcis = (await response.json()) as Array<{
    code: string
    nom: string
    population?: number
  }>

  console.log(`   Trouvé ${epcis.length} EPCI`)

  let imported = 0

  for (let i = 0; i < epcis.length; i += BATCH_SIZE) {
    const batch = epcis.slice(i, i + BATCH_SIZE)

    for (const epci of batch) {
      // Récupérer les détails
      const detailRes = await fetch(
        `https://geo.api.gouv.fr/epcis/${epci.code}?fields=code,nom,population,codesRegions`
      )

      if (!detailRes.ok) continue

      const detail = (await detailRes.json()) as {
        code: string
        nom: string
        population?: number
        codesRegions?: string[]
      }

      // Déterminer le type
      let type: TypeGroupement = 'EPCI_CC'
      const nomLower = detail.nom.toLowerCase()
      if (nomLower.includes('métropole') || nomLower.includes('metropole')) {
        type = 'EPCI_METROPOLE'
      } else if (nomLower.includes('communauté urbaine') || nomLower.includes('communaute urbaine')) {
        type = 'EPCI_CU'
      } else if (nomLower.includes("communauté d'agglomération") || nomLower.includes("communaute d'agglomeration")) {
        type = 'EPCI_CA'
      }

      await prisma.groupement.upsert({
        where: { siren: detail.code },
        create: {
          siren: detail.code,
          nom: detail.nom,
          type,
          population: detail.population,
          codeRegion: detail.codesRegions?.[0],
        },
        update: {
          nom: detail.nom,
          type,
          population: detail.population,
          codeRegion: detail.codesRegions?.[0],
        },
      })

      // Récupérer les communes membres
      const membresRes = await fetch(`https://geo.api.gouv.fr/epcis/${epci.code}/communes?fields=code`)
      if (membresRes.ok) {
        const membres = (await membresRes.json()) as Array<{ code: string }>

        await prisma.groupement.update({
          where: { siren: detail.code },
          data: { nbCommunes: membres.length },
        })

        for (const membre of membres) {
          try {
            await prisma.communeGroupement.upsert({
              where: {
                communeCode_groupementSiren: {
                  communeCode: membre.code,
                  groupementSiren: detail.code,
                },
              },
              create: {
                communeCode: membre.code,
                groupementSiren: detail.code,
              },
              update: {},
            })
          } catch {
            // Commune peut ne pas exister
          }
        }
      }

      imported++
    }

    console.log(`   ... ${imported}/${epcis.length}`)
    await sleep(PAUSE_MS)
  }

  console.log(`   ✅ ${imported} EPCI importés avec leurs membres`)
}

// ============================================
// IMPORT SYNDICATS DEPUIS CARTE
// ============================================
async function importSyndicatsFromCarte(): Promise<void> {
  console.log('\n📍 Import des SYNDICATS depuis CARTE...')

  const { Client } = await import('pg')
  const carteDbUrl = process.env.CARTE_DATABASE_URL
  if (!carteDbUrl) {
    throw new Error('CARTE_DATABASE_URL environment variable is required')
  }
  const carteClient = new Client({ connectionString: carteDbUrl })

  await carteClient.connect()

  // Récupérer tous les groupements non-EPCI de CARTE
  const result = await carteClient.query(`
    SELECT
      siren,
      nom,
      "typeGroupement" as type,
      population,
      region as code_region,
      latitude,
      longitude
    FROM "Groupement"
    WHERE "typeGroupement" IN ('SIVU', 'SIVOM', 'SMF', 'SMO', 'PETR', 'AUTRE')
    AND actif = true
    AND siren IS NOT NULL
    ORDER BY siren
  `)

  console.log(`   Trouvé ${result.rows.length} syndicats/autres dans CARTE`)

  const typeMapping: Record<string, TypeGroupement> = {
    SIVU: 'SYNDICAT',
    SIVOM: 'SYNDICAT',
    SMF: 'SYNDICAT_MIXTE',
    SMO: 'SYNDICAT_MIXTE',
    PETR: 'PETR',
    AUTRE: 'SYNDICAT', // Par défaut
  }

  let imported = 0

  for (let i = 0; i < result.rows.length; i += BATCH_SIZE) {
    const batch = result.rows.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      const type = typeMapping[row.type]
      if (!type) continue

      try {
        await prisma.groupement.upsert({
          where: { siren: row.siren },
          create: {
            siren: row.siren,
            nom: row.nom,
            type,
            population: row.population,
            codeRegion: row.code_region,
            latitude: row.latitude,
            longitude: row.longitude,
          },
          update: {
            nom: row.nom,
            type,
            population: row.population,
            codeRegion: row.code_region,
            latitude: row.latitude,
            longitude: row.longitude,
          },
        })
        imported++
      } catch (e) {
        // Ignorer les erreurs
      }
    }

    console.log(`   ... ${imported}/${result.rows.length}`)
    await sleep(PAUSE_MS / 2)
  }

  await carteClient.end()
  console.log(`   ✅ ${imported} syndicats importés`)
}

// ============================================
// GÉNÉRATION GÉOMÉTRIES PAR UNION
// ============================================
async function generateGeometries(): Promise<void> {
  console.log('\n📍 Génération des GÉOMÉTRIES par union des communes...')
  console.log(`   ⚠️ Opération CPU-intensive - Pause: ${GEOMETRY_PAUSE_MS}ms entre chaque`)

  // Récupérer les groupements avec membres mais sans géométrie
  const groupements = await prisma.$queryRaw<Array<{ siren: string; nom: string; nb: bigint }>>`
    SELECT
      g.siren,
      g.nom,
      COUNT(cg.commune_code) as nb
    FROM groupement g
    JOIN commune_groupement cg ON cg.groupement_siren = g.siren
    WHERE g.geometry IS NULL
    GROUP BY g.siren, g.nom
    HAVING COUNT(cg.commune_code) > 0
    ORDER BY COUNT(cg.commune_code) ASC
  `

  console.log(`   ${groupements.length} groupements à traiter`)

  let processed = 0
  let success = 0
  let errors = 0

  for (const grp of groupements) {
    try {
      // ST_Union pour créer la géométrie à partir des communes membres
      await prisma.$executeRaw`
        UPDATE groupement SET
          geometry = (
            SELECT ST_Multi(ST_Buffer(ST_Union(c.geometry), 0))
            FROM commune c
            JOIN commune_groupement cg ON cg.commune_code = c.code
            WHERE cg.groupement_siren = ${grp.siren}
            AND c.geometry IS NOT NULL
          ),
          centroid = (
            SELECT ST_Centroid(ST_Union(c.geometry))
            FROM commune c
            JOIN commune_groupement cg ON cg.commune_code = c.code
            WHERE cg.groupement_siren = ${grp.siren}
            AND c.geometry IS NOT NULL
          )
        WHERE siren = ${grp.siren}
      `
      success++
    } catch (e) {
      errors++
    }

    processed++

    if (processed % 50 === 0) {
      console.log(`   ... ${processed}/${groupements.length} (${success} ok, ${errors} erreurs)`)
    }

    // Pause pour éviter surcharge CPU
    await sleep(GEOMETRY_PAUSE_MS)
  }

  console.log(`   ✅ ${success} géométries générées, ${errors} erreurs`)
}

// ============================================
// STATS FINALES
// ============================================
async function showStats(): Promise<void> {
  console.log('\n📊 Statistiques finales:')

  const statsByType = await prisma.$queryRaw<
    Array<{
      type: string
      total: bigint
      with_geom: bigint
    }>
  >`
    SELECT
      type::text,
      COUNT(*) as total,
      COUNT(geometry) as with_geom
    FROM groupement
    GROUP BY type
    ORDER BY total DESC
  `

  for (const stat of statsByType) {
    console.log(`   ${stat.type}: ${stat.total} total, ${stat.with_geom} avec géométrie`)
  }

  const totalLiens = await prisma.communeGroupement.count()
  console.log(`\n   Total liens commune-groupement: ${totalLiens}`)
}

// ============================================
// MAIN
// ============================================
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const runAll = args.includes('--all') || args.length === 0

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║   API Territoires - Import BANATIC complet         ║')
  console.log('║   Sources: data.gouv.fr (CSV) + geo.api.gouv.fr    ║')
  console.log('╚════════════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    if (args.includes('--download') || runAll) {
      await downloadBanaticFiles()
    }

    if (runAll || args.includes('--import')) {
      // 1. Import groupements depuis CSV BANATIC (tous types)
      await importGroupementsFromCSV()

      // 2. Import périmètre EPCI (liens commune-groupement)
      await importPerimetreFromCSV()

      // 3. Compléter avec geo.api.gouv.fr pour les EPCI
      await importEpciFromGeoApi()

      // 4. Import syndicats depuis CARTE (si disponible)
      try {
        await importSyndicatsFromCarte()
      } catch (e) {
        console.log('   ⚠️ Import syndicats CARTE ignoré:', e)
      }
    }

    if (runAll || args.includes('--geometries')) {
      await generateGeometries()
    }

    await showStats()

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
    console.log(`\n✅ Terminé en ${duration} minutes`)
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
