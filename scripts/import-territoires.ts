/**
 * Script d'import des territoires depuis les APIs publiques
 *
 * Sources:
 * - geo.api.gouv.fr : regions, departements, communes
 * - BANATIC (data.gouv.fr) : groupements (EPCI, syndicats)
 *
 * Usage:
 *   npx tsx scripts/import-territoires.ts [--regions] [--departements] [--communes] [--groupements] [--all]
 */

import { PrismaClient, TypeGroupement } from '@prisma/client'

const prisma = new PrismaClient()

// ============================================
// CONFIGURATION
// ============================================
const GEO_API = 'https://geo.api.gouv.fr'
const BANATIC_URL = 'https://www.banatic.interieur.gouv.fr/V5/fichiers-en-téléchargement/télécharger.php'

// Pause entre les requetes pour eviter le rate limiting
const DELAY_MS = 100

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// ============================================
// CACHE INVALIDATION
// ============================================
async function invalidateCacheAfterImport(): Promise<void> {
  console.log('\n🗑️  Invalidation du cache Redis...')
  try {
    const response = await fetch('http://localhost:3020/api/v1/territoires/cache', {
      method: 'DELETE',
    })
    if (response.ok) {
      const result = (await response.json()) as { invalidated: number }
      console.log(`   ✅ Cache invalidé: ${result.invalidated} entrées supprimées`)
    } else {
      console.warn(`   ⚠️ Réponse inattendue: ${response.status}`)
    }
  } catch (err) {
    console.warn("   ⚠️ Impossible d'invalider le cache (Redis non disponible ou API non démarrée)")
  }
}

// ============================================
// IMPORT REGIONS
// ============================================
async function importRegions(): Promise<void> {
  console.log('\n📍 Import des REGIONS...')

  const response = await fetch(`${GEO_API}/regions`)
  if (!response.ok) throw new Error(`Erreur API regions: ${response.status}`)

  const regions = (await response.json()) as Array<{
    code: string
    nom: string
    codeChefLieu?: string
  }>

  console.log(`   Trouvé ${regions.length} régions`)

  for (const region of regions) {
    await prisma.region.upsert({
      where: { code: region.code },
      create: {
        code: region.code,
        nom: region.nom,
        chefLieu: region.codeChefLieu,
      },
      update: {
        nom: region.nom,
        chefLieu: region.codeChefLieu,
      },
    })
  }

  console.log(`   ✅ ${regions.length} régions importées`)
}

// ============================================
// IMPORT DEPARTEMENTS
// ============================================
async function importDepartements(): Promise<void> {
  console.log('\n📍 Import des DEPARTEMENTS...')

  const response = await fetch(`${GEO_API}/departements`)
  if (!response.ok) throw new Error(`Erreur API departements: ${response.status}`)

  const departements = (await response.json()) as Array<{
    code: string
    nom: string
    codeRegion: string
    codeChefLieu?: string
  }>

  console.log(`   Trouvé ${departements.length} départements`)

  for (const dept of departements) {
    await prisma.departement.upsert({
      where: { code: dept.code },
      create: {
        code: dept.code,
        nom: dept.nom,
        codeRegion: dept.codeRegion,
        chefLieu: dept.codeChefLieu,
      },
      update: {
        nom: dept.nom,
        codeRegion: dept.codeRegion,
        chefLieu: dept.codeChefLieu,
      },
    })
  }

  console.log(`   ✅ ${departements.length} départements importés`)
}

// ============================================
// IMPORT COMMUNES
// ============================================
async function importCommunes(): Promise<void> {
  console.log('\n📍 Import des COMMUNES...')

  // Recuperer la liste des departements
  const departements = await prisma.departement.findMany({
    select: { code: true, codeRegion: true },
  })

  let totalCommunes = 0

  for (const dept of departements) {
    console.log(`   Département ${dept.code}...`)

    const response = await fetch(
      `${GEO_API}/departements/${dept.code}/communes?fields=code,nom,codesPostaux,population,surface,centre`
    )

    if (!response.ok) {
      console.warn(`   ⚠️ Erreur dept ${dept.code}: ${response.status}`)
      continue
    }

    const communes = (await response.json()) as Array<{
      code: string
      nom: string
      codesPostaux?: string[]
      population?: number
      surface?: number // hectares
      centre?: { type: string; coordinates: [number, number] }
    }>

    for (const commune of communes) {
      await prisma.commune.upsert({
        where: { code: commune.code },
        create: {
          code: commune.code,
          nom: commune.nom,
          codeDepartement: dept.code,
          codeRegion: dept.codeRegion,
          codesPostaux: commune.codesPostaux || [],
          population: commune.population,
          superficie: commune.surface ? commune.surface / 100 : null, // hectares -> km2
          longitude: commune.centre?.coordinates[0],
          latitude: commune.centre?.coordinates[1],
        },
        update: {
          nom: commune.nom,
          codesPostaux: commune.codesPostaux || [],
          population: commune.population,
          superficie: commune.surface ? commune.surface / 100 : null,
          longitude: commune.centre?.coordinates[0],
          latitude: commune.centre?.coordinates[1],
        },
      })
    }

    totalCommunes += communes.length
    await sleep(DELAY_MS)
  }

  console.log(`   ✅ ${totalCommunes} communes importées`)
}

