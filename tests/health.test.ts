import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockPrisma, mockCheckRedisHealth, mockGetCacheStats } = vi.hoisted(() => {
  const mockPrisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    region: { count: vi.fn().mockResolvedValue(18) },
    departement: { count: vi.fn().mockResolvedValue(101) },
    commune: { count: vi.fn().mockResolvedValue(34875) },
    groupement: { count: vi.fn().mockResolvedValue(1234) },
    alias: { count: vi.fn().mockResolvedValue(500) },
  }
  const mockCheckRedisHealth = vi.fn().mockResolvedValue(true)
  const mockGetCacheStats = vi.fn().mockResolvedValue({
    connected: true,
    keys: 42,
    memoryUsed: '1.5M',
  })
  return { mockPrisma, mockCheckRedisHealth, mockGetCacheStats }
})

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

vi.mock('@/lib/redis', () => ({
  redis: { status: 'ready', on: vi.fn(), ping: vi.fn().mockResolvedValue('PONG') },
  checkRedisHealth: mockCheckRedisHealth,
  isRedisConnected: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/cache', () => ({
  getCacheStats: mockGetCacheStats,
}))

import { GET } from '@/app/api/v1/territoires/health/route'

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
  mockPrisma.region.count.mockResolvedValue(18)
  mockPrisma.departement.count.mockResolvedValue(101)
  mockPrisma.commune.count.mockResolvedValue(34875)
  mockPrisma.groupement.count.mockResolvedValue(1234)
  mockPrisma.alias.count.mockResolvedValue(500)
  mockCheckRedisHealth.mockResolvedValue(true)
  mockGetCacheStats.mockResolvedValue({ connected: true, keys: 42, memoryUsed: '1.5M' })
})

describe('GET /api/v1/territoires/health', () => {
  it('should return healthy status with DB stats', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('healthy')
    expect(body.services.database).toBe('up')
    expect(body.stats.regions).toBe(18)
    expect(body.stats.departements).toBe(101)
    expect(body.stats.communes).toBe(34875)
    expect(body.stats.groupements).toBe(1234)
    expect(body.version).toBe('1.0.0')
  })

  it('should return unhealthy when database is down', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.status).toBe('unhealthy')
    expect(body.services.database).toBe('down')
  })

  it('should return degraded when Redis is down but DB is up', async () => {
    mockCheckRedisHealth.mockResolvedValue(false)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('degraded')
    expect(body.services.database).toBe('up')
    expect(body.services.redis.connected).toBe(false)
  })

  it('should include CORS and cache-control headers', async () => {
    const response = await GET()

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Cache-Control')).toContain('no-cache')
  })

  it('should include response time header', async () => {
    const response = await GET()

    expect(response.headers.get('X-Response-Time')).toMatch(/^\d+ms$/)
  })
})
