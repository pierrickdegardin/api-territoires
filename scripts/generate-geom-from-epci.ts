/**
 * Génère les géométries des groupements (PETR, SMO, SMF) par union de leurs EPCI membres
 *
 * Usage:
 *   npx tsx scripts/generate-geom-from-epci.ts
 *   npx tsx scripts/generate-geom-from-epci.ts --dry-run
 */

import { PrismaClient } from '@prisma/client'
import * as ExcelJS from 'exceljs'
import * as fs from 'fs'

const prisma = new PrismaClient()

const EXCEL_PATH = '/tmp/Liste des délégués_20260118.xlsx'
const PAUSE_MS = parseInt(process.env.PAUSE_MS || '300')

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface EpciMembre {
  siren: string
  nom: string
}

interface GroupementAvecEpci {
  siren: string
  nom: string
  nature: string
  epciMembres: EpciMembre[]
}

async function parseExcelForEpciMembres(): Promise<Map<string, GroupementAvecEpci>> {
  console.log(`\n📖 Lecture du fichier Excel...`)

  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Fichier non trouvé: ${EXCEL_PATH}`)
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(EXCEL_PATH)
  const worksheet = workbook.worksheets[0]

  // Convertir en objets JSON
  const rows: Array<Record<string, unknown>> = []
  const headers: string[] = []

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell) => {
        headers.push(cell.value?.toString() || '')
      })
    } else {
      const rowData: Record<string, unknown> = {}
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1]
        if (header) {
          rowData[header] = cell.value
        }
      })
      rows.push(rowData)
    }
  })

  console.log(`   ${rows.length} lignes`)

  const groupements = new Map<string, GroupementAvecEpci>()

  for (const row of rows) {
    const siren = String(row['N° SIREN'] || '').trim()
    const nom = String(row['Nom du groupement'] || '').trim()
    const nature = String(row['Nature juridique'] || '').trim()
    const sirenMembre = String(row['N° SIREN Membre représenté'] || '').trim()
    const libelleMembre = String(row['Libellé Membre représenté'] || '').trim()

    if (!siren || !sirenMembre) continue

    // SIREN EPCI commence par 200
    const isEpciMembre = sirenMembre.startsWith('200') && sirenMembre.length === 9

    if (!isEpciMembre) continue

    if (!groupements.has(siren)) {
      groupements.set(siren, {
        siren,
        nom,
        nature,
        epciMembres: [],
      })
    }

    const grp = groupements.get(siren)!

    // Éviter doublons
    if (!grp.epciMembres.some((m) => m.siren === sirenMembre)) {
      grp.epciMembres.push({
        siren: sirenMembre,
        nom: libelleMembre,
      })
    }
  }

  console.log(`   ${groupements.size} groupements avec membres EPCI`)
  return groupements
}

async function generateGeometriesFromEpci(dryRun: boolean): Promise<void> {
  const groupements = await parseExcelForEpciMembres()

  // Filtrer: groupements sans géométrie mais avec membres EPCI
  const toProcess: GroupementAvecEpci[] = []

  console.log(`\n📍 Recherche groupements sans géométrie...`)

  for (const grp of groupements.values()) {
    // Vérifier si existe dans DB et sans géométrie
    const existing = await prisma.$queryRaw<Array<{ siren: string; has_geom: boolean }>>`
      SELECT siren, geometry IS NOT NULL as has_geom
      FROM groupement
      WHERE siren = ${grp.siren}
    `

    if (existing.length > 0 && !existing[0].has_geom) {
      toProcess.push(grp)
    }
  }

  console.log(`   ${toProcess.length} groupements à traiter`)

  // Stats par nature
  const byNature = new Map<string, number>()
  for (const g of toProcess) {
    byNature.set(g.nature, (byNature.get(g.nature) || 0) + 1)
  }
  console.log('\n   Par nature:')
  for (const [nat, count] of Array.from(byNature.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${nat}: ${count}`)
  }

  if (dryRun) {
    console.log('\n   🔍 Mode dry-run - pas de modification')

    // Afficher quelques exemples
    console.log('\n   Exemples PETR:')
    for (const g of toProcess.filter((g) => g.nature === 'PETR').slice(0, 3)) {
      console.log(`     ${g.siren}: ${g.nom}`)
      console.log(`       EPCI membres: ${g.epciMembres.length}`)
      for (const m of g.epciMembres.slice(0, 3)) {
        console.log(`         - ${m.siren}: ${m.nom}`)
      }
    }
    return
  }

  // Générer les géométries
  console.log(`\n📍 Génération des géométries par union EPCI...`)

  let success = 0
  let failed = 0
  let noEpciGeom = 0

  for (let i = 0; i < toProcess.length; i++) {
    const grp = toProcess[i]

    try {
      // Récupérer les SIREN des EPCI membres
      const epciSirens = grp.epciMembres.map((m) => m.siren)

      if (epciSirens.length === 0) {
        failed++
        continue
      }

      // Vérifier combien d'EPCI ont une géométrie
      const epciWithGeom = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM groupement
        WHERE siren = ANY(${epciSirens})
        AND geometry IS NOT NULL
      `

      const epciGeomCount = Number(epciWithGeom[0]?.count || 0)

      if (epciGeomCount === 0) {
        noEpciGeom++
        continue
      }

      // Générer la géométrie par union
      await prisma.$executeRaw`
        UPDATE groupement SET
          geometry = (
            SELECT ST_Multi(ST_Buffer(ST_Union(g2.geometry), 0))
            FROM groupement g2
            WHERE g2.siren = ANY(${epciSirens})
            AND g2.geometry IS NOT NULL
          ),
          centroid = (
            SELECT ST_Centroid(ST_Union(g2.geometry))
            FROM groupement g2
            WHERE g2.siren = ANY(${epciSirens})
            AND g2.geometry IS NOT NULL
          )
        WHERE siren = ${grp.siren}
      `

      // Mettre à jour le code_region
      await prisma.$executeRaw`
        UPDATE groupement g SET
          code_region = (
            SELECT g2.code_region
            FROM groupement g2
            WHERE g2.siren = ANY(${epciSirens})
            AND g2.code_region IS NOT NULL
            GROUP BY g2.code_region
            ORDER BY COUNT(*) DESC
            LIMIT 1
          )
        WHERE siren = ${grp.siren}
        AND code_region IS NULL
      `

      success++
    } catch (e) {
      failed++
      if (failed <= 3) {
        console.warn(`   ⚠️ Erreur ${grp.siren}: ${e}`)
      }
    }

    if ((i + 1) % 50 === 0) {
      console.log(
        `   ... ${i + 1}/${toProcess.length} (${success} ok, ${noEpciGeom} sans EPCI geom, ${failed} erreurs)`
      )
      await sleep(PAUSE_MS)
    }
  }

  console.log(`\n   ✅ ${success} géométries générées`)
  console.log(`   ⚠️ ${noEpciGeom} sans géométries EPCI disponibles`)
  console.log(`   ❌ ${failed} erreurs`)
}

async function showStats(): Promise<void> {
  console.log(`\n📊 Statistiques finales:`)

  const stats = await prisma.$queryRaw<Array<{ type: string; total: bigint; with_geom: bigint }>>`
    SELECT
      type::text,
      COUNT(*) as total,
      COUNT(geometry) as with_geom
    FROM groupement
    GROUP BY type
    ORDER BY total DESC
  `

  for (const s of stats) {
    const pct = ((Number(s.with_geom) / Number(s.total)) * 100).toFixed(0)
    console.log(
      `   ${s.type.padEnd(15)}: ${String(s.total).padStart(5)} total, ${String(s.with_geom).padStart(5)} geom (${pct}%)`
    )
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║   Génération géométries depuis EPCI membres        ║')
  console.log('╚════════════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    await generateGeometriesFromEpci(dryRun)

    if (!dryRun) {
      await showStats()
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
    console.log(`\n════════════════════════════════════════════════════`)
    console.log(`✅ Terminé en ${duration} minutes`)
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