// ============================================
// IMPORT GROUPEMENTS (EPCI) depuis geo.api.gouv.fr
// ============================================
async function importGroupements(): Promise<void> {
  console.log('\n📍 Import des GROUPEMENTS (EPCI)...')

  const response = await fetch(`${GEO_API}/epcis?fields=code,nom,population`)
  if (!response.ok) throw new Error(`Erreur API EPCI: ${response.status}`)

  const epcis = (await response.json()) as Array<{
    code: string // SIREN
    nom: string
    population?: number
  }>

  console.log(`   Trouvé ${epcis.length} EPCI`)

  let imported = 0

  for (const epci of epcis) {
    // Recuperer les details avec les communes membres
    const detailResponse = await fetch(
      `${GEO_API}/epcis/${epci.code}?fields=code,nom,population,codesDepartements,codesRegions`
    )

    if (!detailResponse.ok) {
      console.warn(`   ⚠️ Erreur EPCI ${epci.code}`)
      continue
    }

    const detail = (await detailResponse.json()) as {
      code: string
      nom: string
      population?: number
      codesDepartements?: string[]
      codesRegions?: string[]
    }

    // Determiner le type (par defaut CC, sera affine si on a plus d'infos)
    let type: TypeGroupement = 'EPCI_CC'
    const nomLower = detail.nom.toLowerCase()
    if (nomLower.includes('métropole') || nomLower.includes('metropole')) {
      type = 'EPCI_METROPOLE'
    } else if (
      nomLower.includes('communauté urbaine') ||
      nomLower.includes('communaute urbaine') ||
      nomLower.includes(' cu ')
    ) {
      type = 'EPCI_CU'
    } else if (
      nomLower.includes("communauté d'agglomération") ||
      nomLower.includes("communaute d'agglomeration") ||
      nomLower.includes(' ca ')
    ) {
      type = 'EPCI_CA'
    }

    await prisma.groupement.upsert({
      where: { siren: detail.code },
      create: {
        siren: detail.code,
        nom: detail.nom,
        type: type,
        population: detail.population,
        codeRegion: detail.codesRegions?.[0],
      },
      update: {
        nom: detail.nom,
        type: type,
        population: detail.population,
        codeRegion: detail.codesRegions?.[0],
      },
    })

    // Recuperer les communes membres
    const membresResponse = await fetch(`${GEO_API}/epcis/${epci.code}/communes?fields=code,nom`)
    if (membresResponse.ok) {
      const membres = (await membresResponse.json()) as Array<{ code: string; nom: string }>

      // Mettre a jour le nombre de communes
      await prisma.groupement.update({
        where: { siren: detail.code },
        data: { nbCommunes: membres.length },
      })

      // Creer les liens commune-groupement
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
    if (imported % 100 === 0) {
      console.log(`   ... ${imported}/${epcis.length}`)
    }

    await sleep(DELAY_MS)
  }

  console.log(`   ✅ ${imported} groupements importés`)
}

// ============================================
// GENERER LES ALIAS
// ============================================
async function generateAliases(): Promise<void> {
  console.log('\n📍 Génération des ALIAS...')

  // Alias pour les regions
  const regions = await prisma.region.findMany()
  for (const region of regions) {
    await prisma.alias
      .upsert({
        where: { id: -1 }, // Force create
        create: {
          alias: region.nom,
          aliasNorm: normalizeString(region.nom),
          codeOfficiel: region.code,
          type: 'region',
          source: 'import',
        },
        update: {},
      })
      .catch(() => {
        // Ignore duplicates
      })
  }

  // Alias pour les departements
  const departements = await prisma.departement.findMany()
  for (const dept of departements) {
    await prisma.alias
      .create({
        data: {
          alias: dept.nom,
          aliasNorm: normalizeString(dept.nom),
          codeOfficiel: dept.code,
          type: 'departement',
          source: 'import',
        },
      })
      .catch(() => {})

    // Alias avec le numero
    await prisma.alias
      .create({
        data: {
          alias: `${dept.code} - ${dept.nom}`,
          aliasNorm: normalizeString(`${dept.code} ${dept.nom}`),
          codeOfficiel: dept.code,
          type: 'departement',
          source: 'import',
        },
      })
      .catch(() => {})
  }

  // Alias pour les communes
  const communes = await prisma.commune.findMany()
  for (const commune of communes) {
    await prisma.alias
      .create({
        data: {
          alias: commune.nom,
          aliasNorm: normalizeString(commune.nom),
          codeOfficiel: commune.code,
          type: 'commune',
          source: 'import',
        },
      })
      .catch(() => {})
  }

  // Alias pour les groupements
  const groupements = await prisma.groupement.findMany()
  for (const groupement of groupements) {
    await prisma.alias
      .create({
        data: {
          alias: groupement.nom,
          aliasNorm: normalizeString(groupement.nom),
          codeOfficiel: groupement.siren,
          type: 'groupement',
          source: 'import',
        },
      })
      .catch(() => {})
  }

  const totalAliases = await prisma.alias.count()
  console.log(`   ✅ ${totalAliases} alias générés`)
}

// ============================================
// AJOUTER COLONNES GEOMETRY (PostGIS)
// ============================================
async function setupPostGIS(): Promise<void> {
  console.log('\n📍 Configuration PostGIS...')

  // Activer l'extension
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS postgis;`)

  // Ajouter colonnes geometry si elles n'existent pas
  const tables = ['region', 'departement', 'commune', 'groupement']

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS geometry geometry(MultiPolygon, 4326);
      `)
      await prisma.$executeRawUnsafe(`
        ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS centroid geometry(Point, 4326);
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS ${table}_geometry_idx ON ${table} USING GIST (geometry);
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS ${table}_centroid_idx ON ${table} USING GIST (centroid);
      `)
    } catch (e) {
      // Column may already exist
    }
  }

  console.log('   ✅ PostGIS configuré')
}

