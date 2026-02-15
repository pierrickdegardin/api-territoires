/**
 * Import syndicats depuis la base CARTE et génération des géométries
 * par union des communes membres
 *
 * ATTENTION: Ce script est CPU-intensif. Utiliser avec run-limited:
 *   run-limited -c 30 npx tsx scripts/import-syndicats-from-carte.ts
 *
 * Usage:
 *   npx tsx scripts/import-syndicats-from-carte.ts [--import] [--geometries] [--all]
 *   npx tsx scripts/import-syndicats-from-carte.ts --batch-size=50 --pause=5000
 */

import { PrismaClient as PrismaClientTerritoires, TypeGroupement } from '@prisma/client'
import { Client } from 'pg'

// Config
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50')
const PAUSE_MS = parseInt(process.env.PAUSE_MS || '3000') // 3s entre batches
const GEOMETRY_PAUSE_MS = parseInt(process.env.GEOMETRY_PAUSE_MS || '500') // 500ms entre générations

const prismaTerritoires = new PrismaClientTerritoires()

// Connexion directe à CARTE pour lire les syndicats
const carteDbUrl = process.env.CARTE_DATABASE_URL
if (!carteDbUrl) {
  throw new Error('CARTE_DATABASE_URL environment variable is required')
}
const carteClient = new Client({ connectionString: carteDbUrl })

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Mapping des types CARTE vers API Territoires
function mapTypeGroupement(carteType: string): TypeGroupement | null {
  const mapping: Record<string, TypeGroupement> = {
    SIVU: 'SYNDICAT',
    SIVOM: 'SYNDICAT',
    SMF: 'SYNDICAT_MIXTE',
    SMO: 'SYNDICAT_MIXTE',
    PETR: 'PETR',
    // EPCI déjà importés depuis geo.api.gouv.fr
  }
  return mapping[carteType] || null
}

// ============================================
// IMPORT SYNDICATS DEPUIS CARTE
// ============================================
async function importSyndicatsFromCarte(): Promise<void> {
  console.log('\n📍 Import des SYNDICATS depuis CARTE...')
  console.log(`   Batch size: ${BATCH_SIZE}, Pause: ${PAUSE_MS}ms`)

  await carteClient.connect()

  // Récupérer les syndicats de CARTE
  const result = await carteClient.query(`
    SELECT
      siren,
      nom,
      "typeGroupement" as type,
      population,
      region as code_region,
      "nombreMembres" as nb_communes,
      latitude,
      longitude
    FROM "Groupement"
    WHERE "typeGroupement" IN ('SIVU', 'SIVOM', 'SMF', 'SMO', 'PETR')
    AND actif = true
    ORDER BY siren
  `)

  console.log(`   Trouvé ${result.rows.length} syndicats dans CARTE`)

  let imported = 0
  let skipped = 0

  for (let i = 0; i < result.rows.length; i += BATCH_SIZE) {
    const batch = result.rows.slice(i, i + BATCH_SIZE)

    for (const syndicat of batch) {
      const type = mapTypeGroupement(syndicat.type)
      if (!type) {
        skipped++
        continue
      }

      try {
        await prismaTerritoires.groupement.upsert({
          where: { siren: syndicat.siren },
          create: {
            siren: syndicat.siren,
            nom: syndicat.nom,
            type: type,
            population: syndicat.population,
            codeRegion: syndicat.code_region,
            nbCommunes: syndicat.nb_communes,
            latitude: syndicat.latitude,
            longitude: syndicat.longitude,
          },
          update: {
            nom: syndicat.nom,
            type: type,
            population: syndicat.population,
            codeRegion: syndicat.code_region,
            nbCommunes: syndicat.nb_communes,
            latitude: syndicat.latitude,
            longitude: syndicat.longitude,
          },
        })
        imported++
      } catch (e) {
        console.warn(`   ⚠️ Erreur syndicat ${syndicat.siren}: ${e}`)
      }
    }

    console.log(`   ... ${imported}/${result.rows.length} importés (batch ${Math.floor(i / BATCH_SIZE) + 1})`)
    await sleep(PAUSE_MS)
  }

  await carteClient.end()
  console.log(`   ✅ ${imported} syndicats importés, ${skipped} ignorés`)
}

