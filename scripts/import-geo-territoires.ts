/**
 * Script d'import des données géographiques territoriales
 *
 * Sources: geo.api.gouv.fr
 *
 * Données importées:
 * - Régions (18) avec géométrie et centroïde
 * - Départements (101) avec géométrie et centroïde
 * - Communes (~35000) avec géométrie et centroïde
 *
 * Usage:
 * DATABASE_URL="postgresql://..." npx tsx scripts/import-geo-territoires.ts
 *
 * Options:
 * --regions-only    : Importer uniquement les régions
 * --departements-only : Importer uniquement les départements
 * --communes-only   : Importer uniquement les communes
 * --dry-run         : Afficher les stats sans importer
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Configuration
const GEO_API_BASE = 'https://geo.api.gouv.fr'
const BATCH_SIZE = 100 // Nombre de communes par batch pour insertion
const DELAY_BETWEEN_BATCHES = 100 // ms entre les batches
const MAX_RETRIES = 3

// Types
interface GeoRegion {
  code: string
  nom: string
  _score?: number
}

interface GeoDepartement {
  code: string
  nom: string
  codeRegion: string
  _score?: number
}

interface GeoCommune {
  code: string
  nom: string
  codeDepartement: string
  codeRegion: string
  codesPostaux: string[]
  population?: number
  centre?: {
    type: 'Point'
    coordinates: [number, number] // [lng, lat]
  }
  contour?: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
}

interface GeoRegionDetailed extends GeoRegion {
  centre?: {
    type: 'Point'
    coordinates: [number, number]
  }
  contour?: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
}

interface GeoDepartementDetailed extends GeoDepartement {
  centre?: {
    type: 'Point'
    coordinates: [number, number]
  }
  contour?: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
}

// Helpers
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry<T>(url: string, retries = MAX_RETRIES): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error(`  Tentative ${i + 1}/${retries} échouée pour ${url}:`, error)
      if (i < retries - 1) {
        await sleep(1000 * (i + 1)) // Backoff exponentiel
      } else {
        throw error
      }
    }
  }
  throw new Error('Max retries reached')
}

// Créer ou mettre à jour un job d'import
async function createImportJob(type: string): Promise<string> {
  const job = await prisma.territoryImportJob.create({
    data: {
      type,
      status: 'RUNNING',
      startedAt: new Date(),
      totalCount: 0,
      processedCount: 0,
      errorCount: 0,
    },
  })
  return job.id
}

async function updateImportJob(
  jobId: string,
  data: {
    status?: string
    totalCount?: number
    processedCount?: number
    errorCount?: number
    errorLog?: string
    completedAt?: Date
  }
) {
  await prisma.territoryImportJob.update({
    where: { id: jobId },
    data,
  })
}

// Import des régions
async function importRegions(dryRun: boolean = false): Promise<void> {
  console.log('\n📍 Import des régions...')

  const jobId = dryRun ? null : await createImportJob('REGIONS')

  try {
    // Récupérer la liste des régions
    const regions = await fetchWithRetry<GeoRegion[]>(`${GEO_API_BASE}/regions`)

    console.log(`  ${regions.length} régions trouvées`)

    if (!dryRun && jobId) {
      await updateImportJob(jobId, { totalCount: regions.length })
    }

    let processed = 0
    let errors = 0
    const errorMessages: string[] = []

    for (const region of regions) {
      try {
        // Récupérer les détails avec géométrie
        const detailed = await fetchWithRetry<GeoRegionDetailed>(
          `${GEO_API_BASE}/regions/${region.code}?fields=nom,code,centre,contour`
        )

        if (!dryRun) {
          await prisma.region.upsert({
            where: { code: region.code },
            create: {
              code: region.code,
              nom: detailed.nom,
              geometry: detailed.contour || null,
              centroid: detailed.centre || null,
              sourceImport: 'geo.api.gouv.fr',
              dateImport: new Date(),
            },
            update: {
              nom: detailed.nom,
              geometry: detailed.contour || null,
              centroid: detailed.centre || null,
              sourceImport: 'geo.api.gouv.fr',
              dateImport: new Date(),
            },
          })
        }

        processed++
        process.stdout.write(`\r  Progression: ${processed}/${regions.length}`)

        // Petit délai pour ne pas surcharger l'API
        await sleep(50)
      } catch (error) {
        errors++
        const msg = `Erreur région ${region.code}: ${error}`
        errorMessages.push(msg)
        console.error(`\n  ${msg}`)
      }
    }

    console.log(`\n  ✅ ${processed} régions importées, ${errors} erreurs`)

    if (!dryRun && jobId) {
      await updateImportJob(jobId, {
        status: errors > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
        processedCount: processed,
        errorCount: errors,
        errorLog: errorMessages.length > 0 ? errorMessages.join('\n') : null,
        completedAt: new Date(),
      })
    }
  } catch (error) {
    console.error('  ❌ Erreur import régions:', error)
    if (!dryRun && jobId) {
      await updateImportJob(jobId, {
        status: 'FAILED',
        errorLog: String(error),
        completedAt: new Date(),
      })
    }
    throw error
  }
}

// Import des départements
async function importDepartements(dryRun: boolean = false): Promise<void> {
  console.log('\n📍 Import des départements...')

  const jobId = dryRun ? null : await createImportJob('DEPARTEMENTS')

  try {
    // Récupérer la liste des départements
    const departements = await fetchWithRetry<GeoDepartement[]>(`${GEO_API_BASE}/departements`)

    console.log(`  ${departements.length} départements trouvés`)

    if (!dryRun && jobId) {
      await updateImportJob(jobId, { totalCount: departements.length })
    }

    let processed = 0
    let errors = 0
    const errorMessages: string[] = []

    for (const dept of departements) {
      try {
        // Récupérer les détails avec géométrie
        const detailed = await fetchWithRetry<GeoDepartementDetailed>(
          `${GEO_API_BASE}/departements/${dept.code}?fields=nom,code,codeRegion,centre,contour`
        )

        if (!dryRun) {
          await prisma.departement.upsert({
            where: { code: dept.code },
            create: {
              code: dept.code,
              nom: detailed.nom,
              regionCode: detailed.codeRegion,
              geometry: detailed.contour || null,
              centroid: detailed.centre || null,
              sourceImport: 'geo.api.gouv.fr',
              dateImport: new Date(),
            },
            update: {
              nom: detailed.nom,
              regionCode: detailed.codeRegion,
              geometry: detailed.contour || null,
              centroid: detailed.centre || null,
              sourceImport: 'geo.api.gouv.fr',
              dateImport: new Date(),
            },
          })
        }

        processed++
        process.stdout.write(`\r  Progression: ${processed}/${departements.length}`)

        await sleep(50)
      } catch (error) {
        errors++
        const msg = `Erreur département ${dept.code}: ${error}`
        errorMessages.push(msg)
        console.error(`\n  ${msg}`)
      }
    }

    console.log(`\n  ✅ ${processed} départements importés, ${errors} erreurs`)

    if (!dryRun && jobId) {
      await updateImportJob(jobId, {
        status: errors > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
        processedCount: processed,
        errorCount: errors,
        errorLog: errorMessages.length > 0 ? errorMessages.join('\n') : null,
        completedAt: new Date(),
      })
    }
  } catch (error) {
    console.error('  ❌ Erreur import départements:', error)
    if (!dryRun && jobId) {
      await updateImportJob(jobId, {
        status: 'FAILED',
        errorLog: String(error),
        completedAt: new Date(),
      })
    }
    throw error
  }
}

// Import des communes
async function importCommunes(dryRun: boolean = false): Promise<void> {
  console.log('\n📍 Import des communes...')

  const jobId = dryRun ? null : await createImportJob('COMMUNES')

  try {
    // Récupérer d'abord tous les départements pour itérer
    const departements = await fetchWithRetry<GeoDepartement[]>(`${GEO_API_BASE}/departements`)

    console.log(`  Import des communes pour ${departements.length} départements...`)

    let totalCommunes = 0
    let processed = 0
    let errors = 0
    const errorMessages: string[] = []

    // Pour chaque département, récupérer ses communes
    for (let deptIdx = 0; deptIdx < departements.length; deptIdx++) {
      const dept = departements[deptIdx]

      try {
        // Récupérer les communes du département avec géométrie
        // Note: On utilise centre car contour est trop volumineux pour toutes les communes
        const communes = await fetchWithRetry<GeoCommune[]>(
          `${GEO_API_BASE}/departements/${dept.code}/communes?fields=nom,code,codeDepartement,codeRegion,codesPostaux,population,centre`
        )

        totalCommunes += communes.length

        if (!dryRun && jobId && deptIdx === 0) {
          // Estimation du total (moyenne * nb départements)
          const estimatedTotal = communes.length * departements.length
          await updateImportJob(jobId, { totalCount: estimatedTotal })
        }

        // Traiter les communes par batch
        for (let i = 0; i < communes.length; i += BATCH_SIZE) {
          const batch = communes.slice(i, i + BATCH_SIZE)

          if (!dryRun) {
            try {
              await prisma.$transaction(
                batch.map((commune) =>
                  prisma.commune.upsert({
                    where: { codeInsee: commune.code },
                    create: {
                      codeInsee: commune.code,
                      nom: commune.nom,
                      deptCode: commune.codeDepartement,
                      population: commune.population || null,
                      codesPostaux: commune.codesPostaux || [],
                      centroid: commune.centre || null,
                      // Pas de geometry pour les communes (trop volumineux)
                      sourceImport: 'geo.api.gouv.fr',
                      dateImport: new Date(),
                    },
                    update: {
                      nom: commune.nom,
                      deptCode: commune.codeDepartement,
                      population: commune.population || null,
                      codesPostaux: commune.codesPostaux || [],
                      centroid: commune.centre || null,
                      sourceImport: 'geo.api.gouv.fr',
                      dateImport: new Date(),
                    },
                  })
                )
              )
              processed += batch.length
            } catch (error) {
              // Si le batch échoue, essayer un par un
              for (const commune of batch) {
                try {
                  await prisma.commune.upsert({
                    where: { codeInsee: commune.code },
                    create: {
                      codeInsee: commune.code,
                      nom: commune.nom,
                      deptCode: commune.codeDepartement,
                      population: commune.population || null,
                      codesPostaux: commune.codesPostaux || [],
                      centroid: commune.centre || null,
                      sourceImport: 'geo.api.gouv.fr',
                      dateImport: new Date(),
                    },
                    update: {
                      nom: commune.nom,
                      deptCode: commune.codeDepartement,
                      population: commune.population || null,
                      codesPostaux: commune.codesPostaux || [],
                      centroid: commune.centre || null,
                      sourceImport: 'geo.api.gouv.fr',
                      dateImport: new Date(),
                    },
                  })
                  processed++
                } catch (err) {
                  errors++
                  const msg = `Erreur commune ${commune.code}: ${err}`
                  errorMessages.push(msg)
                }
              }
            }
          } else {
            processed += batch.length
          }

          process.stdout.write(
            `\r  Département ${dept.code} (${deptIdx + 1}/${departements.length}): ${processed} communes`
          )

          await sleep(DELAY_BETWEEN_BATCHES)
        }
      } catch (error) {
        errors++
        const msg = `Erreur département ${dept.code}: ${error}`
        errorMessages.push(msg)
        console.error(`\n  ${msg}`)
      }
    }

    console.log(`\n  ✅ ${processed} communes importées sur ${totalCommunes}, ${errors} erreurs`)

    if (!dryRun && jobId) {
      await updateImportJob(jobId, {
        status: errors > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
        totalCount: totalCommunes,
        processedCount: processed,
        errorCount: errors,
        errorLog: errorMessages.length > 0 ? errorMessages.slice(0, 100).join('\n') : null,
        completedAt: new Date(),
      })
    }
  } catch (error) {
    console.error('  ❌ Erreur import communes:', error)
    if (!dryRun && jobId) {
      await updateImportJob(jobId, {
        status: 'FAILED',
        errorLog: String(error),
        completedAt: new Date(),
      })
    }
    throw error
  }
}

// Main
async function main() {
  console.log('🗺️  Import des données géographiques territoriales')
  console.log('================================================')
  console.log(`Source: ${GEO_API_BASE}`)

  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const regionsOnly = args.includes('--regions-only')
  const departementsOnly = args.includes('--departements-only')
  const communesOnly = args.includes('--communes-only')

  if (dryRun) {
    console.log('⚠️  Mode dry-run: aucune donnée ne sera importée')
  }

  const startTime = Date.now()

  try {
    if (!departementsOnly && !communesOnly) {
      await importRegions(dryRun)
    }

    if (!regionsOnly && !communesOnly) {
      await importDepartements(dryRun)
    }

    if (!regionsOnly && !departementsOnly) {
      await importCommunes(dryRun)
    }

    const duration = Math.round((Date.now() - startTime) / 1000)
    console.log(`\n✅ Import terminé en ${duration} secondes`)

    // Stats finales
    if (!dryRun) {
      const stats = await prisma.$transaction([
        prisma.region.count(),
        prisma.departement.count(),
        prisma.commune.count(),
      ])

      console.log('\n📊 Statistiques base de données:')
      console.log(`  - Régions: ${stats[0]}`)
      console.log(`  - Départements: ${stats[1]}`)
      console.log(`  - Communes: ${stats[2]}`)
    }
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
