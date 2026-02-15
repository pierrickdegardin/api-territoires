/**
 * GET /api/v1/territoires/[code]/geometry
 *
 * Get territory geometry as GeoJSON Feature
 *
 * Query Parameters:
 *   - type: Force territory type (region, departement, commune, groupement)
 *           Useful when codes overlap (e.g., "24" = région CVL or département Dordogne)
 *   - simplify: Tolerance for geometry simplification (e.g., 0.001)
 *
 * Examples:
 *   - /24/geometry → région Centre-Val de Loire (default: region priority)
 *   - /24/geometry?type=departement → département Dordogne
 *   - /69123/geometry → commune Lyon
 *
 * Response:
 *   {
 *     "type": "Feature",
 *     "properties": { "code": "69123", "nom": "Lyon", "type": "commune" },
 *     "geometry": { "type": "MultiPolygon", "coordinates": [...] }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createErrorResponse, ErrorCodes } from '@/lib/territoires/errors'
import { parseQueryParams, geometryQuerySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

interface GeometryResult {
  code: string
  nom: string
  type: string
  code_departement?: string | null
  code_region?: string | null
  population: number | null
  geometry_geojson: string | null
  centroid_geojson: string | null
}

async function handleGet(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const startTime = Date.now()

  try {
    const { code } = await params

    // Validate code
    if (!code || code.length > 15) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 'Invalid territory code')
    }

    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, geometryQuerySchema)
    if (!parsed.success) return parsed.response

    const { type: forceType, simplify: simplifyTolerance } = parsed.data

    // Validate and sanitize simplify tolerance (must be a valid positive number)
    const safeSimplifyTolerance =
      simplifyTolerance && simplifyTolerance > 0 && isFinite(simplifyTolerance) ? simplifyTolerance : null

    // Geometry SQL helper - with optional simplification
    // $1 = code, $2 = simplify tolerance (when present)
    const geomSql = (col: string) => {
      if (safeSimplifyTolerance) {
        return `ST_AsGeoJSON(ST_Simplify(${col}, $2))::text`
      }
      return `ST_AsGeoJSON(${col})::text`
    }

    // Build params array: code is always $1, tolerance is $2 if present
    const queryParams: unknown[] = safeSimplifyTolerance ? [code, safeSimplifyTolerance] : [code]

    // Helper to run a geometry query for a given table
    const queryGeometry = (table: string, codeField: string, typeExpr: string, codeDeptExpr: string) => {
      return prisma.$queryRawUnsafe<GeometryResult[]>(
        `
        SELECT
          ${codeField} as code,
          nom,
          ${typeExpr} as type,
          ${codeDeptExpr} as code_departement,
          code_region,
          population,
          ${geomSql('geometry')} as geometry_geojson,
          ST_AsGeoJSON(centroid)::text as centroid_geojson
        FROM ${table}
        WHERE ${codeField} = $1
      `,
        ...queryParams
      )
    }

    let result: GeometryResult[] = []

    // If type is forced, search only in that table
    if (forceType === 'region') {
      result = await queryGeometry('region', 'code', "'region'", 'NULL')
    } else if (forceType === 'departement') {
      result = await queryGeometry('departement', 'code', "'departement'", 'code')
    } else if (forceType === 'commune') {
      result = await queryGeometry('commune', 'code', "'commune'", 'code_departement')
    } else if (forceType === 'groupement') {
      result = await queryGeometry('groupement', 'siren', 'type', 'NULL')
    }

    // If no forceType, use default logic based on code format
    // Determine type based on code format
    if (!forceType && result.length === 0) {
      if (code.length === 2 || code === '2A' || code === '2B') {
        // Region code (2 digits) - priority over departement
        result = await queryGeometry('region', 'code', "'region'", 'NULL')
      }

      // Try departement (2-3 chars) if not found as region
      if (result.length === 0 && code.length <= 3) {
        result = await queryGeometry('departement', 'code', "'departement'", 'code')
      }

      // Try commune (5 digits)
      if (result.length === 0 && code.length === 5) {
        result = await queryGeometry('commune', 'code', "'commune'", 'code_departement')
      }

      // Try groupement (SIREN - 9 digits)
      if (result.length === 0 && code.length === 9) {
        result = await queryGeometry('groupement', 'siren', 'type', 'NULL')
      }
    }

    // Fallback: try all tables if still not found
    if (result.length === 0) {
      // Try commune first (most common)
      result = await queryGeometry('commune', 'code', "'commune'", 'code_departement')

      // Try departement
      if (result.length === 0) {
        result = await queryGeometry('departement', 'code', "'departement'", 'code')
      }

      // Try region
      if (result.length === 0) {
        result = await queryGeometry('region', 'code', "'region'", 'NULL')
      }

      // Try groupement
      if (result.length === 0) {
        result = await queryGeometry('groupement', 'siren', 'type', 'NULL')
      }
    }

    if (result.length === 0) {
      return createErrorResponse(ErrorCodes.NOT_FOUND, `Territory ${code} not found`)
    }

    const territory = result[0]

    // Determine which geometry to use
    let geometry = null
    if (territory.geometry_geojson) {
      geometry = JSON.parse(territory.geometry_geojson)
    } else if (territory.centroid_geojson) {
      geometry = JSON.parse(territory.centroid_geojson)
    }

    if (!geometry) {
      return createErrorResponse(ErrorCodes.NOT_FOUND, `No geometry available for territory ${code}`)
    }

    // Build GeoJSON Feature
    const feature = {
      type: 'Feature',
      properties: {
        code: territory.code,
        nom: territory.nom,
        type: territory.type,
        departement: territory.code_departement,
        region: territory.code_region,
        population: territory.population,
      },
      geometry,
    }

    const duration = Date.now() - startTime

    return NextResponse.json(feature, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/geo+json',
        'X-Response-Time': `${duration}ms`,
      },
    })
  } catch (error) {
    console.error('GET /territoires/[code]/geometry error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const GET = withRequestLogging(handleGet)
