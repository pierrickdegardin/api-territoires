/**
 * Script d'import API Territoires
 *
 * Importe les données territoriales françaises dans les tables:
 * - territoire (régions, départements, communes, EPCI, syndicats)
 * - territoire_membre (relations entre territoires)
 * - import_banatic (historique des imports)
 *
 * Sources:
 * - geo.api.gouv.fr: Régions, Départements, Communes
 * - data.gouv.fr/BANATIC: Groupements intercommunaux
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/import-territoires-api.ts [options]
 *
 * Options:
 *   --dry-run     Simuler sans écrire en base
 *   --skip-geo    Ne pas télécharger les géométries
 *   --verbose     Logs détaillés
 *   --regions     Importer seulement les régions
 *   --departements Importer seulement les départements
 *   --communes    Importer seulement les communes
 *   --groupements Importer seulement les groupements BANATIC
 */

import { PrismaClient, TypeTerritoire, TypeLien, SourceGeometry } from '@prisma/client'

const prisma = new PrismaClient()

// ============================================================================
// Configuration
// ============================================================================

const GEO_API = {
  regions: 'https://geo.api.gouv.fr/regions?fields=nom,code',
  departements: 'https://geo.api.gouv.fr/departements?fields=nom,code,codeRegion',
  communes: 'https://geo.api.gouv.fr/communes?fields=nom,code,codeDepartement,codeRegion,population,centre&limit=50000',
  communesByDept: (dept: string) =>
    `https://geo.api.gouv.fr/departements/${dept}/communes?fields=nom,code,codeDepartement,codeRegion,population,centre`,
}

const BANATIC_URLS = {
  groupements:
    'https://static.data.gouv.fr/resources/base-nationale-sur-les-intercommunalites/20250203-143929/liste-des-groupements-france-entiere-20250127.csv',
  perimetres:
    'https://static.data.gouv.fr/resources/base-nationale-sur-les-intercommunalites/20250203-144053/perimetre-epci-a-fp.csv',
}

// Mapping nature juridique BANATIC → TypeTerritoire
const NATURE_TO_TYPE: Record<string, TypeTerritoire> = {
  CC: TypeTerritoire.epci_cc,
  CA: TypeTerritoire.epci_ca,
  CU: TypeTerritoire.epci_cu,
  ME: TypeTerritoire.epci_metropole,
  METRO: TypeTerritoire.epci_metropole,
  MET69: TypeTerritoire.epci_metropole,
  EPT: TypeTerritoire.epci_ept,
  SIVU: TypeTerritoire.syndicat,
  SIVOM: TypeTerritoire.syndicat,
  SM: TypeTerritoire.syndicat,
  SMF: TypeTerritoire.syndicat,
  SMO: TypeTerritoire.syndicat,
  PETR: TypeTerritoire.petr,
  PAYS: TypeTerritoire.pays,
  EPAGE: TypeTerritoire.syndicat,
  POLEM: TypeTerritoire.syndicat,
}

// Syndicats d'énergie (AODE) - identifiés par leurs compétences
const SYNDICATS_ENERGIE_KEYWORDS = [
  'énergie',
  'energie',
  'électricité',
  'electricite',
  'électrique',
  'electrique',
  'aode',
  'concession',
  'distribution',
  'eclairage',
  'éclairage',
]

// ============================================================================
// Options et Stats
// ============================================================================

interface ImportOptions {
  dryRun: boolean
  skipGeo: boolean
  verbose: boolean
  regionsOnly: boolean
  departementsOnly: boolean
  communesOnly: boolean
  groupementsOnly: boolean
}

interface ImportStats {
  regions: number
  departements: number
  communes: number
  groupements: number
  membres: number
  errors: string[]
}

const stats: ImportStats = {
  regions: 0,
  departements: 0,
  communes: 0,
  groupements: 0,
  membres: 0,
  errors: [],
}

// ============================================================================
// Utilitaires
// ============================================================================

function normalizeNom(nom: string): string {
  return nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function validateSiren(siren: string): boolean {
  if (!/^\d{9}$/.test(siren)) return false

  // Checksum Luhn
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(siren[i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`)
  }
  return response.json() as Promise<T>
}

async function fetchCsv(url: string): Promise<string[][]> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`)
  }
  const text = await response.text()
  return parseCsv(text)
}

function parseCsv(text: string): string[][] {
  const lines = text.split('\n')
  return lines.map((line) => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ';' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  })
}

function log(message: string, options: ImportOptions) {
  if (options.verbose) {
    console.log(`  ${message}`)
  }
}

