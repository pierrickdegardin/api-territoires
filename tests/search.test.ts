import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    region: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    departement: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  }
  return { mockPrisma }
})

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

vi.mock('@/lib/territoires/errors', async () => {
  const { NextResponse } = await import('next/server')
  return {
    createErrorResponse: vi.fn((code: string, message: string) => {
      return NextResponse.json({ error: { code, message } }, { status: 500 })
    }),
    ErrorCodes: {
      INTERNAL_ERROR: 'INTERNAL_ERROR',
    },
  }
})

import { GET } from '@/app/api/v1/territoires/search/route'

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3020'))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.region.findMany.mockResolvedValue([])
  mockPrisma.departement.findMany.mockResolvedValue([])
  mockPrisma.$queryRawUnsafe.mockResolvedValue([])
})

describe('GET /api/v1/territoires/search', () => {
  it('should return results matching the query', async () => {
    mockPrisma.region.findMany.mockResolvedValue([{ code: '84', nom: 'Auvergne-Rhone-Alpes', population: 8000000 }])

    const req = makeRequest('/api/v1/territoires/search?q=Auvergne')
    const response = await GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].code).toBe('84')
    expect(body.results[0].nom).toBe('Auvergne-Rhone-Alpes')
    expect(body.results[0].type).toBe('region')
    expect(body.query).toBe('Auvergne')
  })

  it('should return 400 when q parameter is missing', async () => {
    const req = makeRequest('/api/v1/territoires/search')
    const response = await GET(req)

    expect(response.status).toBe(400)
  })

  it('should filter by type when specified', async () => {
    const req = makeRequest('/api/v1/territoires/search?q=Lyon&type=region')
    await GET(req)

    expect(mockPrisma.region.findMany).toHaveBeenCalled()
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled()
  })

  it('should search communes with department filter', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      {
        code: '69123',
        nom: 'Lyon',
        code_departement: '69',
        code_region: '84',
        population: 520000,
      },
    ])

    const req = makeRequest('/api/v1/territoires/search?q=Lyon&type=commune&departement=69')
    const response = await GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].code).toBe('69123')
    expect(body.results[0].departement).toBe('69')
  })

  it('should include searchTime in response', async () => {
    const req = makeRequest('/api/v1/territoires/search?q=test')
    const response = await GET(req)
    const body = await response.json()

    expect(body.searchTime).toMatch(/^\d+ms$/)
  })

  it('should include CORS headers', async () => {
    const req = makeRequest('/api/v1/territoires/search?q=test')
    const response = await GET(req)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should return empty results for unmatched query', async () => {
    const req = makeRequest('/api/v1/territoires/search?q=zzzznonexistent')
    const response = await GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results).toHaveLength(0)
    expect(body.total).toBe(0)
  })

  it('should sort results: exact match first, then startsWith, then contains', async () => {
    mockPrisma.region.findMany.mockResolvedValue([])
    mockPrisma.departement.findMany.mockResolvedValue([])
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        { code: '01001', nom: 'Villelyon', code_departement: '01', code_region: '84', population: 100 },
        { code: '69123', nom: 'Lyon', code_departement: '69', code_region: '84', population: 520000 },
        { code: '69124', nom: 'Lyon 1er', code_departement: '69', code_region: '84', population: 30000 },
      ])
      .mockResolvedValueOnce([])

    const req = makeRequest('/api/v1/territoires/search?q=Lyon')
    const response = await GET(req)
    const body = await response.json()

    expect(body.results[0].nom).toBe('Lyon')
    expect(body.results[1].nom).toBe('Lyon 1er')
    expect(body.results[2].nom).toBe('Villelyon')
  })
})
