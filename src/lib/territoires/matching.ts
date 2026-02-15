/**
 * Territoire Matching Service (Autonome)
 *
 * Resolves territory names to official codes using:
 * 1. Direct code lookup
 * 2. Alias table (exact match → confidence 1.0)
 * 3. Database fuzzy search (ILIKE)
 */

import { prisma } from '@/lib/prisma'
import { findByAlias, findByCode, normalizeNom } from './alias'
import { MatchRequest, MatchResult, MatchHints, MatchAlternative } from './types'

/**
 * Calculate confidence score based on match quality
 */
function calculateConfidence(query: string, hitNom: string): number {
  const normalizedQuery = normalizeNom(query)
  const normalizedHit = normalizeNom(hitNom)

  // Exact match
  if (query.toLowerCase() === hitNom.toLowerCase()) {
    return 1.0
  }

  // Normalized exact match
  if (normalizedQuery === normalizedHit) {
    return 0.95
  }

  // Contains match
  if (normalizedHit.includes(normalizedQuery) || normalizedQuery.includes(normalizedHit)) {
    return 0.85
  }

  // Prefix match
  if (normalizedHit.startsWith(normalizedQuery)) {
    return 0.8
  }

  // Default fuzzy match
  return 0.7
}

/**
 * Search territories by name using database ILIKE
 */
async function searchByName(query: string, hints?: MatchHints, limit: number = 5): Promise<MatchAlternative[]> {
  const results: MatchAlternative[] = []
  const searchPattern = `%${query}%`

  // Search Regions (if no type hint or type = region)
  if (!hints?.type || hints.type === 'region') {
    const regions = await prisma.region.findMany({
      where: { nom: { contains: query, mode: 'insensitive' } },
      select: { code: true, nom: true },
      take: limit,
    })
    results.push(
      ...regions.map((r) => ({
        code: r.code,
        nom: r.nom,
        type: 'region',
        confidence: calculateConfidence(query, r.nom),
      }))
    )
  }

  // Search Departements
  if (!hints?.type || hints.type === 'departement') {
    const where: { nom: { contains: string; mode: 'insensitive' }; codeRegion?: string } = {
      nom: { contains: query, mode: 'insensitive' },
    }
    if (hints?.region) where.codeRegion = hints.region

    const depts = await prisma.departement.findMany({
      where,
      select: { code: true, nom: true, codeRegion: true },
      take: limit,
    })
    results.push(
      ...depts.map((d) => ({
        code: d.code,
        nom: d.nom,
        type: 'departement',
        region: d.codeRegion,
        confidence: calculateConfidence(query, d.nom),
      }))
    )
  }

  // Search Communes
  if (!hints?.type || hints.type === 'commune') {
    const where: {
      nom: { contains: string; mode: 'insensitive' }
      codeDepartement?: string
      codeRegion?: string
    } = {
      nom: { contains: query, mode: 'insensitive' },
    }
    if (hints?.departement) where.codeDepartement = hints.departement
    if (hints?.region) where.codeRegion = hints.region

    const communes = await prisma.commune.findMany({
      where,
      select: { code: true, nom: true, codeDepartement: true, codeRegion: true },
      take: limit,
    })
    results.push(
      ...communes.map((c) => ({
        code: c.code,
        nom: c.nom,
        type: 'commune',
        departement: c.codeDepartement,
        region: c.codeRegion,
        confidence: calculateConfidence(query, c.nom),
      }))
    )
  }

  // Search Groupements
  if (!hints?.type || hints.type?.startsWith('epci') || hints.type === 'syndicat') {
    const where: { nom: { contains: string; mode: 'insensitive' }; codeRegion?: string } = {
      nom: { contains: query, mode: 'insensitive' },
    }
    if (hints?.region) where.codeRegion = hints.region

    const groupements = await prisma.groupement.findMany({
      where,
      select: { siren: true, nom: true, type: true, codeRegion: true },
      take: limit,
    })
    results.push(
      ...groupements.map((g) => ({
        code: g.siren,
        nom: g.nom,
        type: g.type.toLowerCase(),
        region: g.codeRegion ?? undefined,
        confidence: calculateConfidence(query, g.nom),
      }))
    )
  }

  // Sort by confidence and limit
  return results.sort((a, b) => b.confidence - a.confidence).slice(0, limit)
}

/**
 * Match a territoire query to official code
 *
 * @param request - The match request with query and optional hints
 * @returns Match result (matched, suggestions, or failed)
 */
export async function matchTerritoire(request: MatchRequest): Promise<MatchResult> {
  const { query, hints } = request

  if (!query || query.trim().length === 0) {
    return {
      status: 'failed',
      message: 'Query is required',
    }
  }

  const trimmedQuery = query.trim()

  // 1. Check if query is already a valid code
  const directMatch = await findByCode(trimmedQuery)

  if (directMatch) {
    return {
      status: 'matched',
      code: directMatch.code,
      confidence: 1.0,
      nom: directMatch.nom,
      type: directMatch.type,
      matchSource: 'direct',
    }
  }

  // 2. Check alias table (exact match = confidence 1.0)
  const aliasMatch = await findByAlias(trimmedQuery)

  if (aliasMatch) {
    const territoire = await findByCode(aliasMatch.code)

    if (territoire) {
      return {
        status: 'matched',
        code: territoire.code,
        confidence: aliasMatch.confidence,
        nom: territoire.nom,
        type: territoire.type,
        matchSource: 'alias',
      }
    }
  }

  // 3. Database fuzzy search
  try {
    const results = await searchByName(trimmedQuery, hints, 5)

    if (results.length === 0) {
      return {
        status: 'failed',
        message: `No territoire found matching "${trimmedQuery}"`,
      }
    }

    const topHit = results[0]

    // If single result or high confidence, return as matched
    if (results.length === 1 || topHit.confidence >= 0.9) {
      return {
        status: 'matched',
        code: topHit.code,
        confidence: topHit.confidence,
        nom: topHit.nom,
        type: topHit.type,
        departement: topHit.departement,
        region: topHit.region,
        matchSource: 'database',
      }
    }

    // Multiple results with similar confidence → return suggestions
    return {
      status: 'suggestions',
      alternatives: results,
    }
  } catch (error) {
    console.error('Match error:', error)
    return {
      status: 'failed',
      message: 'Search service temporarily unavailable',
    }
  }
}
