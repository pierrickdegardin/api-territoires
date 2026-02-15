/**
 * GET /api/v1/territoires/[code]
 *
 * Get a single territory by code
 *
 * Query Parameters:
 *   - type: Force territory type (region, departement, commune, groupement)
 *           Useful when codes overlap (e.g., "24" = région CVL or département Dordogne)
 *   - geometry: Include geometry (default: false)
 *   - membres: Include member communes (for groupements)
 *   - enriched: Include enriched BANATIC data (default: true for single territory)
 *
 * Examples:
 *   - /24 → région Centre-Val de Loire (default: region priority)
 *   - /24?type=departement → département Dordogne
 *   - /69123 → commune Lyon
 *   - /200046977 → Métropole de Lyon (groupement)
 *
 * Response:
 *   {
 *     "code": "69123",
 *     "type": "commune",
 *     "nom": "Lyon",
 *     "departement": "69",
 *     "region": "84",
 *     "population": 516092,
 *     "geometry": { ... },  // if requested
 *     "membres": [...]      // if requested (for groupements)
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createErrorResponse,
  ErrorCodes,
  createNotFoundWithSuggestions,
  NotFoundSuggestion,
} from '@/lib/territoires/errors'
import { checkRateLimit, rateLimitResponse, addRateLimitHeaders } from '@/lib/territoires/rate-limit'
import { formatCompetences } from '@/lib/competences-mapping'
import { parseQueryParams, codeDetailQuerySchema, codeSchema } from '@/lib/validation'
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

    // Validate code
    const codeResult = codeSchema.safeParse(code)
    if (!codeResult.success) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 'Invalid territory code (1-9 characters)')
    }

    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, codeDetailQuerySchema)
    if (!parsed.success) return parsed.response

    const {
      type: forceType,
      geometry: includeGeometry,
      membres: includeMembres,
      enriched: includeEnriched,
    } = parsed.data

    // Try to find the territory in each table
    let territoire: Record<string, unknown> | null = null
    let type: string | null = null

    // If type is forced, search only in that table
    if (forceType === 'departement') {
      const dept = await prisma.departement.findUnique({
        where: { code },
        select: {
          code: true,
          nom: true,
          codeRegion: true,
          population: true,
          superficie: true,
          chefLieu: true,
        },
      })
      if (dept) {
        territoire = { ...dept, type: 'departement' }
        type = 'departement'
      }
    } else if (forceType === 'region') {
      const region = await prisma.region.findUnique({
        where: { code },
        select: {
          code: true,
          nom: true,
          population: true,
          superficie: true,
          chefLieu: true,
        },
      })
      if (region) {
        territoire = { ...region, type: 'region' }
        type = 'region'
      }
    } else if (forceType === 'commune') {
      const commune = await prisma.commune.findUnique({
        where: { code },
        select: {
          code: true,
          nom: true,
          codeDepartement: true,
          codeRegion: true,
          codesPostaux: true,
          population: true,
          superficie: true,
          latitude: true,
          longitude: true,
        },
      })
      if (commune) {
        territoire = { ...commune, type: 'commune' }
        type = 'commune'
      }
    } else if (forceType === 'groupement') {
      const groupement = await prisma.groupement.findUnique({
        where: { siren: code },
        select: {
          siren: true,
          nom: true,
          type: true,
          nature: true,
          codeRegion: true,
          population: true,
          nbCommunes: true,
          latitude: true,
          longitude: true,
        },
      })
      if (groupement) {
        territoire = {
          code: groupement.siren,
          siren: groupement.siren,
          nom: groupement.nom,
          type: groupement.type.toLowerCase(),
          nature: groupement.nature,
          codeRegion: groupement.codeRegion,
          population: groupement.population,
          nbCommunes: groupement.nbCommunes,
          latitude: groupement.latitude,
          longitude: groupement.longitude,
        }
        type = 'groupement'
      }
    }

    // If no forceType or not found with forceType, use default logic
    // Try Region (2 chars) - only if not forcing another type
    if (!territoire && !forceType && code.length === 2) {
      const region = await prisma.region.findUnique({
        where: { code },
        select: {
          code: true,
          nom: true,
          population: true,
          superficie: true,
          chefLieu: true,
        },
      })
      if (region) {
        territoire = { ...region, type: 'region' }
        type = 'region'
      }
    }

    // Try Departement (2-3 chars)
    if (!territoire && !forceType && code.length <= 3) {
      const dept = await prisma.departement.findUnique({
        where: { code },
        select: {
          code: true,
          nom: true,
          codeRegion: true,
          population: true,
          superficie: true,
          chefLieu: true,
        },
      })
      if (dept) {
        territoire = { ...dept, type: 'departement' }
        type = 'departement'
      }
    }

    // Try Commune (5 chars) - only if not forcing another type
    if (!territoire && !forceType && code.length === 5) {
      const commune = await prisma.commune.findUnique({
        where: { code },
        select: {
          code: true,
          nom: true,
          codeDepartement: true,
          codeRegion: true,
          codesPostaux: true,
          population: true,
          superficie: true,
          latitude: true,
          longitude: true,
          ...(includeEnriched && {
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
          }),
        },
      })
      if (commune) {
        if (includeEnriched) {
          const c = commune as typeof commune & {
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
          territoire = {
            code: c.code,
            nom: c.nom,
            type: 'commune',
            codeDepartement: c.codeDepartement,
            codeRegion: c.codeRegion,
            codesPostaux: c.codesPostaux,
            population: c.population,
            superficie: c.superficie,
            siren: c.siren,
            caracteristiques: {
              canton: c.canton,
              chefLieu: c.chefLieu,
              zoneMontagne: c.zoneMontagne,
              communeTouristique: c.communeTouristique,
              franceRuralites: c.franceRuralites,
              quartierPrioritaire: c.quartierPrioritaire,
              uniteUrbaine: c.uniteUrbaine,
              bassinVie: c.bassinVie,
              aireAttraction: c.aireAttraction,
            },
            maire: c.maireNom
              ? {
                  civilite: c.maireCivilite,
                  nom: c.maireNom,
                  prenom: c.mairePrenom,
                }
              : null,
            contact: {
              adresse: c.adresse,
              codePostal: c.codePostal,
              telephone: c.telephone,
              email: c.email,
            },
            statistiques: {
              densite: c.densite,
              variationPopulation: c.variationPopulation,
              tauxActivite: c.tauxActivite,
              tauxChomage: c.tauxChomage,
              revenuFiscalMedian: c.revenuFiscalMedian,
            },
            dotations: {
              dgfTotale: c.dgfTotale,
              dgfParHabitant: c.dgfParHabitant,
            },
          }
        } else {
          territoire = { ...commune, type: 'commune' }
        }
        type = 'commune'
      }
    }

    // Try Groupement (9 chars SIREN) - only if not forcing another type
    if (!territoire && !forceType && code.length === 9) {
      const groupement = await prisma.groupement.findUnique({
        where: { siren: code },
        select: {
          siren: true,
          nom: true,
          type: true,
          nature: true,
          codeRegion: true,
          population: true,
          nbCommunes: true,
          latitude: true,
          longitude: true,
          ...(includeEnriched && {
            communeSiege: true,
            modeFinancement: true,
            dateCreation: true,
            syndicatALaCarte: true,
            interdepartemental: true,
            zoneMontagne: true,
            epage: true,
            eptb: true,
            adresse: true,
            codePostal: true,
            ville: true,
            telephone: true,
            email: true,
            siteWeb: true,
            teom: true,
            reom: true,
            dotationGlobale: true,
            dgfParHabitant: true,
            potentielFiscal: true,
            densite: true,
            presidentCivilite: true,
            presidentNom: true,
            presidentPrenom: true,
            nbDelegues: true,
            competences: true,
          }),
        },
      })
      if (groupement) {
        if (includeEnriched) {
          const g = groupement as typeof groupement & {
            communeSiege?: string | null
            modeFinancement?: string | null
            dateCreation?: Date | null
            syndicatALaCarte?: boolean | null
            interdepartemental?: boolean | null
            zoneMontagne?: boolean | null
            epage?: boolean | null
            eptb?: boolean | null
            adresse?: string | null
            codePostal?: string | null
            ville?: string | null
            telephone?: string | null
            email?: string | null
            siteWeb?: string | null
            teom?: boolean | null
            reom?: boolean | null
            dotationGlobale?: number | null
            dgfParHabitant?: number | null
            potentielFiscal?: number | null
            densite?: number | null
            presidentCivilite?: string | null
            presidentNom?: string | null
            presidentPrenom?: string | null
            nbDelegues?: number | null
            competences?: Record<string, boolean> | null
          }
          territoire = {
            code: g.siren,
            siren: g.siren,
            nom: g.nom,
            type: g.type.toLowerCase(),
            nature: g.nature,
            codeRegion: g.codeRegion,
            population: g.population,
            nbCommunes: g.nbCommunes,
            latitude: groupement.latitude,
            longitude: groupement.longitude,
            communeSiege: g.communeSiege,
            caracteristiques: {
              modeFinancement: g.modeFinancement,
              dateCreation: g.dateCreation,
              syndicatALaCarte: g.syndicatALaCarte,
              interdepartemental: g.interdepartemental,
              zoneMontagne: g.zoneMontagne,
              epage: g.epage,
              eptb: g.eptb,
            },
            president: g.presidentNom
              ? {
                  civilite: g.presidentCivilite,
                  nom: g.presidentNom,
                  prenom: g.presidentPrenom,
                }
              : null,
            contact: {
              adresse: g.adresse,
              codePostal: g.codePostal,
              ville: g.ville,
              telephone: g.telephone,
              email: g.email,
              siteWeb: g.siteWeb,
            },
            fiscalite: {
              teom: g.teom,
              reom: g.reom,
              dotationGlobale: g.dotationGlobale,
              dgfParHabitant: g.dgfParHabitant,
              potentielFiscal: g.potentielFiscal,
            },
            statistiques: {
              densite: g.densite,
              nbDelegues: g.nbDelegues,
            },
            competences: formatCompetences(g.competences ?? null),
          }
        } else {
          territoire = {
            code: groupement.siren,
            siren: groupement.siren,
            nom: groupement.nom,
            type: groupement.type.toLowerCase(),
            nature: groupement.nature,
            codeRegion: groupement.codeRegion,
            population: groupement.population,
            nbCommunes: groupement.nbCommunes,
            latitude: groupement.latitude,
            longitude: groupement.longitude,
          }
        }
        type = 'groupement'
      }
    }

    if (!territoire || !type) {
      // Try to find suggestions
      const suggestions = await findSuggestions(code)
      return createNotFoundWithSuggestions(code, suggestions, {
        'X-Response-Time': `${Date.now() - startTime}ms`,
      })
    }

    // Add geometry if requested
    if (includeGeometry) {
      // Whitelist table/field names to prevent SQL injection via type variable
      const tableMap: Record<string, { table: string; field: string }> = {
        region: { table: 'region', field: 'code' },
        departement: { table: 'departement', field: 'code' },
        commune: { table: 'commune', field: 'code' },
        groupement: { table: 'groupement', field: 'siren' },
      }
      const tableInfo = tableMap[type]

      const geoResult = tableInfo
        ? await prisma.$queryRawUnsafe<
            Array<{
              centroid_geojson: string | null
              geometry_geojson: string | null
            }>
          >(
            `SELECT
              ST_AsGeoJSON(centroid)::text as centroid_geojson,
              ST_AsGeoJSON(geometry)::text as geometry_geojson
            FROM ${tableInfo.table}
            WHERE ${tableInfo.field} = $1`,
            code
          )
        : []

      if (geoResult.length > 0 && geoResult[0]) {
        territoire.centroid = geoResult[0].centroid_geojson ? JSON.parse(geoResult[0].centroid_geojson) : null
        territoire.geometry = geoResult[0].geometry_geojson ? JSON.parse(geoResult[0].geometry_geojson) : null
      }
    }

    // Add membres for groupements if requested
    if (includeMembres && type === 'groupement') {
      const membres = await prisma.communeGroupement.findMany({
        where: { groupementSiren: code },
        include: {
          commune: {
            select: {
              code: true,
              nom: true,
              population: true,
            },
          },
        },
      })
      territoire.membres = membres.map((m) => ({
        code: m.commune.code,
        nom: m.commune.nom,
        population: m.commune.population,
        dateAdhesion: m.dateAdhesion,
      }))
    }

    // Add aliases
    const aliases = await prisma.alias.findMany({
      where: { codeOfficiel: code },
      select: { alias: true, source: true },
    })
    if (aliases.length > 0) {
      territoire.aliases = aliases.map((a) => a.alias)
    }

    const duration = Date.now() - startTime

    const jsonResponse = NextResponse.json(territoire, {
      headers: {
        ...corsHeaders,
        'X-Response-Time': `${duration}ms`,
      },
    })

    return addRateLimitHeaders(jsonResponse, rateLimitResult)
  } catch (error) {
    console.error('GET /territoires/[code] error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

/**
 * Find suggestions for a territory code by searching aliases
 */
async function findSuggestions(code: string): Promise<NotFoundSuggestion[]> {
  try {
    // Search in aliases table
    const aliases = await prisma.alias.findMany({
      where: {
        OR: [
          { alias: { contains: code, mode: 'insensitive' } },
          { aliasNorm: { contains: code.toLowerCase(), mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: {
        alias: true,
        codeOfficiel: true,
        type: true,
      },
    })

    return aliases.map((a) => ({
      code: a.codeOfficiel,
      nom: a.alias,
      type: a.type,
    }))
  } catch {
    return []
  }
}

export const GET = withRequestLogging(handleGet)
