/**
 * GET /api/v1/territoires/search
 *
 * Full-text search across all territories using database ILIKE
 *
 * Query Parameters:
 *   - q: Search query (required)
 *   - type: Filter by type (region, departement, commune, groupement)
 *   - departement: Filter by department code
 *   - region: Filter by region code
 *   - limit: Number of results (default: 20, max: 100)
 *   - autocomplete: Return simplified results for autocomplete (default: false)
 *
 * Response:
 *   {
 *     "results": [...],
 *     "total": 45,
 *     "query": "lyon",
 *     "searchTime": "3ms"
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createErrorResponse, ErrorCodes } from '@/lib/territoires/errors'
import { parseQueryParams, searchQueryParamsSchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// Normalise les accents pour la recherche (ex: "Ploërmel" → "Ploermel")
function normalizeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

async function handleGet(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, searchQueryParamsSchema)
    if (!parsed.success) return parsed.response

    const { q, type, departement, region, autocomplete, limit } = parsed.data
    const trimmedQuery = q.trim()

    // Determine types to search
    const typesToSearch = type ? [type] : ['region', 'departement', 'commune', 'groupement']

    interface SearchResult {
      code: string
      nom: string
      type: string
      codeDepartement?: string
      codeRegion?: string
      population?: number | null
    }

    const results: SearchResult[] = []

    // Search each table
    if (typesToSearch.includes('region')) {
      const regions = await prisma.region.findMany({
        where: { nom: { contains: trimmedQuery, mode: 'insensitive' } },
        select: { code: true, nom: true, population: true },
        take: limit,
      })
      results.push(
        ...regions.map((r) => ({
          code: r.code,
          nom: r.nom,
          type: 'region',
          population: r.population,
        }))
      )
    }

    if (typesToSearch.includes('departement')) {
      const where: {
        nom: { contains: string; mode: 'insensitive' }
        codeRegion?: string
      } = { nom: { contains: trimmedQuery, mode: 'insensitive' } }
      if (region) where.codeRegion = region

      const depts = await prisma.departement.findMany({
        where,
        select: { code: true, nom: true, codeRegion: true, population: true },
        take: limit,
      })
      results.push(
        ...depts.map((d) => ({
          code: d.code,
          nom: d.nom,
          type: 'departement',
          codeRegion: d.codeRegion,
          population: d.population,
        }))
      )
    }

    if (typesToSearch.includes('commune')) {
      // Utiliser unaccent pour recherche insensible aux accents
      const normalizedQuery = `%${normalizeAccents(trimmedQuery).toLowerCase()}%`

      const communeWhereConditions: string[] = ['unaccent(lower(nom)) LIKE $1']
      const communeParams: unknown[] = [normalizedQuery]

      if (departement) {
        communeParams.push(departement)
        communeWhereConditions.push(`code_departement = $${communeParams.length}`)
      }
      if (region) {
        communeParams.push(region)
        communeWhereConditions.push(`code_region = $${communeParams.length}`)
      }

      communeParams.push(limit)
      const communeLimitParam = `$${communeParams.length}`

      const communes = await prisma.$queryRawUnsafe<
        Array<{
          code: string
          nom: string
          code_departement: string
          code_region: string
          population: number | null
        }>
      >(
        `SELECT code, nom, code_departement, code_region, population
         FROM commune
         WHERE ${communeWhereConditions.join(' AND ')}
         LIMIT ${communeLimitParam}`,
        ...communeParams
      )
      results.push(
        ...communes.map((c) => ({
          code: c.code,
          nom: c.nom,
          type: 'commune',
          codeDepartement: c.code_departement,
          codeRegion: c.code_region,
          population: c.population,
        }))
      )
    }

    if (typesToSearch.includes('groupement')) {
      // Utiliser unaccent pour recherche insensible aux accents
      const normalizedQuery = `%${normalizeAccents(trimmedQuery).toLowerCase()}%`

      const groupementWhereConditions: string[] = ['unaccent(lower(nom)) LIKE $1']
      const groupementParams: unknown[] = [normalizedQuery]

      if (region) {
        groupementParams.push(region)
        groupementWhereConditions.push(`code_region = $${groupementParams.length}`)
      }

      groupementParams.push(limit)
      const groupementLimitParam = `$${groupementParams.length}`

      const groupements = await prisma.$queryRawUnsafe<
        Array<{
          siren: string
          nom: string
          type: string
          code_region: string | null
          population: number | null
        }>
      >(
        `SELECT siren, nom, type, code_region, population
         FROM groupement
         WHERE ${groupementWhereConditions.join(' AND ')}
         LIMIT ${groupementLimitParam}`,
        ...groupementParams
      )
      results.push(
        ...groupements.map((g) => ({
          code: g.siren,
          nom: g.nom,
          type: g.type.toLowerCase(),
          codeRegion: g.code_region ?? undefined,
          population: g.population,
        }))
      )
    }

    // Sort by name relevance (exact match first, then starts with, then contains)
    results.sort((a, b) => {
      const aLower = a.nom.toLowerCase()
      const bLower = b.nom.toLowerCase()
      const qLower = trimmedQuery.toLowerCase()

      if (aLower === qLower && bLower !== qLower) return -1
      if (bLower === qLower && aLower !== qLower) return 1
      if (aLower.startsWith(qLower) && !bLower.startsWith(qLower)) return -1
      if (bLower.startsWith(qLower) && !aLower.startsWith(qLower)) return 1
      return aLower.localeCompare(bLower)
    })

    // Limit final results
    const limitedResults = results.slice(0, limit)

    // Format for autocomplete
    const formattedResults = autocomplete
      ? limitedResults.map((r) => ({
          code: r.code,
          nom: r.nom,
          type: r.type,
          departement: r.codeDepartement,
          region: r.codeRegion,
        }))
      : limitedResults.map((r) => ({
          code: r.code,
          nom: r.nom,
          type: r.type,
          departement: r.codeDepartement,
          region: r.codeRegion,
          population: r.population,
        }))

    const searchTime = Date.now() - startTime

    return NextResponse.json(
      {
        results: formattedResults,
        total: limitedResults.length,
        query: trimmedQuery,
        searchTime: `${searchTime}ms`,
        filters: { type, departement, region },
      },
      {
        headers: {
          ...corsHeaders,
          'X-Response-Time': `${searchTime}ms`,
          'X-Total-Hits': limitedResults.length.toString(),
        },
      }
    )
  } catch (error) {
    console.error('Search error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Search service temporarily unavailable')
  }
}

export const GET = withRequestLogging(handleGet)
