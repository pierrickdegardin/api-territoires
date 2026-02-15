/**
 * GET /api/v1/territoires/[code]/membres
 *
 * List member communes of a groupement (EPCI, syndicat, etc.)
 *
 * Query Parameters:
 *   - limit: Number of results (default: 50, max: 500)
 *   - offset: Pagination offset
 *   - geometry: Include geometry (default: false)
 *
 * Response:
 *   {
 *     "groupement": { "siren": "...", "nom": "...", "type": "..." },
 *     "membres": [...],
 *     "total": 123,
 *     "limit": 50,
 *     "offset": 0
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createErrorResponse, ErrorCodes } from '@/lib/territoires/errors'
import { checkRateLimit, rateLimitResponse, addRateLimitHeaders } from '@/lib/territoires/rate-limit'
import { parseQueryParams, membresQuerySchema, sirenSchema } from '@/lib/validation'
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

async function handleGet(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // Rate limiting check
  const rateLimitResult = await checkRateLimit(request)
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult)
  }

  const startTime = Date.now()

  try {
    const { code } = await params

    // Validate SIREN code
    const sirenResult = sirenSchema.safeParse(code)
    if (!sirenResult.success) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 'Invalid groupement SIREN (must be 9 characters)')
    }

    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, membresQuerySchema)
    if (!parsed.success) return parsed.response

    const { limit, offset, geometry: includeGeometry } = parsed.data

    // Verify groupement exists
    const groupement = await prisma.groupement.findUnique({
      where: { siren: code },
      select: { siren: true, nom: true, type: true, nbCommunes: true },
    })

    if (!groupement) {
      return createErrorResponse(ErrorCodes.NOT_FOUND, `Groupement ${code} not found`)
    }

    // Count total members
    const total = await prisma.communeGroupement.count({
      where: { groupementSiren: code },
    })

    // Fetch members with pagination
    const membres = await prisma.communeGroupement.findMany({
      where: { groupementSiren: code },
      include: {
        commune: {
          select: {
            code: true,
            nom: true,
            codeDepartement: true,
            codeRegion: true,
            population: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      skip: offset,
      take: limit,
    })

    // Transform results
    let membresData = membres.map((m) => ({
      code: m.commune.code,
      nom: m.commune.nom,
      type: 'commune' as const,
      codeDepartement: m.commune.codeDepartement,
      codeRegion: m.commune.codeRegion,
      population: m.commune.population,
      dateAdhesion: m.dateAdhesion,
    }))

    // Sort by name
    membresData.sort((a, b) => a.nom.localeCompare(b.nom))

    // Add geometry if requested
    if (includeGeometry && membresData.length > 0) {
      const codes = membresData.map((m) => m.code)
      const geoResults = await prisma.$queryRaw<
        Array<{
          code: string
          centroid_geojson: string | null
        }>
      >`
        SELECT
          code,
          ST_AsGeoJSON(centroid)::text as centroid_geojson
        FROM commune
        WHERE code = ANY(${codes})
      `

      const geoMap = new Map(geoResults.map((g) => [g.code, g]))

      // Also get lat/lng from the main query for fallback
      const communeCoords = new Map(
        membres.map((m) => [m.commune.code, { lat: m.commune.latitude, lng: m.commune.longitude }])
      )

      membresData = membresData.map((m) => {
        const geo = geoMap.get(m.code)
        const coords = communeCoords.get(m.code)
        const centroid = geo?.centroid_geojson
          ? JSON.parse(geo.centroid_geojson)
          : coords?.lng && coords?.lat
            ? { type: 'Point', coordinates: [coords.lng, coords.lat] }
            : null

        return {
          ...m,
          centroid,
        }
      })
    }

    const duration = Date.now() - startTime

    const response = NextResponse.json(
      {
        groupement: {
          siren: groupement.siren,
          nom: groupement.nom,
          type: groupement.type.toLowerCase(),
          nbCommunes: groupement.nbCommunes,
        },
        membres: membresData,
        total,
        limit,
        offset,
        meta: {
          hasMore: offset + membresData.length < total,
          nextOffset: offset + membresData.length < total ? offset + limit : null,
          source: 'API Territoires (autonome)',
        },
      },
      {
        headers: {
          ...corsHeaders,
          'X-Response-Time': `${duration}ms`,
          'X-Total-Count': total.toString(),
        },
      }
    )

    return addRateLimitHeaders(response, rateLimitResult)
  } catch (error) {
    console.error('GET /territoires/[code]/membres error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const GET = withRequestLogging(handleGet)
