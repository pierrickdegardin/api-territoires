import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockMatchTerritoire } = vi.hoisted(() => {
  const mockMatchTerritoire = vi.fn()
  return { mockMatchTerritoire }
})

vi.mock('@/lib/territoires/matching', () => ({
  matchTerritoire: mockMatchTerritoire,
}))

vi.mock('@/lib/territoires/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 }),
  rateLimitResponse: vi.fn(),
  addRateLimitHeaders: vi.fn((response: any) => response),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  generateRequestId: vi.fn().mockReturnValue('test-req-id-123'),
  withRequestLogging: vi.fn((handler: Function) => {
    return async (request: Request, context?: any) => {
      const response = handler.length === 0 ? await handler() : await handler(request, context)
      response.headers.set('X-Request-ID', 'test-req-id-123')
      return response
    }
  }),
}))

import { POST } from '@/app/api/v1/territoires/match/route'

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost:3020/api/v1/territoires/match'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/v1/territoires/match', () => {
  it('should return matched result for valid query', async () => {
    mockMatchTerritoire.mockResolvedValue({
      status: 'matched',
      code: '69123',
      confidence: 1.0,
      nom: 'Lyon',
      type: 'commune',
      matchSource: 'direct',
    })

    const req = makePostRequest({ query: '69123' })
    const response = await POST(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('matched')
    expect(body.code).toBe('69123')
    expect(body.nom).toBe('Lyon')
    expect(body.confidence).toBe(1.0)
  })

  it('should return 400 for missing body', async () => {
    // Create a request with invalid JSON
    const req = new NextRequest(new URL('http://localhost:3020/api/v1/territoires/match'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    })

    const response = await POST(req)
    expect(response.status).toBe(400)
  })

  it('should return 400 for empty query', async () => {
    const req = makePostRequest({ query: '' })
    const response = await POST(req)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  it('should return failed status when no match found', async () => {
    mockMatchTerritoire.mockResolvedValue({
      status: 'failed',
      message: 'No territoire found matching "zzz_nonexistent"',
    })

    const req = makePostRequest({ query: 'zzz_nonexistent' })
    const response = await POST(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('failed')
    expect(body.message).toContain('No territoire found')
  })

  it('should return suggestions for ambiguous query', async () => {
    mockMatchTerritoire.mockResolvedValue({
      status: 'suggestions',
      alternatives: [
        { code: '75056', nom: 'Paris', type: 'commune', confidence: 0.85 },
        { code: '75', nom: 'Paris', type: 'departement', confidence: 0.85 },
      ],
    })

    const req = makePostRequest({ query: 'Paris' })
    const response = await POST(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('suggestions')
    expect(body.alternatives).toHaveLength(2)
  })

  it('should include CORS headers', async () => {
    mockMatchTerritoire.mockResolvedValue({
      status: 'matched',
      code: '69123',
      confidence: 1.0,
      nom: 'Lyon',
      type: 'commune',
      matchSource: 'direct',
    })

    const req = makePostRequest({ query: 'Lyon' })
    const response = await POST(req)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should include X-Request-ID in response', async () => {
    mockMatchTerritoire.mockResolvedValue({
      status: 'matched',
      code: '84',
      confidence: 1.0,
      nom: 'Auvergne-Rhône-Alpes',
      type: 'region',
      matchSource: 'direct',
    })

    const req = makePostRequest({ query: '84' })
    const response = await POST(req)

    expect(response.headers.get('X-Request-ID')).toBe('test-req-id-123')
  })

  it('should pass hints to matchTerritoire', async () => {
    mockMatchTerritoire.mockResolvedValue({
      status: 'matched',
      code: '69123',
      confidence: 0.95,
      nom: 'Lyon',
      type: 'commune',
      matchSource: 'database',
    })

    const req = makePostRequest({
      query: 'Lyon',
      hints: { departement: '69', type: 'commune' },
    })
    await POST(req)

    expect(mockMatchTerritoire).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Lyon',
        hints: expect.objectContaining({
          departement: '69',
          type: 'commune',
        }),
      })
    )
  })
})
