/**
 * GET /api/v1/territoires/groupements
 *
 * List groupements (EPCI, syndicats, etc.) with pagination
 *
 * Query Parameters:
 *   - type: Filter by type (EPCI_CC, EPCI_CA, EPCI_CU, EPCI_METROPOLE, SYNDICAT, etc.)
 *   - region: Filter by region code
 *   - q: Search by name
 *   - competence: Filter by competence (comp_1 to comp_123, or search by name like "électricité")
 *   - limit: Number of results (default: 50, max: 500)
 *   - offset: Pagination offset
 *   - geometry: Include geometry (default: false)
 *   - enriched: Include enriched BANATIC data (president, contacts, competences) (default: false)
 *
 * Response:
 *   {
 *     "groupements": [...],
 *     "total": 9578,
 *     "limit": 50,
 *     "offset": 0
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TypeGroupement } from '@prisma/client'
import { createErrorResponse, ErrorCodes } from '@/lib/territoires/errors'
import { formatCompetences, COMPETENCES_MAPPING } from '@/lib/competences-mapping'
import { cacheKey, getFromCache, setInCache } from '@/lib/cache'
import { parseQueryParams, groupementsQuerySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
}

// Valid groupement types
const VALID_TYPES: string[] = Object.values(TypeGroupement)

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

interface RawGroupement {
  siren: string
  nom: string
  type: string
  nature: string | null
  code_region: string | null
  population: number | null
  nb_communes: number | null
  latitude: number | null
  longitude: number | null
  commune_siege?: string | null
  mode_financement?: string | null
  date_creation?: Date | null
  syndicat_a_la_carte?: boolean | null
  interdepartemental?: boolean | null
  zone_montagne?: boolean | null
  epage?: boolean | null
  eptb?: boolean | null
  adresse?: string | null
  code_postal?: string | null
  ville?: string | null
  telephone?: string | null
  email?: string | null
  site_web?: string | null
  teom?: boolean | null
  reom?: boolean | null
  dotation_globale?: number | null
  dgf_par_habitant?: number | null
  potentiel_fiscal?: number | null
  densite?: number | null
  president_civilite?: string | null
  president_nom?: string | null
  president_prenom?: string | null
  nb_delegues?: number | null
  competences?: Record<string, boolean> | null
}

async function handleGet(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, groupementsQuerySchema)
    if (!parsed.success) return parsed.response

    const { region, q, competence, geometry: includeGeometry, enriched: includeEnriched, limit, offset } = parsed.data
    const type = parsed.data.type?.toUpperCase()
    const { searchParams } = new URL(request.url)

    // Check cache
    const cacheParams = Object.fromEntries(searchParams.entries())
    const key = cacheKey('groupements', cacheParams)
    const cached = await getFromCache<{
      groupements: unknown[]
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

    // Validate type if provided
    if (type && !VALID_TYPES.includes(type)) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, `Invalid type. Valid types: ${VALID_TYPES.join(', ')}`)
    }

    // Resolve competence filter to comp_XX key
    let competenceKey: string | null = null
    let competenceName: string | null = null
    if (competence) {
      // If already in comp_XX format
      if (competence.match(/^comp_\d+$/)) {
        competenceKey = competence
        competenceName = COMPETENCES_MAPPING[competence]?.nom || competence
      } else {
        // Search by name in mapping
        const searchLower = competence.toLowerCase()
        for (const [key, info] of Object.entries(COMPETENCES_MAPPING)) {
          if (info.nom.toLowerCase().includes(searchLower)) {
            competenceKey = key
            competenceName = info.nom
            break
          }
        }
      }

      if (!competenceKey) {
        return createErrorResponse(
          ErrorCodes.INVALID_REQUEST,
          `Competence not found: ${competence}. Use comp_1 to comp_123 or search by name (e.g., "électricité", "eau", "déchets").`
        )
      }
    }

    // Build SQL query (always use raw SQL for consistency and competence filter support)
    const whereConditions: string[] = []
    const params: unknown[] = []

    if (type) {
      whereConditions.push(`type = $${params.length + 1}::type_groupement`)
      params.push(type)
    }

    if (region) {
      whereConditions.push(`code_region = $${params.length + 1}`)
      params.push(region)
    }

    if (q) {
      whereConditions.push(`nom ILIKE $${params.length + 1}`)
      params.push(`%${q}%`)
    }

    if (competenceKey) {
      // competenceKey is validated above to match /^comp_\d+$/ or resolved from COMPETENCES_MAPPING
      // Use parameterized query for the key value
      params.push(competenceKey)
      whereConditions.push(`competences->>$${params.length} = 'true'`)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // Count total
    const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM groupement ${whereClause}`,
      ...params
    )
    const total = Number(countResult[0].count)

    // Select fields based on enriched flag
    const selectFields = includeEnriched
      ? `siren, nom, type::text, nature, code_region, population, nb_communes, latitude, longitude,
         commune_siege, mode_financement, date_creation, syndicat_a_la_carte, interdepartemental,
         zone_montagne, epage, eptb, adresse, code_postal, ville, telephone, email, site_web,
         teom, reom, dotation_globale, dgf_par_habitant, potentiel_fiscal, densite,
         president_civilite, president_nom, president_prenom, nb_delegues, competences`
      : `siren, nom, type::text, nature, code_region, population, nb_communes, latitude, longitude`

    // Add limit and offset as parameters
    params.push(limit, offset)
    const limitParamIdx = params.length - 1
    const offsetParamIdx = params.length

    const rawData = await prisma.$queryRawUnsafe<RawGroupement[]>(
      `SELECT ${selectFields} FROM groupement ${whereClause}
       ORDER BY type, nom LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      ...params
    )

    // Format response
    let groupements = rawData.map((g) => {
      const base = {
        code: g.siren,
        siren: g.siren,
        nom: g.nom,
        type: g.type.toLowerCase(),
        nature: g.nature,
        codeRegion: g.code_region,
        population: g.population,
        nbCommunes: g.nb_communes,
        latitude: g.latitude,
        longitude: g.longitude,
      }

      if (!includeEnriched) return base

      return {
        ...base,
        communeSiege: g.commune_siege,
        caracteristiques: {
          modeFinancement: g.mode_financement,
          dateCreation: g.date_creation,
          syndicatALaCarte: g.syndicat_a_la_carte,
          interdepartemental: g.interdepartemental,
          zoneMontagne: g.zone_montagne,
          epage: g.epage,
          eptb: g.eptb,
        },
        president: g.president_nom
          ? {
              civilite: g.president_civilite,
              nom: g.president_nom,
              prenom: g.president_prenom,
            }
          : null,
        contact: {
          adresse: g.adresse,
          codePostal: g.code_postal,
          ville: g.ville,
          telephone: g.telephone,
          email: g.email,
          siteWeb: g.site_web,
        },
        fiscalite: {
          teom: g.teom,
          reom: g.reom,
          dotationGlobale: g.dotation_globale,
          dgfParHabitant: g.dgf_par_habitant,
          potentielFiscal: g.potentiel_fiscal,
        },
        statistiques: {
          densite: g.densite,
          nbDelegues: g.nb_delegues,
        },
        // Use formatted competences with readable names
        competences: formatCompetences(g.competences ?? null),
      }
    })

    // Add geometry if requested
    if (includeGeometry && rawData.length > 0) {
      const sirens = rawData.map((g) => g.siren)
      const geoResults = await prisma.$queryRaw<
        Array<{
          siren: string
          centroid_geojson: string | null
          geometry_geojson: string | null
        }>
      >`
        SELECT
          siren,
          ST_AsGeoJSON(centroid)::text as centroid_geojson,
          ST_AsGeoJSON(geometry)::text as geometry_geojson
        FROM groupement
        WHERE siren = ANY(${sirens})
      `

      const geoMap = new Map(geoResults.map((g) => [g.siren, g]))

      // Merge geometry with existing groupement data
      groupements = groupements.map((g, idx) => {
        const geo = geoMap.get(g.siren)
        const originalGroupement = rawData[idx]
        const centroid = geo?.centroid_geojson
          ? JSON.parse(geo.centroid_geojson)
          : originalGroupement.longitude && originalGroupement.latitude
            ? { type: 'Point', coordinates: [originalGroupement.longitude, originalGroupement.latitude] }
            : null

        return {
          ...g,
          centroid,
          geometry: geo?.geometry_geojson ? JSON.parse(geo.geometry_geojson) : null,
        }
      })
    }

    const duration = Date.now() - startTime

    const responseData = {
      groupements,
      total,
      limit,
      offset,
      meta: {
        includeGeometry,
        includeEnriched,
        filters: {
          type,
          region,
          q,
          competence: competenceName ? { key: competenceKey, nom: competenceName } : null,
        },
        validTypes: VALID_TYPES.map((t) => t.toLowerCase()),
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
    console.error('GET /groupements error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const GET = withRequestLogging(handleGet)
