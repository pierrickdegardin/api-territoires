/**
 * GET /api/v1/territoires/communes
 *
 * List communes with pagination
 *
 * Query Parameters:
 *   - departement: Filter by department code
 *   - region: Filter by region code
 *   - q: Search by name
 *   - limit: Number of results (default: 50, max: 500)
 *   - offset: Pagination offset
 *   - geometry: Include geometry GeoJSON (default: false)
 *   - enriched: Include enriched BANATIC data (maire, contacts, stats) (default: false)
 *
 * Response:
 *   {
 *     "communes": [...],
 *     "total": 34875,
 *     "limit": 50,
 *     "offset": 0
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { createErrorResponse, ErrorCodes } from '@/lib/territoires/errors'
import { cacheKey, getFromCache, setInCache } from '@/lib/cache'
import { parseQueryParams, communesQuerySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

async function handleGet(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, communesQuerySchema)
    if (!parsed.success) return parsed.response

    const { departement, region, q, geometry: includeGeometry, enriched: includeEnriched, limit, offset } = parsed.data
    const { searchParams } = new URL(request.url)

    // Check cache
    const params = Object.fromEntries(searchParams.entries())
    const key = cacheKey('communes', params)
    const cached = await getFromCache<{
      communes: unknown[]
      total: number
      limit: number
      offset: number
      meta: unknown
    }>(key)
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          ...corsHeaders,
          'X-Cache': 'HIT',
          'X-Response-Time': `${Date.now() - startTime}ms`,
          'X-Total-Count': cached.total.toString(),
        },
      })
    }

    // Build where clause for Commune table
    const where: Prisma.CommuneWhereInput = {}

    if (departement) {
      where.codeDepartement = departement
    }

    if (region) {
      where.codeRegion = region
    }

    if (q) {
      const searchTerm = q.trim().toLowerCase()
      where.nom = { contains: searchTerm, mode: 'insensitive' }
    }

    // Count total
    const total = await prisma.commune.count({ where })

    // Build select based on enriched flag
    const baseSelect = {
      code: true,
      nom: true,
      codeDepartement: true,
      codeRegion: true,
      codesPostaux: true,
      population: true,
      superficie: true,
      latitude: true,
      longitude: true,
    }

    const enrichedSelect = includeEnriched
      ? {
          ...baseSelect,
          siren: true,
          canton: true,
          chefLieu: true,
          zoneMontagne: true,
          communeTouristique: true,
          franceRuralites: true,
          quartierPrioritaire: true,
          uniteUrbaine: true,
          bassinVie: true,
          aireAttraction: true,
          maireCivilite: true,
          maireNom: true,
          mairePrenom: true,
          adresse: true,
          codePostal: true,
          telephone: true,
          email: true,
          densite: true,
          variationPopulation: true,
          tauxActivite: true,
          tauxChomage: true,
          revenuFiscalMedian: true,
          dgfTotale: true,
          dgfParHabitant: true,
        }
      : baseSelect

    // Fetch communes from Commune table
    const communes = await prisma.commune.findMany({
      where,
      select: enrichedSelect,
      take: limit,
      skip: offset,
      orderBy: { nom: 'asc' },
    })

    // Format response
    let communesWithGeometry = communes.map((c) => {
      const base = {
        code: c.code,
        nom: c.nom,
        type: 'commune' as const,
        codeDepartement: c.codeDepartement,
        codeRegion: c.codeRegion,
        codesPostaux: c.codesPostaux,
        population: c.population,
        superficie: c.superficie,
      }

      if (!includeEnriched) return base

      // Add enriched data
      const enriched = c as typeof c & {
        siren?: string | null
        canton?: string | null
        chefLieu?: boolean | null
        zoneMontagne?: boolean | null
        communeTouristique?: boolean | null
        franceRuralites?: boolean | null
        quartierPrioritaire?: boolean | null
        uniteUrbaine?: string | null
        bassinVie?: string | null
        aireAttraction?: string | null
        maireCivilite?: string | null
        maireNom?: string | null
        mairePrenom?: string | null
        adresse?: string | null
        codePostal?: string | null
        telephone?: string | null
        email?: string | null
        densite?: number | null
        variationPopulation?: number | null
        tauxActivite?: number | null
        tauxChomage?: number | null
        revenuFiscalMedian?: number | null
        dgfTotale?: number | null
        dgfParHabitant?: number | null
      }

      return {
        ...base,
        siren: enriched.siren,
        caracteristiques: {
          canton: enriched.canton,
          chefLieu: enriched.chefLieu,
          zoneMontagne: enriched.zoneMontagne,
          communeTouristique: enriched.communeTouristique,
          franceRuralites: enriched.franceRuralites,
          quartierPrioritaire: enriched.quartierPrioritaire,
          uniteUrbaine: enriched.uniteUrbaine,
          bassinVie: enriched.bassinVie,
          aireAttraction: enriched.aireAttraction,
        },
        maire: enriched.maireNom
          ? {
              civilite: enriched.maireCivilite,
              nom: enriched.maireNom,
              prenom: enriched.mairePrenom,
            }
          : null,
        contact: {
          adresse: enriched.adresse,
          codePostal: enriched.codePostal,
          telephone: enriched.telephone,
          email: enriched.email,
        },
        statistiques: {
          densite: enriched.densite,
          variationPopulation: enriched.variationPopulation,
          tauxActivite: enriched.tauxActivite,
          tauxChomage: enriched.tauxChomage,
          revenuFiscalMedian: enriched.revenuFiscalMedian,
        },
        dotations: {
          dgfTotale: enriched.dgfTotale,
          dgfParHabitant: enriched.dgfParHabitant,
        },
      }
    })

    if (includeGeometry && communes.length > 0) {
      const codes = communes.map((c) => c.code)
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
        FROM commune
        WHERE code = ANY(${codes})
      `

      const geoMap = new Map(geoResults.map((g) => [g.code, g]))

      // Merge geometry with existing commune data (preserving enriched data)
      communesWithGeometry = communesWithGeometry.map((c, idx) => {
        const geo = geoMap.get(c.code)
        const originalCommune = communes[idx]
        // Use computed centroid from lat/lng if no PostGIS centroid
        const centroid = geo?.centroid_geojson
          ? JSON.parse(geo.centroid_geojson)
          : originalCommune.longitude && originalCommune.latitude
            ? { type: 'Point', coordinates: [originalCommune.longitude, originalCommune.latitude] }
            : null

        return {
          ...c,
          centroid,
          geometry: geo?.geometry_geojson ? JSON.parse(geo.geometry_geojson) : null,
        }
      })
    }

    const duration = Date.now() - startTime

    const responseData = {
      communes: communesWithGeometry,
      total,
      limit,
      offset,
      meta: {
        includeGeometry,
        includeEnriched,
        filters: { departement, region, q },
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
        'X-Total-Count': total.toString(),
      },
    })
  } catch (error) {
    console.error('GET /communes error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const GET = withRequestLogging(handleGet)
