import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    alias: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    region: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    departement: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    commune: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    groupement: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  }
  return { mockPrisma }
})

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

import { matchTerritoire } from '../territoires/matching'

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.alias.findFirst.mockResolvedValue(null)
  mockPrisma.region.findUnique.mockResolvedValue(null)
  mockPrisma.region.findFirst.mockResolvedValue(null)
  mockPrisma.region.findMany.mockResolvedValue([])
  mockPrisma.departement.findUnique.mockResolvedValue(null)
  mockPrisma.departement.findFirst.mockResolvedValue(null)
  mockPrisma.departement.findMany.mockResolvedValue([])
  mockPrisma.commune.findUnique.mockResolvedValue(null)
  mockPrisma.commune.findFirst.mockResolvedValue(null)
  mockPrisma.commune.findMany.mockResolvedValue([])
  mockPrisma.groupement.findUnique.mockResolvedValue(null)
  mockPrisma.groupement.findFirst.mockResolvedValue(null)
  mockPrisma.groupement.findMany.mockResolvedValue([])
})

describe('matchTerritoire', () => {
  it('should return failed for empty query', async () => {
    const result = await matchTerritoire({ query: '' })
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.message).toBe('Query is required')
    }
  })

  it('should return failed for whitespace-only query', async () => {
    const result = await matchTerritoire({ query: '   ' })
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.message).toBe('Query is required')
    }
  })

  it('should match by exact INSEE code (5 chars commune)', async () => {
    mockPrisma.commune.findUnique.mockResolvedValue({ code: '69123', nom: 'Lyon' })

    const result = await matchTerritoire({ query: '69123' })
    expect(result.status).toBe('matched')
    if (result.status === 'matched') {
      expect(result.code).toBe('69123')
      expect(result.nom).toBe('Lyon')
      expect(result.type).toBe('commune')
      expect(result.confidence).toBe(1.0)
      expect(result.matchSource).toBe('direct')
    }
  })

  it('should match by SIREN code (9 chars groupement)', async () => {
    mockPrisma.groupement.findUnique.mockResolvedValue({
      siren: '200046977',
      nom: 'Métropole de Lyon',
      type: 'EPCI_METROPOLE',
    })

    const result = await matchTerritoire({ query: '200046977' })
    expect(result.status).toBe('matched')
    if (result.status === 'matched') {
      expect(result.code).toBe('200046977')
      expect(result.nom).toBe('Métropole de Lyon')
      expect(result.type).toBe('epci_metropole')
      expect(result.confidence).toBe(1.0)
      expect(result.matchSource).toBe('direct')
    }
  })

  it('should match by name via database fuzzy search', async () => {
    // No direct code match, no alias match
    // But database search returns a single result
    mockPrisma.commune.findMany.mockResolvedValue([
      { code: '69123', nom: 'Lyon', codeDepartement: '69', codeRegion: '84' },
    ])

    const result = await matchTerritoire({ query: 'Lyon' })
    expect(result.status).toBe('matched')
    if (result.status === 'matched') {
      expect(result.code).toBe('69123')
      expect(result.matchSource).toBe('database')
    }
  })

  it('should match via alias table', async () => {
    // Alias finds a match
    mockPrisma.alias.findFirst.mockResolvedValueOnce({
      codeOfficiel: '244000675',
      source: 'manual',
      type: 'syndicat',
    })
    // findByCode resolves the alias code
    mockPrisma.groupement.findUnique.mockResolvedValue({
      siren: '244000675',
      nom: 'SYDEC',
      type: 'SYNDICAT',
    })

    const result = await matchTerritoire({ query: 'SYDEC des Landes' })
    expect(result.status).toBe('matched')
    if (result.status === 'matched') {
      expect(result.code).toBe('244000675')
      expect(result.matchSource).toBe('alias')
    }
  })

  it('should return suggestions for ambiguous name matches', async () => {
    // Multiple results with similar confidence (below 0.9)
    mockPrisma.region.findMany.mockResolvedValue([{ code: '75', nom: 'Nouvelle-Aquitaine' }])
    mockPrisma.departement.findMany.mockResolvedValue([{ code: '75', nom: 'Paris', codeRegion: '11' }])
    mockPrisma.commune.findMany.mockResolvedValue([
      { code: '75056', nom: 'Paris', codeDepartement: '75', codeRegion: '11' },
      { code: '75101', nom: 'Paris 1er Arrondissement', codeDepartement: '75', codeRegion: '11' },
    ])

    const result = await matchTerritoire({ query: 'Par' })
    // Multiple results, top hit confidence < 0.9 => suggestions
    expect(result.status).toBe('suggestions')
    if (result.status === 'suggestions') {
      expect(result.alternatives.length).toBeGreaterThan(1)
    }
  })

  it('should return failed when no match found anywhere', async () => {
    // Everything returns empty
    const result = await matchTerritoire({ query: 'zzz_nonexistent_zzz' })
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.message).toContain('No territoire found')
    }
  })

  it('should match region by 2-char code', async () => {
    mockPrisma.region.findUnique.mockResolvedValue({ code: '84', nom: 'Auvergne-Rhône-Alpes' })

    const result = await matchTerritoire({ query: '84' })
    expect(result.status).toBe('matched')
    if (result.status === 'matched') {
      expect(result.code).toBe('84')
      expect(result.type).toBe('region')
      expect(result.confidence).toBe(1.0)
    }
  })

  it('should use type hint to narrow search', async () => {
    mockPrisma.commune.findMany.mockResolvedValue([
      { code: '69123', nom: 'Lyon', codeDepartement: '69', codeRegion: '84' },
    ])

    const result = await matchTerritoire({
      query: 'Lyon',
      hints: { type: 'commune' },
    })
    expect(result.status).toBe('matched')
    if (result.status === 'matched') {
      expect(result.type).toBe('commune')
    }
    // With type=commune hint, region.findMany should not be called for fuzzy search
    // (the search narrows to commune only)
  })

  it('should handle database errors gracefully', async () => {
    // Direct code lookup returns null, alias returns null
    // But fuzzy search throws
    mockPrisma.region.findMany.mockRejectedValue(new Error('DB connection lost'))

    const result = await matchTerritoire({ query: 'Something' })
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.message).toBe('Search service temporarily unavailable')
    }
  })
})
