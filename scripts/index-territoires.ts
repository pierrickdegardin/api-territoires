/**
 * Script d'indexation des territoires dans Meilisearch
 *
 * Charge tous les territoires depuis PostgreSQL et les indexe
 * dans Meilisearch pour la recherche fuzzy.
 *
 * Usage:
 *   DATABASE_URL="..." MEILISEARCH_HOST="..." npx tsx scripts/index-territoires.ts
 *
 * Options:
 *   --clear    Vide l'index avant d'indexer
 *   --verbose  Logs détaillés
 */

import { PrismaClient } from '@prisma/client'
import { MeiliSearch } from 'meilisearch'

const prisma = new PrismaClient()

// Configuration
const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700'
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || ''
const TERRITOIRES_INDEX = 'territoires'
const BATCH_SIZE = 1000

// Index configuration
const INDEX_CONFIG = {
  primaryKey: 'code',
  searchableAttributes: ['nom', 'nomNormalise', 'aliases'],
  filterableAttributes: ['type', 'codeDepartement', 'codeRegion'],
  sortableAttributes: ['population', 'nom'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: {
      oneTypo: 4,
      twoTypos: 8,
    },
  },
  pagination: {
    maxTotalHits: 10000,
  },
}

interface TerritoireDocument {
  code: string
  nom: string
  nomNormalise: string
  type: string
  codeDepartement?: string
  codeRegion?: string
  population?: number
  aliases: string[]
}

async function main() {
  console.log('='.repeat(60))
  console.log('  TERRITOIRES - Meilisearch Indexation')
  console.log('='.repeat(60))

  const args = process.argv.slice(2)
  const clearIndex = args.includes('--clear')
  const verbose = args.includes('--verbose')

  // Connect to Meilisearch
  console.log(`\n📡 Connecting to Meilisearch at ${MEILISEARCH_HOST}...`)
  const meili = new MeiliSearch({
    host: MEILISEARCH_HOST,
    apiKey: MEILISEARCH_API_KEY,
  })

  try {
    const health = await meili.health()
    console.log(`   ✅ Meilisearch status: ${health.status}`)
  } catch (error) {
    console.error(`   ❌ Cannot connect to Meilisearch: ${error}`)
    process.exit(1)
  }

  // Create or get index
  console.log(`\n📦 Setting up index "${TERRITOIRES_INDEX}"...`)
  try {
    await meili.createIndex(TERRITOIRES_INDEX, { primaryKey: INDEX_CONFIG.primaryKey })
    console.log('   Created new index')
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('   Index already exists')
    } else {
      throw error
    }
  }

  const index = meili.index(TERRITOIRES_INDEX)

  // Configure index settings
  console.log('   Configuring index settings...')
  await index.updateSettings({
    searchableAttributes: INDEX_CONFIG.searchableAttributes,
    filterableAttributes: INDEX_CONFIG.filterableAttributes,
    sortableAttributes: INDEX_CONFIG.sortableAttributes,
    rankingRules: INDEX_CONFIG.rankingRules,
    typoTolerance: INDEX_CONFIG.typoTolerance,
    pagination: INDEX_CONFIG.pagination,
  })
  console.log('   ✅ Settings configured')

  // Clear index if requested
  if (clearIndex) {
    console.log('\n🗑️  Clearing existing documents...')
    await index.deleteAllDocuments()
    // Wait for task to complete
    await new Promise((resolve) => setTimeout(resolve, 1000))
    console.log('   ✅ Index cleared')
  }

  // Load territories from database
  console.log('\n📊 Loading territories from database...')
  const startLoad = Date.now()

  const territoires = await prisma.territoire.findMany({
    select: {
      code: true,
      nom: true,
      nomNormalise: true,
      type: true,
      codeDepartement: true,
      codeRegion: true,
      population: true,
      aliases: {
        select: {
          aliasNom: true,
        },
      },
    },
  })

  console.log(`   Loaded ${territoires.length} territories in ${Date.now() - startLoad}ms`)

  // Transform to documents
  console.log('\n📝 Transforming documents...')
  const documents: TerritoireDocument[] = territoires.map((t) => ({
    code: t.code,
    nom: t.nom,
    nomNormalise: t.nomNormalise || '',
    type: t.type,
    codeDepartement: t.codeDepartement || undefined,
    codeRegion: t.codeRegion || undefined,
    population: t.population || undefined,
    aliases: t.aliases.map((a) => a.aliasNom),
  }))

  // Count by type
  const byType: Record<string, number> = {}
  for (const doc of documents) {
    byType[doc.type] = (byType[doc.type] || 0) + 1
  }
  console.log('   Documents by type:')
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`     - ${type}: ${count}`)
  }

  // Index in batches
  console.log(`\n📤 Indexing ${documents.length} documents in batches of ${BATCH_SIZE}...`)
  const startIndex = Date.now()
  let indexed = 0

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE)
    await index.addDocuments(batch)
    indexed += batch.length

    if (verbose || indexed % 5000 === 0 || indexed === documents.length) {
      console.log(`   ... ${indexed}/${documents.length} indexed`)
    }
  }

  // Wait for indexing to complete
  console.log('\n⏳ Waiting for indexing to complete...')
  let isIndexing = true
  while (isIndexing) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    const stats = await index.getStats()
    isIndexing = stats.isIndexing
  }

  const indexDuration = Date.now() - startIndex
  console.log(`   ✅ Indexing completed in ${indexDuration}ms`)

  // Get final stats
  const finalStats = await index.getStats()
  console.log(`\n📈 Index statistics:`)
  console.log(`   Documents: ${finalStats.numberOfDocuments}`)

  // Test search
  console.log('\n🔍 Testing search...')
  const testQueries = ['Paris', 'Lyon', 'Rennes', 'Bretagne', 'syndicat energie']

  for (const query of testQueries) {
    const startSearch = Date.now()
    const result = await index.search(query, { limit: 3 })
    const searchTime = Date.now() - startSearch

    const status = searchTime < 100 ? '✅' : '⚠️'
    console.log(`   ${status} "${query}": ${result.estimatedTotalHits} results in ${searchTime}ms`)

    if (verbose && result.hits.length > 0) {
      const topHit = result.hits[0] as TerritoireDocument
      console.log(`      → Top: ${topHit.nom} (${topHit.type})`)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('  INDEXATION COMPLETE')
  console.log('='.repeat(60))
  console.log(`  Documents indexed: ${finalStats.numberOfDocuments}`)
  console.log(`  Index time: ${indexDuration}ms`)
  console.log('='.repeat(60))

  await prisma.$disconnect()
  console.log('\n✅ Done!')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
