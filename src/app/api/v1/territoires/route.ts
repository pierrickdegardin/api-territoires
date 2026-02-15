/**
 * GET /api/v1/territoires
 *
 * List territories with filters and pagination
 *
 * Query Parameters:
 *   - type: Filter by type (region, departement, commune, groupement)
 *   - departement: Filter by department code
 *   - region: Filter by region code
 *   - q: Search query (name)
 *   - limit: Number of results (default: 50, max: 500)
 *   - offset: Pagination offset
 *   - geometry: Include geometry (default: false)
 *
 * Response:
 *   {
 *     "territoires": [...],
 *     "total": 1234,
 *     "limit": 50,
 *     "offset": 0,
 *     "meta": { ... }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createErrorResponse, ErrorCodes } from '@/lib/territoires/errors'
import { checkRateLimit, rateLimitResponse, addRateLimitHeaders } from '@/lib/territoires/rate-limit'
import { parseQueryParams, listTerritoiresQuerySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
}

// Handle preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

// Valid territory types
const VALID_TYPES = ['region', 'departement', 'commune', 'groupement']

async function handleGet(request: NextRequest) {
  // Rate limiting check
  const rateLimitResult = await checkRateLimit(request)
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult)
  }

  const startTime = Date.now()

  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, listTerritoiresQuerySchema)
    if (!parsed.success) return parsed.response

    const { type, departement, region, q, geometry: includeGeometry, limit, offset } = parsed.data

    // Determine which tables to query based on type
    const typesToQuery = type ? [type] : VALID_TYPES

    interface TerritoireResult {
      code: string
      type: string
      nom: string
      codeDepartement?: string | null
      codeRegion?: string | null
      population?: number | null
      centroid?: unknown
      geometry?: unknown
    }

    // Build query functions for each type to run in parallel
    type TableQuery = () => Promise<{ count: number; items: TerritoireResult[] }>

    const queryFns: TableQuery[] = []

    for (const t of typesToQuery) {
      if (t === 'region') {
        queryFns.push(async () => {
          const where: { nom?: { contains: string; mode: 'insensitive' } } = {}
          if (q) where.nom = { contains: q, mode: 'insensitive' }

          const [count, items] = await Promise.all([
            prisma.region.count({ where }),
            prisma.region.findMany({
              where,
              select: { code: true, nom: true, population: true },
              take: limit,
              skip: offset,
              orderBy: { nom: 'asc' },
            }),
          ])

          return {
            count,
            items: items.map((r) => ({
              code: r.code,
              type: 'region' as const,
              nom: r.nom,
              population: r.population,
            })),
          }
        })
      }

      if (t === 'departement') {
        queryFns.push(async () => {
          const where: {
            nom?: { contains: string; mode: 'insensitive' }
            codeRegion?: string
          } = {}
          if (q) where.nom = { contains: q, mode: 'insensitive' }
          if (region) where.codeRegion = region

          const [count, items] = await Promise.all([
            prisma.departement.count({ where }),
            prisma.departement.findMany({
              where,
              select: { code: true, nom: true, codeRegion: true, population: true },
              take: limit,
              skip: offset,
              orderBy: { nom: 'asc' },
            }),
          ])

          return {
            count,
            items: items.map((d) => ({
              code: d.code,
              type: 'departement' as const,
              nom: d.nom,
              codeRegion: d.codeRegion,
              population: d.population,
            })),
          }
        })
      }

      if (t === 'commune') {
        queryFns.push(async () => {
          const where: {
            nom?: { contains: string; mode: 'insensitive' }
            codeDepartement?: string
            codeRegion?: string
          } = {}
          if (q) where.nom = { contains: q, mode: 'insensitive' }
          if (departement) where.codeDepartement = departement
          if (region) where.codeRegion = region

          const [count, items] = await Promise.all([
            prisma.commune.count({ where }),
            prisma.commune.findMany({
              where,
              select: {
                code: true,
                nom: true,
                codeDepartement: true,
                codeRegion: true,
                population: true,
              },
              take: limit,
              skip: offset,
              orderBy: { nom: 'asc' },
            }),
          ])

          return {
            count,
            items: items.map((c) => ({
              code: c.code,
              type: 'commune' as const,
              nom: c.nom,
              codeDepartement: c.codeDepartement,
              codeRegion: c.codeRegion,
              population: c.population,
            })),
          }
        })
      }

      if (t === 'groupement') {
        queryFns.push(async () => {
          const where: {
            nom?: { contains: string; mode: 'insensitive' }
            codeRegion?: string
          } = {}
          if (q) where.nom = { contains: q, mode: 'insensitive' }
          if (region) where.codeRegion = region

          const [count, items] = await Promise.all([
            prisma.groupement.count({ where }),
            prisma.groupement.findMany({
              where,
              select: {
                siren: true,
                nom: true,
                type: true,
                codeRegion: true,
                population: true,
              },
              take: limit,
              skip: offset,
              orderBy: { nom: 'asc' },
            }),
          ])

          return {
            count,
            items: items.map((g) => ({
              code: g.siren,
              type: g.type.toLowerCase(),
              nom: g.nom,
              codeRegion: g.codeRegion,
              population: g.population,
            })),
          }
        })
      }
    }

    // Run all table queries in parallel
    const queryResults = await Promise.all(queryFns.map((fn) => fn()))

    const totalCount = queryResults.reduce((sum, r) => sum + r.count, 0)
    const results: TerritoireResult[] = queryResults.flatMap((r) => r.items).slice(0, limit)

    const duration = Date.now() - startTime

    const response = NextResponse.json(
      {
        territoires: results,
        total: totalCount,
        limit,
        offset,
        meta: {
          includeGeometry,
          filters: { type, departement, region, q },
          source: 'API Territoires (autonome)',
          lastUpdate: new Date().toISOString(),
        },
      },
      {
        headers: {
          ...corsHeaders,
          'X-Response-Time': `${duration}ms`,
          'X-Total-Count': totalCount.toString(),
        },
      }
    )

    return addRateLimitHeaders(response, rateLimitResult)
  } catch (error) {
    console.error('GET /territoires error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const GET = withRequestLogging(handleGet)