// ============================================================================
// Import Régions
// ============================================================================

interface GeoRegion {
  code: string
  nom: string
}

async function importRegions(options: ImportOptions): Promise<void> {
  console.log('\n📍 Importing Regions...')

  const regions = await fetchJson<GeoRegion[]>(GEO_API.regions)
  console.log(`  Found ${regions.length} regions`)

  for (const region of regions) {
    try {
      if (!options.dryRun) {
        await prisma.territoire.upsert({
          where: { code: region.code },
          create: {
            code: region.code,
            type: TypeTerritoire.region,
            nom: region.nom,
            nomNormalise: normalizeNom(region.nom),
            codeRegion: region.code,
            sourceGeometry: SourceGeometry.geo_api,
          },
          update: {
            nom: region.nom,
            nomNormalise: normalizeNom(region.nom),
          },
        })
      }
      stats.regions++
      log(`✓ ${region.code} - ${region.nom}`, options)
    } catch (error) {
      stats.errors.push(`Region ${region.code}: ${error}`)
    }
  }

  console.log(`  ✅ Imported ${stats.regions} regions`)
}

// ============================================================================
// Import Départements
// ============================================================================

interface GeoDepartement {
  code: string
  nom: string
  codeRegion: string
}

async function importDepartements(options: ImportOptions): Promise<void> {
  console.log('\n📍 Importing Departements...')

  const departements = await fetchJson<GeoDepartement[]>(GEO_API.departements)
  console.log(`  Found ${departements.length} departements`)

  for (const dept of departements) {
    try {
      if (!options.dryRun) {
        // Create territoire
        await prisma.territoire.upsert({
          where: { code: dept.code },
          create: {
            code: dept.code,
            type: TypeTerritoire.departement,
            nom: dept.nom,
            nomNormalise: normalizeNom(dept.nom),
            codeDepartement: dept.code,
            codeRegion: dept.codeRegion,
            sourceGeometry: SourceGeometry.geo_api,
          },
          update: {
            nom: dept.nom,
            nomNormalise: normalizeNom(dept.nom),
            codeRegion: dept.codeRegion,
          },
        })

        // Create relation departement → region
        await prisma.territoireMembre.upsert({
          where: {
            parentCode_enfantCode: {
              parentCode: dept.codeRegion,
              enfantCode: dept.code,
            },
          },
          create: {
            parentCode: dept.codeRegion,
            enfantCode: dept.code,
            typeLien: TypeLien.appartient,
          },
          update: {},
        })
      }
      stats.departements++
      log(`✓ ${dept.code} - ${dept.nom}`, options)
    } catch (error) {
      stats.errors.push(`Departement ${dept.code}: ${error}`)
    }
  }

  console.log(`  ✅ Imported ${stats.departements} departements`)
}

// ============================================================================
// Import Communes
// ============================================================================

interface GeoCommune {
  code: string
  nom: string
  codeDepartement: string
  codeRegion: string
  population?: number
  centre?: { type: string; coordinates: [number, number] }
}

