/**
 * Cache invalidation helper for import scripts.
 *
 * Can be used directly (programmatic) or as a standalone script:
 *   npx tsx scripts/helpers/invalidate-cache.ts
 *
 * Programmatic usage:
 *   import { invalidateCacheAfterImport } from './helpers/invalidate-cache'
 *   await invalidateCacheAfterImport()
 */

import { Redis } from 'ioredis'

const CACHE_PREFIX = 'api-territoires'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function invalidateCacheAfterImport(prefix?: string): Promise<number> {
  let redis: Redis | null = null
  try {
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000 })
    const pattern = prefix ? `${CACHE_PREFIX}:${prefix}*` : `${CACHE_PREFIX}:*`
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
    console.log(`Cache invalidated: ${keys.length} entries removed (pattern: ${pattern})`)
    return keys.length
  } catch {
    console.warn('Cache invalidation skipped (Redis not available)')
    return 0
  } finally {
    if (redis) {
      redis.disconnect()
    }
  }
}

// Allow running as standalone script
if (require.main === module) {
  invalidateCacheAfterImport().then((count) => {
    process.exit(count >= 0 ? 0 : 1)
  })
}
