/**
 * GET /api/v1/territoires/departements
 *
 * List all departments
 *
 * Query Parameters:
 *   - region: Filter by region code
 *   - geometry: Include geometry (default: false)
 *
 * Response:
 *   {
 *     "departements": [...],
 *     "total": 101
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { createErrorResponse, ErrorCodes } from '@/lib/territoires/errors'
import { cacheKey, getFromCache, setInCache } from '@/lib/cache'
import { parseQueryParams, departementsQuerySchema } from '@/lib/validation'
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
    const parsed = parseQueryParams(request.url, departementsQuerySchema)
    if (!parsed.success) return parsed.response

    const { region, geometry: includeGeometry } = parsed.data
    const { searchParams } = new URL(request.url)

    // Check cache
    const params = Object.fromEntries(searchParams.entries())
    const key = cacheKey('departements', params)
    const cached = await getFromCache<{ departements: unknown[]; total: number; meta: unknown }>(key)
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          ...corsHeaders,
          'X-Cache': 'HIT',
          'X-Response-Time': `${Date.now() - startTime}ms`,
        },
      })
    }

    // Build where clause
    const where: Prisma.DepartementWhereInput = {}
    if (region) {
      where.codeRegion = region
    }

    // Fetch departments from Departement table
    const departements = await prisma.departement.findMany({
      where,
      select: {
        code: true,
        nom: true,
        codeRegion: true,
        population: true,
        superficie: true,
        chefLieu: true,
      },
      orderBy: { code: 'asc' },
    })

    // Format response
    let departementsWithGeometry = departements.map((d) => ({
      code: d.code,
      nom: d.nom,
      type: 'departement' as const,
      codeRegion: d.codeRegion,
      population: d.population,
      superficie: d.superficie,
      chefLieu: d.chefLieu,
    }))

    // Add geometry if requested
    if (includeGeometry && departements.length > 0) {
      const codes = departements.map((d) => d.code)
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
        FROM departement
        WHERE code = ANY(${codes})
      `

      const geoMap = new Map(geoResults.map((g) => [g.code, g]))

      departementsWithGeometry = departements.map((d) => {
        const geo = geoMap.get(d.code)
        return {
          code: d.code,
          nom: d.nom,
          type: 'departement' as const,
          codeRegion: d.codeRegion,
          population: d.population,
          superficie: d.superficie,
          chefLieu: d.chefLieu,
          centroid: geo?.centroid_geojson ? JSON.parse(geo.centroid_geojson) : null,
          geometry: geo?.geometry_geojson ? JSON.parse(geo.geometry_geojson) : null,
        }
      })
    }

    const duration = Date.now() - startTime

    const responseData = {
      departements: departementsWithGeometry,
      total: departements.length,
      meta: {
        includeGeometry,
        filters: { region },
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
    console.error('GET /departements error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const GET = withRequestLogging(handleGet)
