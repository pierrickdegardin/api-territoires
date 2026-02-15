import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    structure: {
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

// Mock global fetch for geocoding in POST handler
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { GET, POST } from '@/app/api/v1/structures/route'
import { GET as GET_BY_ID } from '@/app/api/v1/structures/[id]/route'
import { GET as GET_GEOJSON } from '@/app/api/v1/structures/geojson/route'

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3020'), options)
}

const sampleStructure = {
  id: 'str-001',
  nom: 'SYDEC des Landes',
  type: 'SYNDICAT_ENERGIE',
  siren: '200012345',
  geoMode: 'TERRITOIRE',
  adresse: null,
  codePostal: null,
  ville: null,
  telephone: null,
  latitude: null,
  longitude: null,
  regionCode: '75',
  departementCode: '40',
  groupementSiren: '200012345',
  region: { nom: 'Nouvelle-Aquitaine' },
  departement: { nom: 'Landes' },
  _count: { economes: 3 },
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.structure.findMany.mockResolvedValue([])
  mockPrisma.structure.findUnique.mockResolvedValue(null)
  mockPrisma.structure.count.mockResolvedValue(0)
  mockPrisma.structure.create.mockResolvedValue({})
  mockPrisma.$queryRaw.mockResolvedValue([])
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve({ features: [] }),
  })
})

describe('GET /api/v1/structures', () => {
  it('should return 200 with paginated list', async () => {
    mockPrisma.structure.findMany.mockResolvedValue([sampleStructure])
    mockPrisma.structure.count.mockResolvedValue(1)

    const req = makeRequest('/api/v1/structures')
    const response = await GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.structures).toHaveLength(1)
    expect(body.structures[0].nom).toBe('SYDEC des Landes')
    expect(body.pagination).toBeDefined()
    expect(body.pagination.total).toBe(1)
  })

  it('should filter by type when specified', async () => {
    mockPrisma.structure.findMany.mockResolvedValue([])
    mockPrisma.structure.count.mockResolvedValue(0)

    const req = makeRequest('/api/v1/structures?type=SYNDICAT_ENERGIE')
    await GET(req)

    expect(mockPrisma.structure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'SYNDICAT_ENERGIE' }),
      })
    )
  })

  it('should include X-Request-ID header', async () => {
    const req = makeRequest('/api/v1/structures')
    const response = await GET(req)

    expect(response.headers.get('X-Request-ID')).toBeTruthy()
  })
})

describe('GET /api/v1/structures/[id]', () => {
  it('should return 200 with structure detail', async () => {
    mockPrisma.structure.findUnique.mockResolvedValue({
      ...sampleStructure,
      economes: [{ id: 'eco-001', nom: 'Dupont', prenom: 'Jean', email: 'jean@ex.fr', statut: 'ACTIF' }],
      groupement: { siren: '200012345', nom: 'SYDEC' },
    })

    const req = makeRequest('/api/v1/structures/str-001')
    const response = await GET_BY_ID(req, { params: Promise.resolve({ id: 'str-001' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.nom).toBe('SYDEC des Landes')
    expect(body.type).toBe('SYNDICAT_ENERGIE')
  })

  it('should return 404 when structure not found', async () => {
    mockPrisma.structure.findUnique.mockResolvedValue(null)

    const req = makeRequest('/api/v1/structures/nonexistent')
    const response = await GET_BY_ID(req, { params: Promise.resolve({ id: 'nonexistent' }) })

    expect(response.status).toBe(404)
  })
})

describe('POST /api/v1/structures', () => {
  it('should create a structure and return 201', async () => {
    const newStructure = { ...sampleStructure, id: 'str-new' }
    mockPrisma.structure.create.mockResolvedValue(newStructure)

    const req = makeRequest('/api/v1/structures', {
      method: 'POST',
      body: JSON.stringify({ nom: 'Nouvelle Structure', type: 'ALEC' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(req)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.id).toBe('str-new')
    expect(mockPrisma.structure.create).toHaveBeenCalled()
  })
})

describe('GET /api/v1/structures/geojson', () => {
  it('should return a FeatureCollection', async () => {
    mockPrisma.structure.findMany.mockResolvedValue([
      {
        ...sampleStructure,
        geoMode: 'ADRESSE',
        latitude: 43.85,
        longitude: -0.5,
      },
    ])

    const req = makeRequest('/api/v1/structures/geojson')
    const response = await GET_GEOJSON(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.type).toBe('FeatureCollection')
    expect(Array.isArray(body.features)).toBe(true)
  })
})
