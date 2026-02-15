import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    economeFlux: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    commune: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
  return { mockPrisma }
})

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

import { GET, POST } from '@/app/api/v1/economes/route'
import { GET as GET_BY_ID } from '@/app/api/v1/economes/[id]/route'
import { GET as GET_GEOJSON } from '@/app/api/v1/economes/geojson/route'
import { GET as GET_BY_COMMUNE } from '@/app/api/v1/economes/search-by-commune/route'

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3020'), options)
}

const sampleEconome = {
  id: 'eco-001',
  nom: 'Dupont',
  prenom: 'Jean',
  email: 'jean.dupont@example.fr',
  telephone: '0601020304',
  statut: 'ACTIF',
  reseau: 'FNCCR',
  regionCode: '84',
  departementCode: '69',
  structureId: 'str-001',
  structure: {
    id: 'str-001',
    nom: 'SYDEC',
    type: 'SYNDICAT',
    siren: '200012345',
    finess: null,
    finessEj: null,
    categorieFiness: null,
    adresse: '10 rue de la Mairie',
    codePostal: '69000',
    ville: 'Lyon',
    telephone: '0472000000',
    latitude: 45.75,
    longitude: 4.85,
  },
  region: { nom: 'Auvergne-Rhone-Alpes' },
  departement: { nom: 'Rhone' },
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.economeFlux.findMany.mockResolvedValue([])
  mockPrisma.economeFlux.findUnique.mockResolvedValue(null)
  mockPrisma.economeFlux.count.mockResolvedValue(0)
  mockPrisma.economeFlux.create.mockResolvedValue({})
  mockPrisma.commune.findUnique.mockResolvedValue(null)
  mockPrisma.$queryRaw.mockResolvedValue([])
})

describe('GET /api/v1/economes', () => {
  it('should return 200 with paginated list', async () => {
    mockPrisma.economeFlux.findMany.mockResolvedValue([sampleEconome])
    mockPrisma.economeFlux.count.mockResolvedValue(1)

    const req = makeRequest('/api/v1/economes')
    const response = await GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.economes).toHaveLength(1)
    expect(body.economes[0].nom).toBe('Dupont')
    expect(body.pagination).toBeDefined()
    expect(body.pagination.total).toBe(1)
  })

  it('should include X-Request-ID header', async () => {
    const req = makeRequest('/api/v1/economes')
    const response = await GET(req)

    expect(response.headers.get('X-Request-ID')).toBeTruthy()
  })
})

describe('GET /api/v1/economes/[id]', () => {
  it('should return 200 with econome detail', async () => {
    mockPrisma.economeFlux.findUnique.mockResolvedValue(sampleEconome)

    const req = makeRequest('/api/v1/economes/eco-001')
    const response = await GET_BY_ID(req, { params: Promise.resolve({ id: 'eco-001' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.nom).toBe('Dupont')
    expect(body.prenom).toBe('Jean')
  })

  it('should return 404 when econome not found', async () => {
    mockPrisma.economeFlux.findUnique.mockResolvedValue(null)

    const req = makeRequest('/api/v1/economes/nonexistent')
    const response = await GET_BY_ID(req, { params: Promise.resolve({ id: 'nonexistent' }) })

    expect(response.status).toBe(404)
  })
})

describe('POST /api/v1/economes', () => {
  it('should create an econome and return 201', async () => {
    const newEconome = { ...sampleEconome, id: 'eco-new' }
    mockPrisma.economeFlux.create.mockResolvedValue(newEconome)

    const req = makeRequest('/api/v1/economes', {
      method: 'POST',
      body: JSON.stringify({ nom: 'Martin', prenom: 'Pierre', email: 'pierre@example.fr' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(req)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.id).toBe('eco-new')
    expect(mockPrisma.economeFlux.create).toHaveBeenCalled()
  })

  it('should return 400 when body is invalid (missing email)', async () => {
    const req = makeRequest('/api/v1/economes', {
      method: 'POST',
      body: JSON.stringify({ nom: 'Martin' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(req)

    expect(response.status).toBe(400)
  })
})

describe('GET /api/v1/economes/geojson', () => {
  it('should return a FeatureCollection', async () => {
    mockPrisma.economeFlux.findMany.mockResolvedValue([
      {
        ...sampleEconome,
        structure: { ...sampleEconome.structure, latitude: 45.75, longitude: 4.85 },
      },
    ])

    const req = makeRequest('/api/v1/economes/geojson')
    const response = await GET_GEOJSON(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.type).toBe('FeatureCollection')
    expect(Array.isArray(body.features)).toBe(true)
  })
})

describe('GET /api/v1/economes/search-by-commune', () => {
  it('should return economes for a given commune', async () => {
    mockPrisma.commune.findUnique.mockResolvedValue({
      code: '75056',
      nom: 'Paris',
      codeDepartement: '75',
      codeRegion: '11',
      groupements: [
        {
          groupement: { siren: '200054781', nom: 'Metropole du Grand Paris', type: 'METROPOLE' },
        },
      ],
    })
    mockPrisma.economeFlux.findMany.mockResolvedValue([sampleEconome])

    const req = makeRequest('/api/v1/economes/search-by-commune?commune=75056')
    const response = await GET_BY_COMMUNE(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.commune).toBeDefined()
    expect(body.commune.code).toBe('75056')
    expect(body.economes).toBeDefined()
    expect(Array.isArray(body.economes)).toBe(true)
  })

  it('should return 400 when commune parameter is missing', async () => {
    const req = makeRequest('/api/v1/economes/search-by-commune')
    const response = await GET_BY_COMMUNE(req)

    expect(response.status).toBe(400)
  })
})
