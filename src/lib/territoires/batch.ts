/**
 * Batch Matching Service for API Territoires
 *
 * Handles bulk territory matching operations with async processing
 */

import { prisma } from '@/lib/prisma'
import { matchTerritoire } from './matching'
import {
  BatchMatchInput,
  BatchSubmitResponse,
  BatchStatusResponse,
  BatchResultsResponse,
  BatchResultItem,
  MatchHints,
  MatchSuccess,
  MatchSuggestions,
  MatchFailed,
} from './types'

// Configuration
const BATCH_MAX_ITEMS = 1000
const BATCH_TTL_HOURS = 24
const ITEMS_PER_SECOND = 50 // Rate limit for processing
const BATCH_CONCURRENCY = 10 // Max concurrent match operations

/**
 * Submit a new batch matching request
 */
export async function submitBatchRequest(input: BatchMatchInput, baseUrl: string): Promise<BatchSubmitResponse> {
  // Validate input
  if (!input.items || !Array.isArray(input.items)) {
    throw new Error('Items array is required')
  }

  if (input.items.length === 0) {
    throw new Error('Items array cannot be empty')
  }

  if (input.items.length > BATCH_MAX_ITEMS) {
    throw new Error(`Maximum ${BATCH_MAX_ITEMS} items per batch`)
  }

  // Calculate TTL
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + BATCH_TTL_HOURS)

  // Create batch request
  const request = await prisma.batchMatchRequest.create({
    data: {
      clientId: input.clientId,
      totalItems: input.items.length,
      expiresAt,
      items: {
        create: input.items.map((item, index) => ({
          inputIndex: index,
          query: item.query.trim().substring(0, 200),
          hints: (item.hints as object) || null,
        })),
      },
    },
  })

  // Estimate processing time (simplified)
  const estimatedDuration = Math.ceil(input.items.length / ITEMS_PER_SECOND)

  // Trigger async processing (fire and forget)
  processBatchAsync(request.id).catch(console.error)

  return {
    requestId: request.id,
    status: 'pending',
    totalItems: input.items.length,
    estimatedDuration,
    statusUrl: `${baseUrl}/api/v1/territoires/batch/${request.id}`,
    resultsUrl: `${baseUrl}/api/v1/territoires/batch/${request.id}/results`,
  }
}

/**
 * Get batch request status
 */
export async function getBatchStatus(requestId: string): Promise<BatchStatusResponse | null> {
  const request = await prisma.batchMatchRequest.findUnique({
    where: { id: requestId },
  })

  if (!request) {
    return null
  }

  const progress = request.totalItems > 0 ? Math.round((request.processed / request.totalItems) * 100) : 0

  return {
    requestId: request.id,
    status: request.status as BatchStatusResponse['status'],
    totalItems: request.totalItems,
    processed: request.processed,
    matched: request.matched,
    suggestions: request.suggestions,
    failed: request.failed,
    createdAt: request.createdAt.toISOString(),
    startedAt: request.startedAt?.toISOString(),
    completedAt: request.completedAt?.toISOString(),
    progress,
  }
}

/**
 * Get batch results
 */
export async function getBatchResults(requestId: string): Promise<BatchResultsResponse | null> {
  const request = await prisma.batchMatchRequest.findUnique({
    where: { id: requestId },
    include: {
      items: {
        orderBy: { inputIndex: 'asc' },
      },
    },
  })

  if (!request) {
    return null
  }

  const results: BatchResultItem[] = request.items.map((item) => ({
    index: item.inputIndex,
    query: item.query,
    status: item.status as BatchResultItem['status'],
    code: item.code || undefined,
    nom: item.nom || undefined,
    type: item.type || undefined,
    confidence: item.confidence || undefined,
    matchSource: item.matchSource || undefined,
    alternatives: item.alternatives as unknown as BatchResultItem['alternatives'],
    error: item.errorMessage || undefined,
  }))

  const successRate = request.totalItems > 0 ? Math.round((request.matched / request.totalItems) * 100) : 0

  return {
    requestId: request.id,
    status: request.status as BatchResultsResponse['status'],
    results,
    summary: {
      total: request.totalItems,
      matched: request.matched,
      suggestions: request.suggestions,
      failed: request.failed,
      successRate,
    },
  }
}

/**
 * Create a unique key for deduplication based on query and hints
 */
function createDeduplicationKey(query: string, hints?: MatchHints | null): string {
  const normalizedQuery = query.toLowerCase().trim()
  if (!hints) {
    return normalizedQuery
  }
  // Include hints in the key to differentiate queries with different contexts
  const hintsStr = JSON.stringify({
    d: hints.departement || '',
    r: hints.region || '',
    t: hints.type || '',
  })
  return `${normalizedQuery}|${hintsStr}`
}

/**
 * Process batch asynchronously with deduplication
 */
