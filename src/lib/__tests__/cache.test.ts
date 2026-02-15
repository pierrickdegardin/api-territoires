import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted so the mock object is available when vi.mock factories run
const { mockRedis, mockIsRedisConnected } = vi.hoisted(() => {
  const mockRedis = {
    status: 'ready' as string,
    get: vi.fn(),
    setex: vi.fn().mockResolvedValue('OK'),
    keys: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(0),
    info: vi.fn().mockResolvedValue('used_memory_human:1.5M\r\n'),
    ping: vi.fn().mockResolvedValue('PONG'),
    on: vi.fn(),
  }
  const mockIsRedisConnected = vi.fn().mockResolvedValue(true)
  return { mockRedis, mockIsRedisConnected }
})

vi.mock('ioredis', () => ({
  default: vi.fn(() => mockRedis),
}))

vi.mock('../redis', () => ({
  redis: mockRedis,
  isRedisConnected: mockIsRedisConnected,
  checkRedisHealth: vi.fn().mockResolvedValue(true),
}))

import {
  cacheKey,
  getFromCache,
  setInCache,
  invalidateCache,
  invalidateAllCache,
  invalidateByPrefix,
  getCacheStats,
} from '../cache'

beforeEach(() => {
  vi.clearAllMocks()
  mockRedis.status = 'ready'
  mockIsRedisConnected.mockResolvedValue(true)
})

describe('cacheKey', () => {
  it('should generate key with endpoint only', () => {
    const key = cacheKey('regions')
    expect(key).toBe('api-territoires:regions')
  })

  it('should generate key with params hash', () => {
    const key = cacheKey('communes', { departement: '69' })
    expect(key).toMatch(/^api-territoires:communes:[a-f0-9]{12}$/)
  })

  it('should generate same hash for same params regardless of order', () => {
    const key1 = cacheKey('test', { a: '1', b: '2' })
    const key2 = cacheKey('test', { b: '2', a: '1' })
    expect(key1).toBe(key2)
  })

  it('should generate different hashes for different params', () => {
    const key1 = cacheKey('test', { a: '1' })
    const key2 = cacheKey('test', { a: '2' })
    expect(key1).not.toBe(key2)
  })
})

describe('getFromCache', () => {
  it('should return parsed data when cache hit', async () => {
    const testData = { regions: [{ code: '84', nom: 'Auvergne-Rhone-Alpes' }] }
    mockRedis.get.mockResolvedValue(JSON.stringify(testData))

    const result = await getFromCache('api-territoires:regions')
    expect(result).toEqual(testData)
    expect(mockRedis.get).toHaveBeenCalledWith('api-territoires:regions')
  })

  it('should return null on cache miss', async () => {
    mockRedis.get.mockResolvedValue(null)

    const result = await getFromCache('api-territoires:nonexistent')
    expect(result).toBeNull()
  })

  it('should return null when Redis is disconnected', async () => {
    mockIsRedisConnected.mockResolvedValue(false)

    const result = await getFromCache('api-territoires:regions')
    expect(result).toBeNull()
    expect(mockRedis.get).not.toHaveBeenCalled()
  })

  it('should return null on Redis error (graceful degradation)', async () => {
    mockRedis.get.mockRejectedValue(new Error('Connection refused'))

    const result = await getFromCache('api-territoires:regions')
    expect(result).toBeNull()
  })
})

describe('setInCache', () => {
  it('should call setex with correct args and default TTL', () => {
    const data = { test: true }
    setInCache('api-territoires:test', data)

    expect(mockRedis.setex).toHaveBeenCalledWith('api-territoires:test', 86400, JSON.stringify(data))
  })

  it('should use custom TTL when provided', () => {
    setInCache('api-territoires:test', { a: 1 }, 3600)

    expect(mockRedis.setex).toHaveBeenCalledWith('api-territoires:test', 3600, expect.any(String))
  })

  it('should not call setex when Redis is not ready', () => {
    mockRedis.status = 'connecting'
    setInCache('api-territoires:test', { a: 1 })

    expect(mockRedis.setex).not.toHaveBeenCalled()
  })
})

describe('invalidateCache', () => {
  it('should delete matching keys', async () => {
    mockRedis.keys.mockResolvedValue(['api-territoires:regions', 'api-territoires:communes'])
    mockRedis.del.mockResolvedValue(2)

    const count = await invalidateCache('api-territoires:*')
    expect(count).toBe(2)
    expect(mockRedis.del).toHaveBeenCalledWith('api-territoires:regions', 'api-territoires:communes')
  })

  it('should use default pattern when none provided', async () => {
    mockRedis.keys.mockResolvedValue([])

    await invalidateCache()
    expect(mockRedis.keys).toHaveBeenCalledWith('api-territoires:*')
  })

  it('should return 0 when no keys match', async () => {
    mockRedis.keys.mockResolvedValue([])

    const count = await invalidateCache('nonexistent:*')
    expect(count).toBe(0)
    expect(mockRedis.del).not.toHaveBeenCalled()
  })

  it('should return 0 when Redis is disconnected', async () => {
    mockIsRedisConnected.mockResolvedValue(false)

    const count = await invalidateCache()
    expect(count).toBe(0)
  })

  it('should return 0 on Redis error', async () => {
    mockRedis.keys.mockRejectedValue(new Error('Connection lost'))

    const count = await invalidateCache()
    expect(count).toBe(0)
  })
})

describe('invalidateAllCache', () => {
  it('should call invalidateCache with default pattern', async () => {
    mockRedis.keys.mockResolvedValue(['api-territoires:a', 'api-territoires:b'])
    mockRedis.del.mockResolvedValue(2)

    const count = await invalidateAllCache()
    expect(count).toBe(2)
    expect(mockRedis.keys).toHaveBeenCalledWith('api-territoires:*')
  })
})

describe('invalidateByPrefix', () => {
  it('should call invalidateCache with prefix pattern', async () => {
    mockRedis.keys.mockResolvedValue(['api-territoires:regions:abc123'])
    mockRedis.del.mockResolvedValue(1)

    const count = await invalidateByPrefix('regions')
    expect(count).toBe(1)
    expect(mockRedis.keys).toHaveBeenCalledWith('api-territoires:regions*')
  })
})

describe('getCacheStats', () => {
  it('should return stats when Redis is connected', async () => {
    mockRedis.keys.mockResolvedValue(['k1', 'k2', 'k3'])
    mockRedis.info.mockResolvedValue('used_memory_human:2.5M\r\n')

    const stats = await getCacheStats()
    expect(stats).toEqual({
      connected: true,
      keys: 3,
      memoryUsed: '2.5M',
    })
  })

  it('should return disconnected stats when Redis is down', async () => {
    mockIsRedisConnected.mockResolvedValue(false)

    const stats = await getCacheStats()
    expect(stats).toEqual({
      connected: false,
      keys: 0,
      memoryUsed: '0',
    })
  })

  it('should handle memory info parse failure', async () => {
    mockRedis.keys.mockResolvedValue([])
    mockRedis.info.mockResolvedValue('some_other_format\r\n')

    const stats = await getCacheStats()
    expect(stats.memoryUsed).toBe('unknown')
  })
})
