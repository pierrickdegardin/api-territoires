/**
 * Génère les géométries des groupements (PETR, SMO, SMF) par union de leurs EPCI membres
 *
 * Utilise la table groupement_adhesion pour trouver les membres EPCI de chaque groupement,
 * puis génère la géométrie par ST_Union() des géométries EPCI.
 *
 * Usage:
 *   npx tsx scripts/generate-geom-from-epci.ts
 *   npx tsx scripts/generate-geom-from-epci.ts --dry-run
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PAUSE_MS = parseInt(process.env.PAUSE_MS || '300')

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface GroupementSansGeom {
  siren: string
  nom: string
  type: string
  epciSirens: string[]
}

async function findGroupementsToProcess(): Promise<GroupementSansGeom[]> {
  console.log(`\n   Recherche groupements sans géométrie avec membres EPCI...`)

  // Trouver les groupements sans géométrie qui ont des adhésions vers des EPCI avec géométrie
  const rows = await prisma.$queryRaw<Array<{ siren: string; nom: string; type: string; epci_sirens: string[] }>>`
    SELECT
      g.siren,
      g.nom,
      g.type::text as type,
      ARRAY_AGG(DISTINCT ga.adhesion_siren) as epci_sirens
    FROM groupement g
    JOIN groupement_adhesion ga ON ga.groupement_siren = g.siren
    JOIN groupement g2 ON g2.siren = ga.adhesion_siren AND g2.geometry IS NOT NULL
    WHERE g.geometry IS NULL
    GROUP BY g.siren, g.nom, g.type
    HAVING COUNT(DISTINCT ga.adhesion_siren) > 0
    ORDER BY g.type, g.nom
  `

  return rows.map((r) => ({
    siren: r.siren,
    nom: r.nom,
    type: r.type,
    epciSirens: r.epci_sirens,
  }))
}

async function generateGeometriesFromEpci(dryRun: boolean): Promise<void> {
  const toProcess = await findGroupementsToProcess()

  console.log(`   ${toProcess.length} groupements à traiter`)

  // Stats par type
  const byType = new Map<string, number>()
  for (const g of toProcess) {
    byType.set(g.type, (byType.get(g.type) || 0) + 1)
  }
  console.log('\n   Par type:')
  for (const [t, count] of Array.from(byType.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${t}: ${count}`)
  }

  if (dryRun) {
    console.log('\n   Mode dry-run - pas de modification')
    for (const g of toProcess.slice(0, 5)) {
      console.log(`     ${g.siren}: ${g.nom} (${g.epciSirens.length} membres EPCI)`)
    }
    return
  }

  console.log(`\n   Génération des géométries par union EPCI...`)

  let success = 0
  let failed = 0

  for (let i = 0; i < toProcess.length; i++) {
    const grp = toProcess[i]

    try {
      await prisma.$executeRaw`
        UPDATE groupement SET
          geometry = (
            SELECT ST_Multi(ST_Buffer(ST_Union(g2.geometry), 0))
            FROM groupement g2
            WHERE g2.siren = ANY(${grp.epciSirens})
            AND g2.geometry IS NOT NULL
          ),
          centroid = (
            SELECT ST_Centroid(ST_Union(g2.geometry))
            FROM groupement g2
            WHERE g2.siren = ANY(${grp.epciSirens})
            AND g2.geometry IS NOT NULL
          )
        WHERE siren = ${grp.siren}
      `

      // Mettre à jour le code_region si manquant
      await prisma.$executeRaw`
        UPDATE groupement SET
          code_region = (
            SELECT g2.code_region
            FROM groupement g2
            WHERE g2.siren = ANY(${grp.epciSirens})
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
        console.warn(`   Erreur ${grp.siren}: ${e}`)
      }
    }

    if ((i + 1) % 50 === 0) {
      console.log(`   ... ${i + 1}/${toProcess.length} (${success} ok, ${failed} erreurs)`)
      await sleep(PAUSE_MS)
    }
  }

  console.log(`\n   ${success} géométries générées`)
  if (failed > 0) console.log(`   ${failed} erreurs`)
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
