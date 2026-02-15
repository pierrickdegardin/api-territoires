/**
 * GET /api/v1/territoires/regions
 *
 * List all regions
 *
 * Query Parameters:
 *   - geometry: Include geometry (default: false)
 *
 * Response:
 *   {
 *     "regions": [...],
 *     "total": 18
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createErrorResponse, ErrorCodes } from '@/lib/territoires/errors'
import { cacheKey, getFromCache, setInCache } from '@/lib/cache'
import { parseQueryParams, regionsQuerySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

async function handleGet(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, regionsQuerySchema)
    if (!parsed.success) return parsed.response

    const { geometry: includeGeometry } = parsed.data
    const { searchParams } = new URL(request.url)

    // Check cache
    const params = Object.fromEntries(searchParams.entries())
    const key = cacheKey('regions', params)
    const cached = await getFromCache<{ regions: unknown[]; total: number; meta: unknown }>(key)
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          ...corsHeaders,
          'X-Cache': 'HIT',
          'X-Response-Time': `${Date.now() - startTime}ms`,
        },
      })
    }

    // Fetch regions from Region table
    const regions = await prisma.region.findMany({
      select: {
        code: true,
        nom: true,
        population: true,
        superficie: true,
        chefLieu: true,
      },
      orderBy: { nom: 'asc' },
    })

    // Add geometry if requested (via raw SQL for PostGIS columns)
    let regionsWithGeometry = regions.map((r) => ({
      code: r.code,
      nom: r.nom,
      type: 'region' as const,
      population: r.population,
      superficie: r.superficie,
      chefLieu: r.chefLieu,
    }))

    if (includeGeometry && regions.length > 0) {
      const codes = regions.map((r) => r.code)
      const geoResults = await prisma.$queryRaw<
        Array<{
          code: string
          centroid_geojson: string | null
          geometry_geojson: string | null
        }>
      >`
        SELECT
          code,
          ST_AsGeoJSON(centroid)::text as centroid_geojson,
          ST_AsGeoJSON(geometry)::text as geometry_geojson
        FROM region
        WHERE code = ANY(${codes})
      `

      const geoMap = new Map(geoResults.map((g) => [g.code, g]))

      regionsWithGeometry = regions.map((r) => {
        const geo = geoMap.get(r.code)
        return {
          code: r.code,
          nom: r.nom,
          type: 'region' as const,
          population: r.population,
          superficie: r.superficie,
          chefLieu: r.chefLieu,
          centroid: geo?.centroid_geojson ? JSON.parse(geo.centroid_geojson) : null,
          geometry: geo?.geometry_geojson ? JSON.parse(geo.geometry_geojson) : null,
        }
      })
    }

    const duration = Date.now() - startTime

    const responseData = {
      regions: regionsWithGeometry,
      total: regions.length,
      meta: {
        includeGeometry,
        source: 'API Territoires (autonome)',
      },
    }

    // Cache result (fire-and-forget)
    setInCache(key, responseData)

    return NextResponse.json(responseData, {
      headers: {
        ...corsHeaders,
        'X-Cache': 'MISS',
        'X-Response-Time': `${duration}ms`,
      },
    })
  } catch (error) {
    console.error('GET /regions error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const GET = withRequestLogging(handleGet)
