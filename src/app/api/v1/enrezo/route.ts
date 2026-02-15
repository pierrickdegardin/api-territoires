/**
 * GET /api/v1/enrezo
 *
 * EnRezo API - Energy data from CEREMA
 *
 * Query Parameters:
 *   - type: Filter by data type (gisement, installation, plateforme, reseau, zone)
 *   - subtype: Filter by subtype within category
 *   - departement: Filter by department code
 *   - region: Filter by region code
 *   - commune: Filter by INSEE code
 *   - limit: Number of results (default: 100, max: 1000)
 *   - offset: Pagination offset
 *   - format: Response format (json, geojson)
 *
 * Response:
 *   {
 *     "data": [...],
 *     "total": 1234,
 *     "limit": 100,
 *     "offset": 0
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseQueryParams, enrezoQuerySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

async function handleGet(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, enrezoQuerySchema)
    if (!parsed.success) return parsed.response

    const { type, subtype, departement, region, commune, format, limit, offset, bbox } = parsed.data

    // If no type specified, return available endpoints and stats
    if (!type) {
      const stats = {
        gisements: await prisma.gisementChaleur.count(),
        installations: await prisma.installationProduction.count(),
        plateformes: await prisma.plateformeStockageBois.count(),
        reseaux: await prisma.reseauChaleurFroid.count(),
        zones: await prisma.zoneOpportunite.count(),
      }

      return NextResponse.json(
        {
          name: 'EnRezo API',
          description:
            "Données énergétiques CEREMA - EnR&R mobilisables, réseaux de chaleur/froid, zones d'opportunité",
          endpoints: {
            gisements: '/api/v1/enrezo?type=gisement',
            installations: '/api/v1/enrezo?type=installation',
            plateformes: '/api/v1/enrezo?type=plateforme',
            reseaux: '/api/v1/enrezo?type=reseau',
            zones: '/api/v1/enrezo?type=zone',
          },
          subtypes: {
            gisement: ['INCINERATION', 'INDUSTRIE', 'STEP', 'DATACENTER'],
            installation: ['CHAUFFERIE_BOIS', 'SOLAIRE_THERMIQUE', 'ELECTROGENE'],
            reseau: ['CHALEUR', 'FROID', 'CONSTRUCTION', 'PERIMETRE_PRIORITAIRE'],
            zone: ['CHALEUR_FORT_POTENTIEL', 'CHALEUR_POTENTIEL', 'FROID_FORT_POTENTIEL', 'FROID_POTENTIEL'],
          },
          statistics: stats,
          source: 'CEREMA EnRezo WFS',
        },
        { headers: corsHeaders }
      )
    }

    let data: any[] = []
    let total = 0

    // Build where clause for filtering
    const buildWhere = (typeField?: string) => {
      const where: any = {}
      if (subtype && typeField) where[typeField] = subtype.toUpperCase()
      if (departement) where.codeDepartement = departement
      if (region) where.codeRegion = region
      if (commune) where.codeInsee = commune
      return where
    }

    switch (type.toLowerCase()) {
      case 'gisement':
      case 'gisements': {
        const where = buildWhere('type')
        total = await prisma.gisementChaleur.count({ where })
        data = await prisma.gisementChaleur.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { nom: 'asc' },
        })
        break
      }

      case 'installation':
      case 'installations': {
        const where = buildWhere('type')
        total = await prisma.installationProduction.count({ where })
        data = await prisma.installationProduction.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { nom: 'asc' },
        })
        break
      }

      case 'plateforme':
      case 'plateformes': {
        const where = buildWhere()
        total = await prisma.plateformeStockageBois.count({ where })
        data = await prisma.plateformeStockageBois.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { nom: 'asc' },
        })
        break
      }

      case 'reseau':
      case 'reseaux': {
        // Use raw SQL to get actual LineString geometries
        const whereConditions: string[] = []
        const params: any[] = []
        let paramIndex = 1

        if (subtype) {
          whereConditions.push(`type = $${paramIndex}::type_reseau_chaleur`)
          params.push(subtype.toUpperCase())
          paramIndex++
        }
        if (departement) {
          whereConditions.push(`code_departement = $${paramIndex}`)
          params.push(departement)
          paramIndex++
        }
        if (region) {
          whereConditions.push(`code_region = $${paramIndex}`)
          params.push(region)
          paramIndex++
        }
        if (commune) {
          whereConditions.push(`code_insee = $${paramIndex}`)
          params.push(commune)
          paramIndex++
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

        // Count total
        const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
          `SELECT COUNT(*) as count FROM reseau_chaleur_froid ${whereClause}`,
          ...params
        )
        total = Number(countResult[0].count)

        // Add limit and offset as parameterized values
        const limitIdx = paramIndex
        const offsetIdx = paramIndex + 1
        params.push(limit, offset)

        // Fetch data with geometry as GeoJSON
        const dataResult = await prisma.$queryRawUnsafe<any[]>(
          `SELECT
            id, type, identifiant, nom, communes, code_insee as "codeInsee",
            code_departement as "codeDepartement", code_region as "codeRegion",
            gestionnaire, mo, classement, longueur_km as "longueurKm",
            nb_points_livraison as "nbPointsLivraison", production_mwh as "productionMwh",
            livraisons_mwh as "livraisonsMwh", rendement, taux_enr as "tauxEnr",
            vapeur, eau_chaude as "eauChaude", eau_surchauffee as "eauSurchauffee",
            date_mise_service as "dateMiseService", source,
            latitude, longitude,
            ST_AsGeoJSON(geometry)::json as geometry_geojson,
            created_at as "createdAt", updated_at as "updatedAt"
          FROM reseau_chaleur_froid
          ${whereClause}
          ORDER BY nom ASC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
          ...params
        )
        data = dataResult
        break
      }

      case 'zone':
      case 'zones': {
        // Use raw SQL to get actual Polygon geometries
        const whereConditions: string[] = []
        const params: any[] = []
        let paramIndex = 1

        if (subtype) {
          whereConditions.push(`type = $${paramIndex}::type_zone_opportunite`)
          params.push(subtype.toUpperCase())
          paramIndex++
        }
        if (departement) {
          whereConditions.push(`code_departement = $${paramIndex}`)
          params.push(departement)
          paramIndex++
        }
        if (region) {
          whereConditions.push(`code_region = $${paramIndex}`)
          params.push(region)
          paramIndex++
        }
        if (commune) {
          whereConditions.push(`code_insee = $${paramIndex}`)
          params.push(commune)
          paramIndex++
        }
        // Bbox filter: minLon,minLat,maxLon,maxLat
        if (bbox) {
          const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number)
          if (!isNaN(minLon) && !isNaN(minLat) && !isNaN(maxLon) && !isNaN(maxLat)) {
            whereConditions.push(
              `geometry && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)`
            )
            params.push(minLon, minLat, maxLon, maxLat)
            paramIndex += 4
          }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

        // Count total
        const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
          `SELECT COUNT(*) as count FROM zone_opportunite ${whereClause}`,
          ...params
        )
        total = Number(countResult[0].count)

        // Add limit and offset as parameterized values
        const limitIdx = paramIndex
        const offsetIdx = paramIndex + 1
        params.push(limit, offset)

        // Fetch data with geometry as GeoJSON
        const dataResult = await prisma.$queryRawUnsafe<any[]>(
          `SELECT
            id, type, id_zone as "idZone", code_insee as "codeInsee",
            code_departement as "codeDepartement", code_region as "codeRegion",
            class_mode as "classMode", class_dens_lin as "classDensLin", class_besoin as "classBesoin",
            filiere, scenario,
            besoin_chauffage as "besoinChauffage", besoin_ecs as "besoinEcs", besoin_froid as "besoinFroid",
            surface_m2 as "surfaceM2", perimetre_m as "perimetreM",
            latitude, longitude,
            ST_AsGeoJSON(geometry)::json as geometry_geojson,
            created_at as "createdAt", updated_at as "updatedAt"
          FROM zone_opportunite
          ${whereClause}
          ORDER BY id ASC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
          ...params
        )
        data = dataResult
        break
      }

      default:
        return NextResponse.json(
          { error: 'Invalid type. Use: gisement, installation, plateforme, reseau, zone' },
          { status: 400, headers: corsHeaders }
        )
    }

    // Format as GeoJSON if requested
    // Note: GeoJSON requires [longitude, latitude] order
    if (format === 'geojson') {
      const features = data
        .filter((item) => item.geometry_geojson != null || (item.latitude != null && item.longitude != null))
        .map((item) => {
          // Remove lat/lon and geometry_geojson from properties to avoid duplication
          const { latitude, longitude, geometry_geojson, ...props } = item

          // Use real geometry if available (for réseaux/zones with PostGIS geometry)
          // Otherwise fall back to Point from lat/lon
          const geometry = geometry_geojson || {
            type: 'Point',
            coordinates: [longitude, latitude], // [lon, lat] per GeoJSON spec
          }

          return {
            type: 'Feature',
            properties: props,
            geometry,
          }
        })

      return NextResponse.json(
        {
          type: 'FeatureCollection',
          features,
          totalCount: total,
          limit,
          offset,
        },
        { headers: corsHeaders }
      )
    }

    const searchTime = Date.now() - startTime

    return NextResponse.json(
      {
        data,
        total,
        limit,
        offset,
        searchTime: `${searchTime}ms`,
      },
      {
        headers: {
          ...corsHeaders,
          'X-Response-Time': `${searchTime}ms`,
          'X-Total-Count': total.toString(),
        },
      }
    )
  } catch (error) {
    console.error('EnRezo API error:', error)
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 500, headers: corsHeaders })
  }
}

export const GET = withRequestLogging(handleGet)
