import { describe, it, expect } from 'vitest'

import { GET } from '@/app/api/v1/openapi.json/route'

describe('GET /api/v1/openapi.json', () => {
  it('should return 200 with valid JSON', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toBeDefined()
    expect(typeof body).toBe('object')
  })

  it('should contain paths and components', async () => {
    const response = await GET()
    const body = await response.json()

    expect(body.paths).toBeDefined()
    expect(body.components).toBeDefined()
    expect(Object.keys(body.paths).length).toBeGreaterThan(0)
    expect(body.components.schemas).toBeDefined()
  })

  it('should have openapi version 3.x', async () => {
    const response = await GET()
    const body = await response.json()

    expect(body.openapi).toBeDefined()
    expect(body.openapi).toMatch(/^3\.\d+\.\d+$/)
  })

  it('should have Content-Type application/json', async () => {
    const response = await GET()

    expect(response.headers.get('Content-Type')).toContain('application/json')
  })

  it('should include CORS headers', async () => {
    const response = await GET()

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
