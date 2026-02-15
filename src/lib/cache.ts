import { redis, isRedisConnected } from './redis'
import crypto from 'crypto'

const CACHE_PREFIX = 'api-territoires'
const DEFAULT_TTL = 60 * 60 * 24 // 24h

function hashParams(params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort())
  return crypto.createHash('md5').update(sorted).digest('hex').slice(0, 12)
}

export function cacheKey(endpoint: string, params: Record<string, unknown> = {}): string {
  const hash = Object.keys(params).length > 0 ? `:${hashParams(params)}` : ''
  return `${CACHE_PREFIX}:${endpoint}${hash}`
}

export async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    if (!(await isRedisConnected())) return null
    const cached = await redis.get(key)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null // Graceful degradation
  }
}

// Fire-and-forget: don't await, don't block response
export function setInCache<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
  if (redis.status !== 'ready') return

  redis.setex(key, ttl, JSON.stringify(data)).catch((err) => {
    console.error('Cache set error:', err.message)
  })
}

export async function invalidateCache(pattern?: string): Promise<number> {
  try {
    if (!(await isRedisConnected())) return 0
    const searchPattern = pattern || `${CACHE_PREFIX}:*`
    const keys = await redis.keys(searchPattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
    return keys.length
  } catch (err) {
    console.error('Cache invalidation error:', err)
    return 0
  }
}

/**
 * Invalidate all cache entries (useful after import scripts)
 */
export async function invalidateAllCache(): Promise<number> {
  return invalidateCache()
}

/**
 * Invalidate cache entries matching a prefix (e.g. 'regions', 'communes')
 */
export async function invalidateByPrefix(prefix: string): Promise<number> {
  return invalidateCache(`${CACHE_PREFIX}:${prefix}*`)
}

export async function getCacheStats(): Promise<{
  connected: boolean
  keys: number
  memoryUsed: string
}> {
  try {
    if (!(await isRedisConnected())) {
      return { connected: false, keys: 0, memoryUsed: '0' }
    }
    const keys = await redis.keys(`${CACHE_PREFIX}:*`)
    const info = await redis.info('memory')
    const memMatch = info.match(/used_memory_human:(\S+)/)
    return {
      connected: true,
      keys: keys.length,
      memoryUsed: memMatch ? memMatch[1] : 'unknown',
    }
  } catch {
    return { connected: false, keys: 0, memoryUsed: '0' }
  }
}
