import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    batchMatchRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    batchMatchItem: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  }
  return { mockPrisma }
})

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

vi.mock('@/lib/territoires/matching', () => ({
  matchTerritoire: vi.fn(),
}))

import { submitBatchRequest, getBatchStatus, getBatchResults, cleanupExpiredBatches } from '../../lib/territoires/batch'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('submitBatchRequest', () => {
  it('should create a batch request and return status URLs', async () => {
    const mockRequest = {
      id: 'batch-123',
      clientId: null,
      totalItems: 2,
      expiresAt: new Date(),
    }
    mockPrisma.batchMatchRequest.create.mockResolvedValue(mockRequest)
    mockPrisma.batchMatchRequest.update.mockResolvedValue({})
    mockPrisma.batchMatchItem.findMany.mockResolvedValue([])

    const result = await submitBatchRequest(
      {
        items: [{ query: 'Lyon' }, { query: 'Paris' }],
      },
      'http://localhost:3020'
    )

    expect(result.requestId).toBe('batch-123')
    expect(result.status).toBe('pending')
    expect(result.totalItems).toBe(2)
    expect(result.statusUrl).toContain('/batch/batch-123')
    expect(result.resultsUrl).toContain('/batch/batch-123/results')
    expect(mockPrisma.batchMatchRequest.create).toHaveBeenCalledOnce()
  })

  it('should throw for empty items array', async () => {
    await expect(submitBatchRequest({ items: [] }, 'http://localhost:3020')).rejects.toThrow(
      'Items array cannot be empty'
    )
  })

  it('should throw for more than 1000 items', async () => {
    const items = Array.from({ length: 1001 }, (_, i) => ({ query: `City ${i}` }))
    await expect(submitBatchRequest({ items }, 'http://localhost:3020')).rejects.toThrow('Maximum 1000 items per batch')
  })

  it('should throw when items is not an array', async () => {
    await expect(submitBatchRequest({ items: null as unknown as [] }, 'http://localhost:3020')).rejects.toThrow(
      'Items array is required'
    )
  })

  it('should trim and truncate queries to 200 chars', async () => {
    const longQuery = 'a'.repeat(300)
    mockPrisma.batchMatchRequest.create.mockResolvedValue({
      id: 'batch-456',
      totalItems: 1,
    })
    mockPrisma.batchMatchRequest.update.mockResolvedValue({})
    mockPrisma.batchMatchItem.findMany.mockResolvedValue([])

    await submitBatchRequest({ items: [{ query: longQuery }] }, 'http://localhost:3020')

    const createCall = mockPrisma.batchMatchRequest.create.mock.calls[0][0]
    const itemData = createCall.data.items.create[0]
    expect(itemData.query.length).toBeLessThanOrEqual(200)
  })
})

describe('getBatchStatus', () => {
  it('should return status for existing request', async () => {
    mockPrisma.batchMatchRequest.findUnique.mockResolvedValue({
      id: 'batch-123',
      status: 'processing',
      totalItems: 10,
      processed: 5,
      matched: 3,
      suggestions: 1,
      failed: 1,
      createdAt: new Date('2026-01-01'),
      startedAt: new Date('2026-01-01'),
      completedAt: null,
    })

    const result = await getBatchStatus('batch-123')
    expect(result).not.toBeNull()
    expect(result!.requestId).toBe('batch-123')
    expect(result!.status).toBe('processing')
    expect(result!.progress).toBe(50)
  })

  it('should return null for non-existent request', async () => {
    mockPrisma.batchMatchRequest.findUnique.mockResolvedValue(null)

    const result = await getBatchStatus('nonexistent')
    expect(result).toBeNull()
  })

  it('should handle 0 total items without division by zero', async () => {
    mockPrisma.batchMatchRequest.findUnique.mockResolvedValue({
      id: 'batch-empty',
      status: 'completed',
      totalItems: 0,
      processed: 0,
      matched: 0,
      suggestions: 0,
      failed: 0,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    })

    const result = await getBatchStatus('batch-empty')
    expect(result!.progress).toBe(0)
  })
})

describe('getBatchResults', () => {
  it('should return results for completed batch', async () => {
    mockPrisma.batchMatchRequest.findUnique.mockResolvedValue({
      id: 'batch-done',
      status: 'completed',
      totalItems: 2,
      matched: 1,
      suggestions: 1,
      failed: 0,
      items: [
        {
          inputIndex: 0,
          query: 'Lyon',
          status: 'matched',
          code: '69123',
          nom: 'Lyon',
          type: 'commune',
          confidence: 0.95,
          matchSource: 'exact',
          alternatives: null,
          errorMessage: null,
        },
        {
          inputIndex: 1,
          query: 'Lyonnais',
          status: 'suggestions',
          code: null,
          nom: null,
          type: null,
          confidence: null,
          matchSource: null,
          alternatives: [{ code: '69123', nom: 'Lyon' }],
          errorMessage: null,
        },
      ],
    })

    const result = await getBatchResults('batch-done')
    expect(result).not.toBeNull()
    expect(result!.results).toHaveLength(2)
    expect(result!.results[0].status).toBe('matched')
    expect(result!.results[0].code).toBe('69123')
    expect(result!.results[1].status).toBe('suggestions')
    expect(result!.summary.successRate).toBe(50)
  })

  it('should return null for non-existent batch', async () => {
    mockPrisma.batchMatchRequest.findUnique.mockResolvedValue(null)

    const result = await getBatchResults('nonexistent')
    expect(result).toBeNull()
  })
})

describe('cleanupExpiredBatches', () => {
  it('should delete expired batch requests', async () => {
    mockPrisma.batchMatchRequest.deleteMany.mockResolvedValue({ count: 5 })

    const count = await cleanupExpiredBatches()
    expect(count).toBe(5)
    expect(mockPrisma.batchMatchRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: {
          lt: expect.any(Date),
        },
      },
    })
  })

  it('should return 0 when no expired batches', async () => {
    mockPrisma.batchMatchRequest.deleteMany.mockResolvedValue({ count: 0 })

    const count = await cleanupExpiredBatches()
    expect(count).toBe(0)
  })
})
