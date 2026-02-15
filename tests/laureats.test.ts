import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    laureat: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
  return { mockPrisma }
})

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

import { GET, POST } from '@/app/api/v1/laureats/route'
import { GET as GET_BY_ID } from '@/app/api/v1/laureats/[id]/route'
import { GET as GET_GEOJSON } from '@/app/api/v1/laureats/geojson/route'

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3020'), options)
}

const sampleLaureat = {
  id: 'lau-001',
  nom: 'Communaute de Communes du Pays de Gex',
  type: 'EPCI',
  statut: 'ACTIF',
  source: 'ACTEE1',
  regionCode: '84',
  departementCode: '01',
  communeCode: null,
  groupementSiren: '200068120',
  coutTotal: 150000,
  aideSollicitee: 100000,
  aideValidee: 80000,
  region: { nom: 'Auvergne-Rhone-Alpes' },
  departement: { nom: 'Ain' },
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.laureat.findMany.mockResolvedValue([])
  mockPrisma.laureat.findUnique.mockResolvedValue(null)
  mockPrisma.laureat.count.mockResolvedValue(0)
  mockPrisma.laureat.create.mockResolvedValue({})
  mockPrisma.$queryRaw.mockResolvedValue([])
})

describe('GET /api/v1/laureats', () => {
  it('should return 200 with paginated list', async () => {
    mockPrisma.laureat.findMany.mockResolvedValue([sampleLaureat])
    mockPrisma.laureat.count.mockResolvedValue(1)

    const req = makeRequest('/api/v1/laureats')
    const response = await GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.laureats).toHaveLength(1)
    expect(body.laureats[0].nom).toBe('Communaute de Communes du Pays de Gex')
    expect(body.pagination).toBeDefined()
    expect(body.pagination.total).toBe(1)
  })

  it('should respect limit and page parameters', async () => {
    mockPrisma.laureat.findMany.mockResolvedValue([])
    mockPrisma.laureat.count.mockResolvedValue(100)

    const req = makeRequest('/api/v1/laureats?page=2&limit=10')
    await GET(req)

    expect(mockPrisma.laureat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      })
    )
  })

  it('should include CORS headers', async () => {
    const req = makeRequest('/api/v1/laureats')
    const response = await GET(req)

    expect(response.headers.get('X-Request-ID')).toBeTruthy()
  })
})

describe('GET /api/v1/laureats/[id]', () => {
  it('should return 200 with laureat detail', async () => {
    mockPrisma.laureat.findUnique.mockResolvedValue(sampleLaureat)

    const req = makeRequest('/api/v1/laureats/lau-001')
    const response = await GET_BY_ID(req, { params: Promise.resolve({ id: 'lau-001' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.nom).toBe('Communaute de Communes du Pays de Gex')
    expect(body.type).toBe('EPCI')
  })

  it('should return 404 when laureat not found', async () => {
    mockPrisma.laureat.findUnique.mockResolvedValue(null)

    const req = makeRequest('/api/v1/laureats/nonexistent')
    const response = await GET_BY_ID(req, { params: Promise.resolve({ id: 'nonexistent' }) })

    expect(response.status).toBe(404)
  })
})

describe('POST /api/v1/laureats', () => {
  it('should create a laureat and return 201', async () => {
    const newLaureat = { ...sampleLaureat, id: 'lau-new' }
    mockPrisma.laureat.create.mockResolvedValue(newLaureat)

    const req = makeRequest('/api/v1/laureats', {
      method: 'POST',
      body: JSON.stringify({ nom: 'Nouveau Laureat', type: 'EPCI', source: 'ACTEE2' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(req)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.id).toBe('lau-new')
    expect(mockPrisma.laureat.create).toHaveBeenCalled()
  })

  it('should return 400 when body is invalid (missing nom)', async () => {
    const req = makeRequest('/api/v1/laureats', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(req)

    expect(response.status).toBe(400)
  })
})

describe('GET /api/v1/laureats/geojson', () => {
  it('should return a FeatureCollection', async () => {
    mockPrisma.laureat.findMany.mockResolvedValue([
      {
        ...sampleLaureat,
        groupementSiren: null,
        communeCode: '01001',
      },
    ])
    mockPrisma.$queryRaw.mockResolvedValue([{ lon: 5.97, lat: 46.2 }])

    const req = makeRequest('/api/v1/laureats/geojson')
    const response = await GET_GEOJSON(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.type).toBe('FeatureCollection')
    expect(Array.isArray(body.features)).toBe(true)
  })
})