async function processBatchAsync(requestId: string): Promise<void> {
  try {
    // Mark as processing
    await prisma.batchMatchRequest.update({
      where: { id: requestId },
      data: {
        status: 'processing',
        startedAt: new Date(),
      },
    })

    // Get pending items
    const items = await prisma.batchMatchItem.findMany({
      where: {
        requestId,
        status: 'pending',
      },
      orderBy: { inputIndex: 'asc' },
    })

    let matched = 0
    let suggestions = 0
    let failed = 0

    // Deduplication: Group items by unique query+hints combination
    const itemsByKey = new Map<string, typeof items>()
    for (const item of items) {
      const key = createDeduplicationKey(item.query, item.hints as MatchHints | null)
      const existing = itemsByKey.get(key) || []
      existing.push(item)
      itemsByKey.set(key, existing)
    }

    // Log deduplication stats
    const uniqueQueries = itemsByKey.size
    const totalItems = items.length
    if (uniqueQueries < totalItems) {
      console.log(
        `[Batch ${requestId}] Deduplication: ${totalItems} items → ${uniqueQueries} unique queries (${Math.round((1 - uniqueQueries / totalItems) * 100)}% reduction)`
      )
    }

    // Cache for deduplication results
    const resultCache = new Map<string, Awaited<ReturnType<typeof matchTerritoire>>>()

    // Process a single unique query group and return counts
    const processGroup = async (
      key: string,
      groupItems: typeof items
    ): Promise<{ matched: number; suggestions: number; failed: number; processed: number }> => {
      const firstItem = groupItems[0]
      let groupMatched = 0
      let groupSuggestions = 0
      let groupFailed = 0

      try {
        let result = resultCache.get(key)
        if (!result) {
          result = await matchTerritoire({
            query: firstItem.query,
            hints: firstItem.hints as MatchHints | undefined,
          })
          resultCache.set(key, result)
        }

        // Build batch updates for all items in the group
        const updatePromises = groupItems.map((item) => {
          if (result!.status === 'matched') {
            const r = result as MatchSuccess
            groupMatched++
            return prisma.batchMatchItem.update({
              where: { id: item.id },
              data: {
                status: 'matched',
                code: r.code,
                nom: r.nom,
                type: r.type,
                confidence: r.confidence,
                matchSource: r.matchSource,
              },
            })
          } else if (result!.status === 'suggestions') {
            const r = result as MatchSuggestions
            groupSuggestions++
            return prisma.batchMatchItem.update({
              where: { id: item.id },
              data: {
                status: 'suggestions',
                alternatives: r.alternatives as object[],
              },
            })
          } else {
            const r = result as MatchFailed
            groupFailed++
            return prisma.batchMatchItem.update({
              where: { id: item.id },
              data: {
                status: 'failed',
                errorMessage: r.message,
              },
            })
          }
        })

        await Promise.all(updatePromises)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        await Promise.all(
          groupItems.map((item) =>
            prisma.batchMatchItem.update({
              where: { id: item.id },
              data: {
                status: 'failed',
                errorMessage: errorMsg,
              },
            })
          )
        )
        groupFailed += groupItems.length
      }

      return {
        matched: groupMatched,
        suggestions: groupSuggestions,
        failed: groupFailed,
        processed: groupItems.length,
      }
    }

    // Process unique queries in chunks of BATCH_CONCURRENCY
    const entries = Array.from(itemsByKey.entries())

    for (let i = 0; i < entries.length; i += BATCH_CONCURRENCY) {
      const chunk = entries.slice(i, i + BATCH_CONCURRENCY)

      const chunkResults = await Promise.allSettled(chunk.map(([key, groupItems]) => processGroup(key, groupItems)))

      // Aggregate results from this chunk
      let chunkProcessed = 0
      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          matched += result.value.matched
          suggestions += result.value.suggestions
          failed += result.value.failed
          chunkProcessed += result.value.processed
        } else {
          // Shouldn't happen as processGroup catches errors, but safety net
          const chunkItemCount = chunk.reduce((sum, [, items]) => sum + items.length, 0)
          failed += chunkItemCount
          chunkProcessed += chunkItemCount
        }
      }

      // Update progress after each chunk
      await prisma.batchMatchRequest.update({
        where: { id: requestId },
        data: {
          processed: { increment: chunkProcessed },
          matched,
          suggestions,
          failed,
        },
      })
    }

    // Mark as completed
    await prisma.batchMatchRequest.update({
      where: { id: requestId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    })
  } catch (error) {
    console.error('Batch processing error:', error)
    // Mark as failed
    await prisma.batchMatchRequest.update({
      where: { id: requestId },
      data: {
        status: 'failed',
        completedAt: new Date(),
      },
    })
  }
}

/**
 * Cleanup expired batch requests
 */
export async function cleanupExpiredBatches(): Promise<number> {
  const result = await prisma.batchMatchRequest.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  })
  return result.count
}
