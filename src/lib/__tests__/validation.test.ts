import { describe, it, expect } from 'vitest'
import {
  paginationSchema,
  bboxSchema,
  codeSchema,
  sirenSchema,
  searchQuerySchema,
  booleanParamSchema,
  matchBodySchema,
  batchBodySchema,
  parseQueryParams,
  parseBody,
  zodErrorResponse,
} from '../validation'

describe('paginationSchema', () => {
  it('should accept valid values', () => {
    const result = paginationSchema.safeParse({ limit: '50', offset: '10' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(50)
      expect(result.data.offset).toBe(10)
    }
  })

  it('should use defaults when values are missing', () => {
    const result = paginationSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(100)
      expect(result.data.offset).toBe(0)
    }
  })

  it('should reject limit above max (10000)', () => {
    const result = paginationSchema.safeParse({ limit: '10001' })
    expect(result.success).toBe(false)
  })

  it('should reject negative offset', () => {
    const result = paginationSchema.safeParse({ offset: '-1' })
    expect(result.success).toBe(false)
  })

  it('should reject limit of 0', () => {
    const result = paginationSchema.safeParse({ limit: '0' })
    expect(result.success).toBe(false)
  })

  it('should coerce string numbers', () => {
    const result = paginationSchema.safeParse({ limit: '25', offset: '5' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(25)
      expect(result.data.offset).toBe(5)
    }
  })
})

describe('bboxSchema', () => {
  it('should parse a valid bbox string', () => {
    const result = bboxSchema.safeParse('2.0,48.0,3.0,49.0')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        minLon: 2.0,
        minLat: 48.0,
        maxLon: 3.0,
        maxLat: 49.0,
      })
    }
  })

  it('should accept negative coordinates', () => {
    const result = bboxSchema.safeParse('-5.5,-10.2,3.0,49.0')
    expect(result.success).toBe(true)
  })

  it('should reject malformed bbox (missing value)', () => {
    const result = bboxSchema.safeParse('2.0,48.0,3.0')
    expect(result.success).toBe(false)
  })

  it('should reject non-numeric bbox', () => {
    const result = bboxSchema.safeParse('abc,def,ghi,jkl')
    expect(result.success).toBe(false)
  })

  it('should be optional (undefined passes)', () => {
    const result = bboxSchema.safeParse(undefined)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeUndefined()
    }
  })
})

describe('codeSchema', () => {
  it('should accept a 5-char INSEE code', () => {
    const result = codeSchema.safeParse('69123')
    expect(result.success).toBe(true)
  })

  it('should accept a 2-char region code', () => {
    const result = codeSchema.safeParse('84')
    expect(result.success).toBe(true)
  })

  it('should accept a 9-char SIREN', () => {
    const result = codeSchema.safeParse('200046977')
    expect(result.success).toBe(true)
  })

  it('should reject empty string', () => {
    const result = codeSchema.safeParse('')
    expect(result.success).toBe(false)
  })

  it('should reject string longer than 9 chars', () => {
    const result = codeSchema.safeParse('1234567890')
    expect(result.success).toBe(false)
  })
})

describe('sirenSchema', () => {
  it('should accept exactly 9 characters', () => {
    const result = sirenSchema.safeParse('200046977')
    expect(result.success).toBe(true)
  })

  it('should reject less than 9 characters', () => {
    const result = sirenSchema.safeParse('12345')
    expect(result.success).toBe(false)
  })

  it('should reject more than 9 characters', () => {
    const result = sirenSchema.safeParse('1234567890')
    expect(result.success).toBe(false)
  })
})

describe('searchQuerySchema', () => {
  it('should accept a valid query', () => {
    const result = searchQuerySchema.safeParse('Lyon')
    expect(result.success).toBe(true)
  })

  it('should reject empty string', () => {
    const result = searchQuerySchema.safeParse('')
    expect(result.success).toBe(false)
  })

  it('should reject query longer than 200 chars', () => {
    const result = searchQuerySchema.safeParse('a'.repeat(201))
    expect(result.success).toBe(false)
  })

  it('should accept query of exactly 200 chars', () => {
    const result = searchQuerySchema.safeParse('a'.repeat(200))
    expect(result.success).toBe(true)
  })
})

describe('booleanParamSchema', () => {
  it('should transform "true" to true', () => {
    const result = booleanParamSchema.safeParse('true')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(true)
    }
  })

  it('should transform "false" to false', () => {
    const result = booleanParamSchema.safeParse('false')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(false)
    }
  })

  it('should default to false when undefined', () => {
    const result = booleanParamSchema.safeParse(undefined)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(false)
    }
  })

  it('should reject invalid values', () => {
    const result = booleanParamSchema.safeParse('yes')
    expect(result.success).toBe(false)
  })
})

describe('matchBodySchema', () => {
  it('should accept valid body with query only', () => {
    const result = matchBodySchema.safeParse({ query: 'Lyon' })
    expect(result.success).toBe(true)
  })

  it('should accept valid body with hints', () => {
    const result = matchBodySchema.safeParse({
      query: 'Lyon',
      hints: { departement: '69', type: 'commune' },
    })
    expect(result.success).toBe(true)
  })

  it('should reject empty query', () => {
    const result = matchBodySchema.safeParse({ query: '' })
    expect(result.success).toBe(false)
  })
})

describe('batchBodySchema', () => {
  it('should accept valid batch body', () => {
    const result = batchBodySchema.safeParse({
      items: [{ query: 'Lyon' }, { query: 'Paris' }],
    })
    expect(result.success).toBe(true)
  })

  it('should reject empty items array', () => {
    const result = batchBodySchema.safeParse({ items: [] })
    expect(result.success).toBe(false)
  })

  it('should reject more than 1000 items', () => {
    const items = Array.from({ length: 1001 }, (_, i) => ({ query: `City ${i}` }))
    const result = batchBodySchema.safeParse({ items })
    expect(result.success).toBe(false)
  })

  it('should reject items with empty query', () => {
    const result = batchBodySchema.safeParse({
      items: [{ query: '' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('parseQueryParams', () => {
  it('should parse valid query params', () => {
    const result = parseQueryParams('http://localhost/api?limit=10&offset=5', paginationSchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(10)
      expect(result.data.offset).toBe(5)
    }
  })

  it('should return error response for invalid params', () => {
    const result = parseQueryParams('http://localhost/api?limit=-1', paginationSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response).toBeDefined()
    }
  })
})

describe('parseBody', () => {
  it('should parse valid body', () => {
    const result = parseBody({ query: 'test' }, matchBodySchema)
    expect(result.success).toBe(true)
  })

  it('should return error for invalid body', () => {
    const result = parseBody({}, matchBodySchema)
    expect(result.success).toBe(false)
  })
})

describe('zodErrorResponse', () => {
  it('should format Zod errors into a NextResponse', () => {
    const parseResult = matchBodySchema.safeParse({})
    if (!parseResult.success) {
      const response = zodErrorResponse(parseResult.error)
      expect(response.status).toBe(400)
    }
  })
})
