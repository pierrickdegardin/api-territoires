/**
 * Script CRON de mise à jour mensuelle des données territoriales
 *
 * Ce script orchestre l'ensemble des imports territoriaux :
 * 1. Import des données géographiques (régions, départements, communes)
 * 2. Import BANATIC (groupements, membres, compétences)
 * 3. Import des géométries EPCI
 * 4. Calcul des centroïdes syndicats
 *
 * Usage:
 * DATABASE_URL="postgresql://..." npx tsx scripts/cron-territory-update.ts
 *
 * Crontab (1er du mois à 3h):
 * 0 3 1 * * cd /root/carte && DATABASE_URL="..." npx tsx scripts/cron-territory-update.ts >> /var/log/carte-territory-cron.log 2>&1
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { spawn } from 'child_process'
import * as path from 'path'

const prisma = new PrismaClient()

// Configuration
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts')

// Exécuter un script de manière asynchrone
async function runScript(scriptName: string, args: string[] = []): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const output: string[] = []
    const scriptPath = path.join(SCRIPTS_DIR, scriptName)

    console.log(`\n🔄 Exécution de ${scriptName}...`)

    const child = spawn('npx', ['tsx', scriptPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
    })

    child.stdout.on('data', (data) => {
      const str = data.toString()
      output.push(str)
      process.stdout.write(str)
    })

    child.stderr.on('data', (data) => {
      const str = data.toString()
      output.push(str)
      process.stderr.write(str)
    })

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        output: output.join(''),
      })
    })

    child.on('error', (err) => {
      output.push(`Erreur: ${err.message}`)
      resolve({
        success: false,
        output: output.join(''),
      })
    })
  })
}

// Créer un job de suivi global
async function createGlobalJob(): Promise<string> {
  const job = await prisma.territoryImportJob.create({
    data: {
      type: 'CRON_MONTHLY_UPDATE',
      status: 'RUNNING',
      startedAt: new Date(),
      totalCount: 4, // Nombre d'étapes
      processedCount: 0,
      errorCount: 0,
    },
  })
  return job.id
}

async function updateGlobalJob(
  jobId: string,
  data: {
    status?: string
    processedCount?: number
    errorCount?: number
    errorLog?: string
    completedAt?: Date
    metadata?: object
  }
) {
  await prisma.territoryImportJob.update({
    where: { id: jobId },
    data,
  })
}

// Main
async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('           CARTE - Mise à jour mensuelle des territoires       ')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`Date d'exécution: ${new Date().toLocaleString('fr-FR')}`)

  const startTime = Date.now()
  const jobId = await createGlobalJob()

  const results: Array<{ step: string; success: boolean; duration: number }> = []
  let errorCount = 0
  const errorLogs: string[] = []

  try {
    // Étape 1: Import des données géographiques (régions, départements, communes)
    console.log('\n\n📍 ÉTAPE 1/4: Données géographiques')
    console.log('────────────────────────────────────')
    const step1Start = Date.now()
    const geoResult = await runScript('import-geo-territoires.ts')
    results.push({
      step: 'Données géographiques',
      success: geoResult.success,
      duration: Math.round((Date.now() - step1Start) / 1000),
    })
    if (!geoResult.success) {
      errorCount++
      errorLogs.push(`Geo: ${geoResult.output.slice(-500)}`)
    }
    await updateGlobalJob(jobId, { processedCount: 1 })

    // Étape 2: Import BANATIC
    console.log('\n\n📍 ÉTAPE 2/4: Données BANATIC')
    console.log('────────────────────────────────────')
    const step2Start = Date.now()
    const banaticResult = await runScript('import-banatic.ts', ['--update'])
    results.push({
      step: 'BANATIC',
      success: banaticResult.success,
      duration: Math.round((Date.now() - step2Start) / 1000),
    })
    if (!banaticResult.success) {
      errorCount++
      errorLogs.push(`BANATIC: ${banaticResult.output.slice(-500)}`)
    }
    await updateGlobalJob(jobId, { processedCount: 2 })

    // Étape 3: Géométries EPCI
    console.log('\n\n📍 ÉTAPE 3/4: Géométries EPCI')
    console.log('────────────────────────────────────')
    const step3Start = Date.now()
    const epciResult = await runScript('import-epci-geometry.ts')
    results.push({
      step: 'Géométries EPCI',
      success: epciResult.success,
      duration: Math.round((Date.now() - step3Start) / 1000),
    })
    if (!epciResult.success) {
      errorCount++
      errorLogs.push(`EPCI: ${epciResult.output.slice(-500)}`)
    }
    await updateGlobalJob(jobId, { processedCount: 3 })

    // Étape 4: Services publics (DDT/DREAL/ADIL)
    console.log('\n\n📍 ÉTAPE 4/4: Services publics')
    console.log('────────────────────────────────────')
    const step4Start = Date.now()
    const servicesResult = await runScript('reimport-services-publics.ts')
    results.push({
      step: 'Services publics',
      success: servicesResult.success,
      duration: Math.round((Date.now() - step4Start) / 1000),
    })
    if (!servicesResult.success) {
      errorCount++
      errorLogs.push(`Services: ${servicesResult.output.slice(-500)}`)
    }
    await updateGlobalJob(jobId, { processedCount: 4 })
  } catch (error) {
    errorCount++
    errorLogs.push(`Fatal: ${error}`)
  }

  // Résumé final
  const totalDuration = Math.round((Date.now() - startTime) / 1000)

  console.log('\n\n═══════════════════════════════════════════════════════════════')
  console.log('                         RÉSUMÉ                                 ')
  console.log('═══════════════════════════════════════════════════════════════')

  for (const result of results) {
    const status = result.success ? '✅' : '❌'
    console.log(`${status} ${result.step}: ${result.duration}s`)
  }

  console.log('───────────────────────────────────────────────────────────────')
  console.log(`Durée totale: ${totalDuration}s`)
  console.log(`Étapes réussies: ${results.filter((r) => r.success).length}/${results.length}`)
  console.log(`Erreurs: ${errorCount}`)

  // Statistiques finales
  const stats = await prisma.$transaction([
    prisma.region.count(),
    prisma.departement.count(),
    prisma.commune.count(),
    prisma.groupement.count(),
    prisma.groupement.count({ where: { centroid: { not: Prisma.JsonNull } } }),
  ])

  console.log('\n📊 Statistiques base de données:')
  console.log(`  - Régions: ${stats[0]}`)
  console.log(`  - Départements: ${stats[1]}`)
  console.log(`  - Communes: ${stats[2]}`)
  console.log(`  - Groupements: ${stats[3]} (${stats[4]} avec coordonnées)`)

  // Mise à jour du job final
  await updateGlobalJob(jobId, {
    status: errorCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
    errorCount,
    errorLog: errorLogs.length > 0 ? errorLogs.join('\n\n') : undefined,
    completedAt: new Date(),
    metadata: {
      totalDuration,
      steps: results,
    },
  })

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log(errorCount > 0 ? '⚠️  Terminé avec des erreurs' : '✅ Terminé avec succès')
  console.log('═══════════════════════════════════════════════════════════════')

  await prisma.$disconnect()
  process.exit(errorCount > 0 ? 1 : 0)
}

main()
