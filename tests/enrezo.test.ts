import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    gisementChaleur: {
      count: vi.fn().mockResolvedValue(150),
      findMany: vi.fn().mockResolvedValue([]),
    },
    installationProduction: {
      count: vi.fn().mockResolvedValue(200),
      findMany: vi.fn().mockResolvedValue([]),
    },
    plateformeStockageBois: {
      count: vi.fn().mockResolvedValue(50),
      findMany: vi.fn().mockResolvedValue([]),
    },
    reseauChaleurFroid: {
      count: vi.fn().mockResolvedValue(80),
      findMany: vi.fn().mockResolvedValue([]),
    },
    zoneOpportunite: {
      count: vi.fn().mockResolvedValue(300),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  }
  return { mockPrisma }
})

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  generateRequestId: vi.fn().mockReturnValue('test-req-id-456'),
  withRequestLogging: vi.fn((handler: Function) => {
    return async (request: Request, context?: any) => {
      const response = handler.length === 0 ? await handler() : await handler(request, context)
      response.headers.set('X-Request-ID', 'test-req-id-456')
      return response
    }
  }),
}))

import { GET } from '@/app/api/v1/enrezo/route'

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3020'))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.gisementChaleur.count.mockResolvedValue(150)
  mockPrisma.installationProduction.count.mockResolvedValue(200)
  mockPrisma.plateformeStockageBois.count.mockResolvedValue(50)
  mockPrisma.reseauChaleurFroid.count.mockResolvedValue(80)
  mockPrisma.zoneOpportunite.count.mockResolvedValue(300)
})

describe('GET /api/v1/enrezo', () => {
  it('should return stats and endpoints when no type specified', async () => {
    const req = makeRequest('/api/v1/enrezo')
    const response = await GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.name).toBe('EnRezo API')
    expect(body.endpoints).toBeDefined()
    expect(body.statistics).toBeDefined()
    expect(body.statistics.gisements).toBe(150)
    expect(body.statistics.installations).toBe(200)
    expect(body.statistics.plateformes).toBe(50)
    expect(body.statistics.reseaux).toBe(80)
    expect(body.statistics.zones).toBe(300)
  })

  it('should return gisement data for type=gisement', async () => {
    const mockGisements = [
      { id: '1', nom: 'Gisement A', type: 'INCINERATION', latitude: 48.8, longitude: 2.3 },
      { id: '2', nom: 'Gisement B', type: 'STEP', latitude: 48.9, longitude: 2.4 },
    ]
    mockPrisma.gisementChaleur.count.mockResolvedValue(2)
    mockPrisma.gisementChaleur.findMany.mockResolvedValue(mockGisements)

    const req = makeRequest('/api/v1/enrezo?type=gisement')
    const response = await GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(2)
    expect(body.total).toBe(2)
    expect(body.data[0].nom).toBe('Gisement A')
  })

  it('should return filtered zone results with bbox', async () => {
    const mockZones = [
      { id: '1', type: 'CHALEUR_FORT_POTENTIEL', latitude: 48.85, longitude: 2.3, geometry_geojson: null },
    ]
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ count: BigInt(1) }]) // count query
      .mockResolvedValueOnce(mockZones) // data query

    const req = makeRequest('/api/v1/enrezo?type=zone&bbox=2.2,48.8,2.4,48.9')
    const response = await GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2)
    // Verify bbox params were passed to the query
    const countCall = mockPrisma.$queryRawUnsafe.mock.calls[0]
    expect(countCall[0]).toContain('ST_MakeEnvelope')
  })

  it('should return 400 for invalid type', async () => {
    const req = makeRequest('/api/v1/enrezo?type=invalide')
    const response = await GET(req)

    expect(response.status).toBe(400)
  })

  it('should return GeoJSON FeatureCollection when format=geojson', async () => {
    const mockGisements = [
      { id: '1', nom: 'Gisement A', type: 'INCINERATION', latitude: 48.8, longitude: 2.3, geometry_geojson: null },
      { id: '2', nom: 'Gisement B', type: 'STEP', latitude: 48.9, longitude: 2.4, geometry_geojson: null },
    ]
    mockPrisma.gisementChaleur.count.mockResolvedValue(2)
    mockPrisma.gisementChaleur.findMany.mockResolvedValue(mockGisements)

    const req = makeRequest('/api/v1/enrezo?type=gisement&format=geojson')
    const response = await GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.type).toBe('FeatureCollection')
    expect(body.features).toHaveLength(2)
    expect(body.features[0].type).toBe('Feature')
    expect(body.features[0].geometry.type).toBe('Point')
    expect(body.features[0].geometry.coordinates).toEqual([2.3, 48.8])
  })

  it('should respect limit parameter', async () => {
    const mockGisements = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      nom: `Gisement ${i}`,
      type: 'INCINERATION',
      latitude: 48.8 + i * 0.01,
      longitude: 2.3,
    }))
    mockPrisma.gisementChaleur.count.mockResolvedValue(100)
    mockPrisma.gisementChaleur.findMany.mockResolvedValue(mockGisements)

    const req = makeRequest('/api/v1/enrezo?type=gisement&limit=5')
    const response = await GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.limit).toBe(5)
    expect(mockPrisma.gisementChaleur.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }))
  })

  it('should include CORS headers', async () => {
    const req = makeRequest('/api/v1/enrezo')
    const response = await GET(req)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should include X-Request-ID in response', async () => {
    mockPrisma.gisementChaleur.count.mockResolvedValue(0)
    mockPrisma.gisementChaleur.findMany.mockResolvedValue([])

    const req = makeRequest('/api/v1/enrezo?type=gisement')
    const response = await GET(req)

    expect(response.headers.get('X-Request-ID')).toBe('test-req-id-456')
  })
})