async function importCommunes(options: ImportOptions): Promise<void> {
  console.log('\n📍 Importing Communes...')

  // Get list of departements
  const departements = await fetchJson<GeoDepartement[]>(GEO_API.departements)
  let totalCommunes = 0

  for (const dept of departements) {
    try {
      const communes = await fetchJson<GeoCommune[]>(GEO_API.communesByDept(dept.code))
      log(`  Processing ${dept.code} - ${communes.length} communes`, options)

      for (const commune of communes) {
        try {
          if (!options.dryRun) {
            // Build centroid SQL if available
            const centroidData = commune.centre ? { coordinates: commune.centre.coordinates } : null

            await prisma.territoire.upsert({
              where: { code: commune.code },
              create: {
                code: commune.code,
                type: TypeTerritoire.commune,
                nom: commune.nom,
                nomNormalise: normalizeNom(commune.nom),
                codeDepartement: commune.codeDepartement,
                codeRegion: commune.codeRegion,
                population: commune.population ?? null,
                sourceGeometry: centroidData ? SourceGeometry.geo_api : null,
              },
              update: {
                nom: commune.nom,
                nomNormalise: normalizeNom(commune.nom),
                population: commune.population ?? null,
              },
            })

            // Update centroid via raw SQL if available
            if (centroidData) {
              await prisma.$executeRaw`
                UPDATE territoire
                SET centroid = ST_SetSRID(ST_MakePoint(${centroidData.coordinates[0]}, ${centroidData.coordinates[1]}), 4326)
                WHERE code = ${commune.code}
              `
            }

            // Create relation commune → departement
            await prisma.territoireMembre.upsert({
              where: {
                parentCode_enfantCode: {
                  parentCode: commune.codeDepartement,
                  enfantCode: commune.code,
                },
              },
              create: {
                parentCode: commune.codeDepartement,
                enfantCode: commune.code,
                typeLien: TypeLien.appartient,
              },
              update: {},
            })
          }
          stats.communes++
          totalCommunes++
        } catch (error) {
          stats.errors.push(`Commune ${commune.code}: ${error}`)
        }
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      stats.errors.push(`Dept ${dept.code} communes: ${error}`)
    }
  }

  console.log(`  ✅ Imported ${stats.communes} communes`)
}

// ============================================================================
// Import Groupements BANATIC
// ============================================================================

async function importGroupements(options: ImportOptions): Promise<void> {
  console.log('\n📍 Importing Groupements BANATIC...')

  // Download CSV
  console.log('  Downloading groupements CSV...')
  const rows = await fetchCsv(BANATIC_URLS.groupements)
  const header = rows[0]
  const data = rows.slice(1).filter((row) => row.length > 5)

  console.log(`  Found ${data.length} groupements`)

  // Find column indices
  const cols = {
    siren: header.findIndex((h) => h.toLowerCase().includes('siren')),
    nom: header.findIndex((h) => h.toLowerCase() === 'nom' || h.toLowerCase().includes('nom du groupement')),
    nature: header.findIndex((h) => h.toLowerCase().includes('nature juridique')),
    dateCreation: header.findIndex((h) => h.toLowerCase().includes('date de création')),
    population: header.findIndex((h) => h.toLowerCase().includes('population')),
    departement: header.findIndex((h) => h.toLowerCase().includes('département')),
  }

  log(`  Column indices: ${JSON.stringify(cols)}`, options)

  for (const row of data) {
    try {
      const siren = row[cols.siren]?.trim()
      const nom = row[cols.nom]?.trim()
      const nature = row[cols.nature]?.trim().toUpperCase()

      if (!siren || !nom || !nature) continue

      // Validate SIREN
      if (!validateSiren(siren)) {
        log(`  ⚠ Invalid SIREN: ${siren} - ${nom}`, options)
        continue
      }

      // Map nature to type
      let type = NATURE_TO_TYPE[nature]
      if (!type) {
        log(`  ⚠ Unknown nature: ${nature} for ${siren}`, options)
        type = TypeTerritoire.syndicat // Default
      }

      // Check if syndicat d'énergie
      const nomLower = nom.toLowerCase()
      const isEnergySyndicat = SYNDICATS_ENERGIE_KEYWORDS.some((kw) => nomLower.includes(kw))
      if (isEnergySyndicat && type === TypeTerritoire.syndicat) {
        type = TypeTerritoire.syndicat_energie
      }

      const population = parseInt(row[cols.population]) || null

      if (!options.dryRun) {
        await prisma.territoire.upsert({
          where: { code: siren },
          create: {
            code: siren,
            type,
            nom,
            nomNormalise: normalizeNom(nom),
            population,
            metadata: {
              natureJuridique: nature,
              dateCreation: row[cols.dateCreation] || null,
              departementSiege: row[cols.departement] || null,
            },
          },
          update: {
            nom,
            nomNormalise: normalizeNom(nom),
            population,
            type,
          },
        })
      }

      stats.groupements++
      if (stats.groupements % 1000 === 0) {
        console.log(`  ... ${stats.groupements} groupements processed`)
      }
    } catch (error) {
      stats.errors.push(`Groupement: ${error}`)
    }
  }

  console.log(`  ✅ Imported ${stats.groupements} groupements`)
}

// ============================================================================
// Import Membres (relations commune → groupement)
// ============================================================================

async function importMembres(options: ImportOptions): Promise<void> {
  console.log('\n📍 Importing Membres (commune → groupement)...')

  console.log('  Downloading perimetres CSV...')
  const rows = await fetchCsv(BANATIC_URLS.perimetres)
  const header = rows[0]
  const data = rows.slice(1).filter((row) => row.length > 3)

  console.log(`  Found ${data.length} membership records`)

  // Find column indices
  const cols = {
    sirenGroupement: header.findIndex(
      (h) => h.toLowerCase().includes('siren') && h.toLowerCase().includes('groupement')
    ),
    codeInsee: header.findIndex((h) => h.toLowerCase().includes('insee') || h.toLowerCase().includes('code commune')),
  }

  // Fallback column detection
  if (cols.sirenGroupement === -1) {
    cols.sirenGroupement = header.findIndex((h) => h.toLowerCase().includes('siren'))
  }
  if (cols.codeInsee === -1) {
    cols.codeInsee = header.findIndex((h) => h.toLowerCase().includes('commune'))
  }

  log(`  Column indices: ${JSON.stringify(cols)}`, options)

  for (const row of data) {
    try {
      const sirenGroupement = row[cols.sirenGroupement]?.trim()
      const codeInsee = row[cols.codeInsee]?.trim()

      if (!sirenGroupement || !codeInsee) continue

      // Verify both exist
      const [groupement, commune] = await Promise.all([
        prisma.territoire.findUnique({ where: { code: sirenGroupement }, select: { code: true } }),
        prisma.territoire.findUnique({ where: { code: codeInsee }, select: { code: true } }),
      ])

      if (!groupement) {
        log(`  ⚠ Groupement not found: ${sirenGroupement}`, options)
        continue
      }
      if (!commune) {
        log(`  ⚠ Commune not found: ${codeInsee}`, options)
        continue
      }

      if (!options.dryRun) {
        await prisma.territoireMembre.upsert({
          where: {
            parentCode_enfantCode: {
              parentCode: sirenGroupement,
              enfantCode: codeInsee,
            },
          },
          create: {
            parentCode: sirenGroupement,
            enfantCode: codeInsee,
            typeLien: TypeLien.membre,
          },
          update: {},
        })
      }

      stats.membres++
      if (stats.membres % 5000 === 0) {
        console.log(`  ... ${stats.membres} membres processed`)
      }
    } catch (error) {
      // Ignore duplicate key errors (already exists)
      if (!String(error).includes('Unique constraint')) {
        stats.errors.push(`Membre: ${error}`)
      }
    }
  }

  console.log(`  ✅ Imported ${stats.membres} membre relations`)
}

// ============================================================================
// Create Import Record
// ============================================================================

async function createImportRecord(options: ImportOptions): Promise<void> {
  if (options.dryRun) return

  const now = new Date()
  const version = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  await prisma.importBanatic.create({
    data: {
      version,
      fichierSource: 'geo.api.gouv.fr + data.gouv.fr/BANATIC',
      nbGroupements: stats.groupements,
      nbMembres: stats.membres,
      stats: {
        regions: stats.regions,
        departements: stats.departements,
        communes: stats.communes,
        groupements: stats.groupements,
        membres: stats.membres,
        errors: stats.errors.length,
      },
    },
  })

  console.log(`\n📝 Created import record: version ${version}`)
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('  API TERRITOIRES - Import Script')
  console.log('='.repeat(60))

  // Parse options
  const args = process.argv.slice(2)
  const options: ImportOptions = {
    dryRun: args.includes('--dry-run'),
    skipGeo: args.includes('--skip-geo'),
    verbose: args.includes('--verbose'),
    regionsOnly: args.includes('--regions'),
    departementsOnly: args.includes('--departements'),
    communesOnly: args.includes('--communes'),
    groupementsOnly: args.includes('--groupements'),
  }

  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No data will be written\n')
  }

  const startTime = Date.now()

  try {
    const importAll =
      !options.regionsOnly && !options.departementsOnly && !options.communesOnly && !options.groupementsOnly

    // Import in order: regions → departements → communes → groupements → membres
    if (importAll || options.regionsOnly) {
      await importRegions(options)
    }

    if (importAll || options.departementsOnly) {
      await importDepartements(options)
    }

    if (importAll || options.communesOnly) {
      await importCommunes(options)
    }

    if (importAll || options.groupementsOnly) {
      await importGroupements(options)
      await importMembres(options)
    }

    // Create import record
    if (importAll) {
      await createImportRecord(options)
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }

  const duration = Math.round((Date.now() - startTime) / 1000)

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('  IMPORT SUMMARY')
  console.log('='.repeat(60))
  console.log(`  Regions:      ${stats.regions}`)
  console.log(`  Departements: ${stats.departements}`)
  console.log(`  Communes:     ${stats.communes}`)
  console.log(`  Groupements:  ${stats.groupements}`)
  console.log(`  Membres:      ${stats.membres}`)
  console.log(`  Errors:       ${stats.errors.length}`)
  console.log(`  Duration:     ${duration}s`)
  console.log('='.repeat(60))

  if (stats.errors.length > 0) {
    console.log('\n⚠️  Errors (first 10):')
    stats.errors.slice(0, 10).forEach((e) => console.log(`  - ${e}`))
  }

  console.log('\n✅ Import completed!')
}

main()
