/**
 * GET /api/v1/territoires/geojson
 *
 * Export territories as GeoJSON FeatureCollection
 *
 * Query Parameters:
 *   - type: Territory type (region, departement, commune, groupement, epci, syndicat)
 *   - groupementTypes: Comma-separated list of groupement types to include
 *     (EPCI_CC, EPCI_CA, EPCI_CU, EPCI_METROPOLE, EPCI_EPT, SYNDICAT, SYNDICAT_MIXTE, PETR, PAYS, PNR)
 *   - departement: Filter by department code
 *   - region: Filter by region code
 *   - limit: Max features (default: 100, max: 500 full / 10000 minimal)
 *   - minimal: If true, returns only code + geometry (for map display)
 *   - simplify: Tolerance for geometry simplification (e.g., 0.001)
 *
 * Response:
 *   {
 *     "type": "FeatureCollection",
 *     "features": [...]
 *   }
 *
 * Usage examples:
 *   - All EPCI: GET /geojson?type=epci&region=84
 *   - All syndicats: GET /geojson?type=syndicat&region=84
 *   - Specific types: GET /geojson?type=groupement&groupementTypes=EPCI_CC,EPCI_CA&region=84
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createErrorResponse, ErrorCodes } from '@/lib/territoires/errors'
import { parseQueryParams, geojsonQuerySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
}

// Valid types (shortcuts for common queries)
const VALID_TYPES = [
  'region',
  'departement',
  'commune',
  'groupement',
  'epci',
  'syndicat',
  'syndicat_energie',
  'pnr',
  'petr',
  'caue',
  'alec',
  'arec',
]

// Groupement type categories
const EPCI_TYPES = ['EPCI_CC', 'EPCI_CA', 'EPCI_CU', 'EPCI_METROPOLE', 'EPCI_EPT']
const SYNDICAT_TYPES = ['SYNDICAT', 'SYNDICAT_MIXTE']
const SYNDICAT_ENERGIE_TYPES = ['SYNDICAT_ENERGIE']
const OTHER_GROUPEMENT_TYPES = ['PETR', 'PAYS', 'PNR', 'CAUE', 'ALEC', 'AREC']
const ALL_GROUPEMENT_TYPES = [...EPCI_TYPES, ...SYNDICAT_TYPES, ...SYNDICAT_ENERGIE_TYPES, ...OTHER_GROUPEMENT_TYPES]

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

interface GeoFeature {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: Record<string, unknown> | null
}

async function handleGet(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, geojsonQuerySchema)
    if (!parsed.success) return parsed.response

    const {
      type,
      departement,
      region,
      limit: limitParam,
      minimal,
      simplify: simplifyTolerance,
      groupementTypes: groupementTypesParam,
    } = parsed.data

    // Parse groupementTypes filter
    let groupementTypesFilter: string[] | null = null
    if (groupementTypesParam && groupementTypesParam.length > 0) {
      groupementTypesFilter = groupementTypesParam
        .toUpperCase()
        .split(',')
        .filter((t) => ALL_GROUPEMENT_TYPES.includes(t))
    } else if (type === 'epci') {
      groupementTypesFilter = EPCI_TYPES
    } else if (type === 'syndicat') {
      groupementTypesFilter = SYNDICAT_TYPES
    } else if (type === 'syndicat_energie') {
      groupementTypesFilter = SYNDICAT_ENERGIE_TYPES
    } else if (type === 'pnr') {
      groupementTypesFilter = ['PNR']
    } else if (type === 'petr') {
      groupementTypesFilter = ['PETR']
    } else if (type === 'caue') {
      groupementTypesFilter = ['CAUE']
    } else if (type === 'alec') {
      groupementTypesFilter = ['ALEC']
    } else if (type === 'arec') {
      groupementTypesFilter = ['AREC']
    }

    // Pagination - higher limits for commune/geojson export
    // Note: Grand Est a ~5200 communes, on met 6000 max
    const maxLimit = type === 'commune' ? 6000 : minimal ? 10000 : 2000
    const defaultLimit = type === 'commune' ? 5000 : minimal ? 5000 : 100
    const limit = Math.min(Math.max(limitParam || defaultLimit, 1), maxLimit)

    // Validate simplify tolerance
    const safeSimplifyTolerance =
      simplifyTolerance && simplifyTolerance > 0 && isFinite(simplifyTolerance) ? simplifyTolerance : null

    // Geometry SQL helper - with optional simplification
    // toleranceParamIdx indicates which $N parameter holds the tolerance value
    const geomSql = (col: string, toleranceParamIdx: number | null) => {
      if (safeSimplifyTolerance && toleranceParamIdx !== null) {
        return `ST_AsGeoJSON(ST_Simplify(${col}, $${toleranceParamIdx}))::text`
      }
      return `ST_AsGeoJSON(${col})::text`
    }

    // Require at least one filter to prevent huge responses
    if (!type && !departement && !region) {
      return createErrorResponse(
        ErrorCodes.INVALID_REQUEST,
        'At least one filter is required (type, departement, or region)'
      )
    }

    const features: GeoFeature[] = []

    // Query regions
    if (!type || type === 'region') {
      const regionLimit = type === 'region' ? limit : 20

      // Use raw SQL for PostGIS geometry
      const regions = region
        ? await prisma.$queryRaw<
            Array<{
              code: string
              nom: string
              population: number | null
              geometry_geojson: string | null
              centroid_geojson: string | null
            }>
          >`
          SELECT
            code,
            nom,
            population,
            ST_AsGeoJSON(geometry)::text as geometry_geojson,
            ST_AsGeoJSON(centroid)::text as centroid_geojson
          FROM region
          WHERE code = ${region}
          ORDER BY nom
          LIMIT ${regionLimit}
        `
        : await prisma.$queryRaw<
            Array<{
              code: string
              nom: string
              population: number | null
              geometry_geojson: string | null
              centroid_geojson: string | null
            }>
          >`
          SELECT
            code,
            nom,
            population,
            ST_AsGeoJSON(geometry)::text as geometry_geojson,
            ST_AsGeoJSON(centroid)::text as centroid_geojson
          FROM region
          ORDER BY nom
          LIMIT ${regionLimit}
        `

      features.push(
        ...regions.map((r) => ({
          type: 'Feature' as const,
          properties: {
            code: r.code,
            nom: r.nom,
            type: 'region',
            population: r.population,
          },
          geometry: r.geometry_geojson
            ? JSON.parse(r.geometry_geojson)
            : r.centroid_geojson
              ? JSON.parse(r.centroid_geojson)
              : null,
        }))
      )
    }

    // Query departements
    if (!type || type === 'departement') {
      const whereConditions: string[] = []
      const params: unknown[] = []

      if (departement) {
        whereConditions.push(`code = $1`)
        params.push(departement)
      }
      if (region) {
        whereConditions.push(`code_region = $${params.length + 1}`)
        params.push(region)
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

      const deptLimit = type === 'departement' ? limit : 101
      params.push(deptLimit)
      const deptLimitParamIdx = params.length

      const depts = await prisma.$queryRawUnsafe<
        Array<{
          code: string
          nom: string
          code_region: string
          population: number | null
          geometry_geojson: string | null
          centroid_geojson: string | null
        }>
      >(
        `
        SELECT
          code,
          nom,
          code_region,
          population,
          ST_AsGeoJSON(geometry)::text as geometry_geojson,
          ST_AsGeoJSON(centroid)::text as centroid_geojson
        FROM departement
        ${whereClause}
        ORDER BY nom
        LIMIT $${deptLimitParamIdx}
      `,
        ...params
      )

      features.push(
        ...depts.map((d) => ({
          type: 'Feature' as const,
          properties: {
            code: d.code,
            nom: d.nom,
            type: 'departement',
            codeRegion: d.code_region,
            population: d.population,
          },
          geometry: d.geometry_geojson
            ? JSON.parse(d.geometry_geojson)
            : d.centroid_geojson
              ? JSON.parse(d.centroid_geojson)
              : null,
        }))
      )
    }

    // Query communes
    if (type === 'commune') {
      const whereConditions: string[] = []
      const params: unknown[] = []

      if (departement) {
        whereConditions.push(`code_departement = $1`)
        params.push(departement)
      }
      if (region) {
        whereConditions.push(`code_region = $${params.length + 1}`)
        params.push(region)
      }

      // Require departement or region for communes (too many otherwise)
      if (whereConditions.length === 0) {
        return createErrorResponse(ErrorCodes.INVALID_REQUEST, 'Communes require departement or region filter')
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`

      if (minimal) {
        // Minimal mode: only code + geometry for map display
        // Add simplify tolerance and limit as parameters
        const minimalParams = [...params]
        let toleranceIdx: number | null = null
        if (safeSimplifyTolerance) {
          minimalParams.push(safeSimplifyTolerance)
          toleranceIdx = minimalParams.length
        }
        minimalParams.push(limit)
        const minimalLimitIdx = minimalParams.length

        const communes = await prisma.$queryRawUnsafe<
          Array<{
            code: string
            geometry_geojson: string | null
          }>
        >(
          `
          SELECT
            code,
            ${geomSql('geometry', toleranceIdx)} as geometry_geojson
          FROM commune
          ${whereClause}
          AND geometry IS NOT NULL
          ORDER BY code
          LIMIT $${minimalLimitIdx}
        `,
          ...minimalParams
        )

        features.push(
          ...communes.map((c) => ({
            type: 'Feature' as const,
            id: c.code,
            properties: { code: c.code, type: 'commune' },
            geometry: c.geometry_geojson ? JSON.parse(c.geometry_geojson) : null,
          }))
        )
      } else {
        // Full mode: all properties
        // Add simplify tolerance and limit as parameters
        const fullParams = [...params]
        let toleranceIdx: number | null = null
        if (safeSimplifyTolerance) {
          fullParams.push(safeSimplifyTolerance)
          toleranceIdx = fullParams.length
        }
        fullParams.push(limit)
        const fullLimitIdx = fullParams.length

        const communes = await prisma.$queryRawUnsafe<
          Array<{
            code: string
            nom: string
            code_departement: string
            code_region: string
            population: number | null
            latitude: number | null
            longitude: number | null
            geometry_geojson: string | null
            centroid_geojson: string | null
          }>
        >(
          `
          SELECT
            code,
            nom,
            code_departement,
            code_region,
            population,
            latitude,
            longitude,
            ${geomSql('geometry', toleranceIdx)} as geometry_geojson,
            ST_AsGeoJSON(centroid)::text as centroid_geojson
          FROM commune
          ${whereClause}
          ORDER BY nom
          LIMIT $${fullLimitIdx}
        `,
          ...fullParams
        )

        features.push(
          ...communes.map((c) => ({
            type: 'Feature' as const,
            properties: {
              code: c.code,
              nom: c.nom,
              type: 'commune',
              codeDepartement: c.code_departement,
              codeRegion: c.code_region,
              population: c.population,
            },
            geometry: c.geometry_geojson
              ? JSON.parse(c.geometry_geojson)
              : c.centroid_geojson
                ? JSON.parse(c.centroid_geojson)
                : c.latitude && c.longitude
                  ? { type: 'Point', coordinates: [c.longitude, c.latitude] }
                  : null,
          }))
        )
      }
    }

    // Query groupements (including shortcuts for epci, syndicat, pnr, petr, caue, alec, arec)
    const GROUPEMENT_TYPE_SHORTCUTS = [
      'groupement',
      'epci',
      'syndicat',
      'syndicat_energie',
      'pnr',
      'petr',
      'caue',
      'alec',
      'arec',
    ]
    if (type && GROUPEMENT_TYPE_SHORTCUTS.includes(type)) {
      const whereConditions: string[] = []
      const params: unknown[] = []
      let paramIndex = 1

      if (region) {
        whereConditions.push(`code_region = $${paramIndex}`)
        params.push(region)
        paramIndex++
      }

      // Filter by groupement types if specified (cast to enum)
      if (groupementTypesFilter && groupementTypesFilter.length > 0) {
        const typePlaceholders = groupementTypesFilter.map((_, i) => `$${paramIndex + i}::type_groupement`).join(', ')
        whereConditions.push(`type IN (${typePlaceholders})`)
        params.push(...groupementTypesFilter)
        paramIndex += groupementTypesFilter.length
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

      // Add limit as parameter
      params.push(limit)
      const groupementLimitIdx = paramIndex

      const groupements = await prisma.$queryRawUnsafe<
        Array<{
          siren: string
          nom: string
          type: string
          code_region: string | null
          population: number | null
          nb_communes: number | null
          latitude: number | null
          longitude: number | null
          geometry_geojson: string | null
          centroid_geojson: string | null
        }>
      >(
        `
        SELECT
          siren,
          nom,
          type,
          code_region,
          population,
          nb_communes,
          latitude,
          longitude,
          ST_AsGeoJSON(geometry)::text as geometry_geojson,
          ST_AsGeoJSON(centroid)::text as centroid_geojson
        FROM groupement
        ${whereClause}
        ORDER BY nom
        LIMIT $${groupementLimitIdx}
      `,
        ...params
      )

      features.push(
        ...groupements.map((g) => ({
          type: 'Feature' as const,
          properties: {
            code: g.siren,
            nom: g.nom,
            type: g.type.toLowerCase(),
            codeRegion: g.code_region,
            population: g.population,
            nbCommunes: g.nb_communes,
          },
          geometry: g.geometry_geojson
            ? JSON.parse(g.geometry_geojson)
            : g.centroid_geojson
              ? JSON.parse(g.centroid_geojson)
              : g.latitude && g.longitude
                ? { type: 'Point', coordinates: [g.longitude, g.latitude] }
                : null,
        }))
      )
    }

    // Filter out features without geometry and limit total
    const validFeatures = features.filter((f) => f.geometry !== null).slice(0, limit)

    const featureCollection = {
      type: 'FeatureCollection',
      features: validFeatures,
      metadata: {
        total: validFeatures.length,
        filters: { type, departement, region, groupementTypes: groupementTypesFilter },
        generatedAt: new Date().toISOString(),
        source: 'API Territoires (autonome)',
      },
    }

    const duration = Date.now() - startTime

    return NextResponse.json(featureCollection, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/geo+json; charset=utf-8',
        'X-Response-Time': `${duration}ms`,
        'X-Feature-Count': validFeatures.length.toString(),
      },
    })
  } catch (error) {
    console.error('GET /territoires/geojson error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const GET = withRequestLogging(handleGet)