// ============================================
// IMPORT GEOMETRIES
// ============================================
async function importGeometries(): Promise<void> {
  console.log('\n📍 Import des GEOMETRIES...')

  // Regions
  console.log('   Régions...')
  const regions = await prisma.region.findMany()
  for (const region of regions) {
    try {
      const response = await fetch(`${GEO_API}/regions/${region.code}?fields=contour`)
      if (response.ok) {
        const data = (await response.json()) as { contour?: { type: string; coordinates: unknown } }
        if (data.contour) {
          await prisma.$executeRawUnsafe(`
            UPDATE region SET
              geometry = ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(data.contour)}'), 4326),
              centroid = ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(data.contour)}'), 4326))
            WHERE code = '${region.code}'
          `)
        }
      }
    } catch (e) {
      console.warn(`   ⚠️ Géométrie région ${region.code}: ${e}`)
    }
    await sleep(DELAY_MS)
  }

  // Departements
  console.log('   Départements...')
  const departements = await prisma.departement.findMany()
  for (const dept of departements) {
    try {
      const response = await fetch(`${GEO_API}/departements/${dept.code}?fields=contour`)
      if (response.ok) {
        const data = (await response.json()) as { contour?: { type: string; coordinates: unknown } }
        if (data.contour) {
          await prisma.$executeRawUnsafe(`
            UPDATE departement SET
              geometry = ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(data.contour)}'), 4326),
              centroid = ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(data.contour)}'), 4326))
            WHERE code = '${dept.code}'
          `)
        }
      }
    } catch (e) {
      console.warn(`   ⚠️ Géométrie dept ${dept.code}: ${e}`)
    }
    await sleep(DELAY_MS)
  }

  // Communes (seulement les centroïdes pour l'instant)
  console.log('   Communes (centroïdes)...')
  await prisma.$executeRawUnsafe(`
    UPDATE commune SET
      centroid = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    WHERE longitude IS NOT NULL AND latitude IS NOT NULL
  `)

  console.log('   ✅ Géométries importées')
}

// ============================================
// MAIN
// ============================================
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const runAll = args.includes('--all') || args.length === 0

  console.log('╔════════════════════════════════════════════╗')
  console.log('║   API Territoires - Import des données     ║')
  console.log('╚════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    // Toujours configurer PostGIS d'abord
    await setupPostGIS()

    if (runAll || args.includes('--regions')) {
      await importRegions()
    }

    if (runAll || args.includes('--departements')) {
      await importDepartements()
    }

    if (runAll || args.includes('--communes')) {
      await importCommunes()
    }

    if (runAll || args.includes('--groupements')) {
      await importGroupements()
    }

    if (runAll || args.includes('--geometries')) {
      await importGeometries()
    }

    if (runAll || args.includes('--aliases')) {
      await generateAliases()
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    // Invalider le cache Redis après import
    await invalidateCacheAfterImport()

    console.log('\n════════════════════════════════════════════')
    console.log(`✅ Import terminé en ${duration}s`)

    // Stats finales
    const stats = {
      regions: await prisma.region.count(),
      departements: await prisma.departement.count(),
      communes: await prisma.commune.count(),
      groupements: await prisma.groupement.count(),
      aliases: await prisma.alias.count(),
    }

    console.log('\n📊 Statistiques:')
    console.log(`   - Régions: ${stats.regions}`)
    console.log(`   - Départements: ${stats.departements}`)
    console.log(`   - Communes: ${stats.communes}`)
    console.log(`   - Groupements: ${stats.groupements}`)
    console.log(`   - Alias: ${stats.aliases}`)
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