// ============================================
// IMPORT MEMBRES SYNDICATS
// ============================================
async function importMembresSyndicats(): Promise<void> {
  console.log('\n📍 Import des MEMBRES syndicats depuis CARTE...')

  await carteClient.connect()

  // Récupérer les liens commune-syndicat
  const result = await carteClient.query(`
    SELECT
      mg."groupementId" as groupement_id,
      g.siren,
      mg."communeCode" as commune_code
    FROM "MembreGroupement" mg
    JOIN "Groupement" g ON g.id = mg."groupementId"
    WHERE g."typeGroupement" IN ('SIVU', 'SIVOM', 'SMF', 'SMO', 'PETR')
    AND g.actif = true
    ORDER BY g.siren
  `)

  console.log(`   Trouvé ${result.rows.length} liens commune-syndicat`)

  let created = 0
  let errors = 0

  for (let i = 0; i < result.rows.length; i += BATCH_SIZE) {
    const batch = result.rows.slice(i, i + BATCH_SIZE)

    for (const lien of batch) {
      try {
        // Vérifier que la commune existe
        const communeExists = await prismaTerritoires.commune.findUnique({
          where: { code: lien.commune_code },
          select: { code: true },
        })

        if (!communeExists) {
          errors++
          continue
        }

        // Vérifier que le groupement existe
        const groupementExists = await prismaTerritoires.groupement.findUnique({
          where: { siren: lien.siren },
          select: { siren: true },
        })

        if (!groupementExists) {
          errors++
          continue
        }

        await prismaTerritoires.communeGroupement.upsert({
          where: {
            communeCode_groupementSiren: {
              communeCode: lien.commune_code,
              groupementSiren: lien.siren,
            },
          },
          create: {
            communeCode: lien.commune_code,
            groupementSiren: lien.siren,
          },
          update: {},
        })
        created++
      } catch (e) {
        errors++
      }
    }

    console.log(`   ... ${created}/${result.rows.length} liens créés`)
    await sleep(PAUSE_MS / 2) // Moins de pause pour les liens
  }

  await carteClient.end()
  console.log(`   ✅ ${created} liens créés, ${errors} erreurs`)
}

// ============================================
// GÉNÉRATION GÉOMÉTRIES PAR UNION
// ============================================
async function generateSyndicatGeometries(): Promise<void> {
  console.log('\n📍 Génération des GÉOMÉTRIES syndicats par union...')
  console.log(`   Pause entre générations: ${GEOMETRY_PAUSE_MS}ms`)

  // Récupérer les syndicats sans géométrie
  const syndicats = await prismaTerritoires.$queryRaw<Array<{ siren: string; nom: string; nb_membres: bigint }>>`
    SELECT
      g.siren,
      g.nom,
      COUNT(cg.commune_code) as nb_membres
    FROM groupement g
    LEFT JOIN commune_groupement cg ON cg.groupement_siren = g.siren
    WHERE g.type IN ('SYNDICAT', 'SYNDICAT_MIXTE', 'PETR')
    AND g.geometry IS NULL
    GROUP BY g.siren, g.nom
    HAVING COUNT(cg.commune_code) > 0
    ORDER BY COUNT(cg.commune_code) ASC
  `

  console.log(`   ${syndicats.length} syndicats à traiter`)

  let processed = 0
  let success = 0
  let errors = 0

  for (const syndicat of syndicats) {
    try {
      // Générer la géométrie par ST_Union des communes membres
      await prismaTerritoires.$executeRaw`
        UPDATE groupement SET
          geometry = (
            SELECT ST_Multi(ST_Union(c.geometry))
            FROM commune c
            JOIN commune_groupement cg ON cg.commune_code = c.code
            WHERE cg.groupement_siren = ${syndicat.siren}
            AND c.geometry IS NOT NULL
          ),
          centroid = (
            SELECT ST_Centroid(ST_Union(c.geometry))
            FROM commune c
            JOIN commune_groupement cg ON cg.commune_code = c.code
            WHERE cg.groupement_siren = ${syndicat.siren}
            AND c.geometry IS NOT NULL
          )
        WHERE siren = ${syndicat.siren}
      `
      success++
    } catch (e) {
      console.warn(`   ⚠️ Erreur géométrie ${syndicat.siren}: ${e}`)
      errors++
    }

    processed++

    if (processed % 100 === 0) {
      console.log(`   ... ${processed}/${syndicats.length} (${success} ok, ${errors} erreurs)`)
    }

    // Pause pour CPU
    await sleep(GEOMETRY_PAUSE_MS)
  }

  console.log(`   ✅ ${success} géométries générées, ${errors} erreurs`)
}

// ============================================
// MAIN
// ============================================
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const runAll = args.includes('--all') || args.length === 0

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║   API Territoires - Import Syndicats CARTE         ║')
  console.log('║   ⚠️  ATTENTION: Script CPU-intensif               ║')
  console.log('║   Utiliser: run-limited -c 30 npx tsx ...          ║')
  console.log('╚════════════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    if (runAll || args.includes('--import')) {
      await importSyndicatsFromCarte()
      await importMembresSyndicats()
    }

    if (runAll || args.includes('--geometries')) {
      await generateSyndicatGeometries()
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1)

    console.log('\n════════════════════════════════════════════════════')
    console.log(`✅ Import terminé en ${duration} minutes`)

    // Stats finales
    const stats = await prismaTerritoires.$queryRaw<Array<{ type: string; total: bigint; with_geom: bigint }>>`
      SELECT
        type::text,
        COUNT(*) as total,
        COUNT(geometry) as with_geom
      FROM groupement
      GROUP BY type
      ORDER BY total DESC
    `

    console.log('\n📊 Statistiques groupements:')
    for (const stat of stats) {
      console.log(`   - ${stat.type}: ${stat.total} (${stat.with_geom} avec géométrie)`)
    }
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  } finally {
    await prismaTerritoires.$disconnect()
  }
}

main()
