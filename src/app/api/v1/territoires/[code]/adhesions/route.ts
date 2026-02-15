/**
 * GET /api/v1/territoires/[code]/adhesions
 *
 * Get adhesions for a groupement (which groupements it belongs to or which belong to it)
 *
 * Query Parameters:
 *   - direction: 'adheres_to' (default) or 'has_adherents'
 *     - adheres_to: Get groupements this one adheres to (e.g., EPCI → Syndicat énergie)
 *     - has_adherents: Get groupements that adhere to this one (e.g., Syndicat énergie ← EPCIs)
 *
 * Response:
 *   {
 *     "siren": "200046977",
 *     "nom": "Métropole de Lyon",
 *     "direction": "adheres_to",
 *     "adhesions": [
 *       {
 *         "siren": "246901137",
 *         "nom": "Syndicat Départemental d'Énergie du Rhône",
 *         "type": "syndicat_energie"
 *       }
 *     ],
 *     "total": 1
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createErrorResponse, ErrorCodes } from '@/lib/territoires/errors'
import { parseQueryParams, adhesionsQuerySchema, sirenSchema } from '@/lib/validation'
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

async function handleGet(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const startTime = Date.now()

  try {
    const { code } = await params

    // Validate SIREN code
    const sirenResult = sirenSchema.safeParse(code)
    if (!sirenResult.success) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 'Invalid SIREN code. Must be 9 characters.')
    }

    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, adhesionsQuerySchema)
    if (!parsed.success) return parsed.response

    const { direction } = parsed.data

    // Check if groupement exists
    const groupement = await prisma.groupement.findUnique({
      where: { siren: code },
      select: { siren: true, nom: true, type: true },
    })

    if (!groupement) {
      return createErrorResponse(ErrorCodes.NOT_FOUND, `Groupement with SIREN ${code} not found`)
    }

    let adhesions: Array<{
      siren: string
      nom: string
      type: string
      population: number | null
      nbCommunes: number | null
    }> = []

    if (direction === 'adheres_to') {
      // This groupement adheres to other groupements
      const results = await prisma.$queryRaw<
        Array<{
          siren: string
          nom: string
          type: string
          population: number | null
          nb_communes: number | null
        }>
      >`
        SELECT g.siren, g.nom, g.type::text, g.population, g.nb_communes
        FROM groupement_adhesion ga
        JOIN groupement g ON g.siren = ga.adhesion_siren
        WHERE ga.groupement_siren = ${code}
        ORDER BY g.nom
      `

      adhesions = results.map((r) => ({
        siren: r.siren,
        nom: r.nom,
        type: r.type.toLowerCase(),
        population: r.population,
        nbCommunes: r.nb_communes,
      }))
    } else {
      // Other groupements adhere to this one
      const results = await prisma.$queryRaw<
        Array<{
          siren: string
          nom: string
          type: string
          population: number | null
          nb_communes: number | null
        }>
      >`
        SELECT g.siren, g.nom, g.type::text, g.population, g.nb_communes
        FROM groupement_adhesion ga
        JOIN groupement g ON g.siren = ga.groupement_siren
        WHERE ga.adhesion_siren = ${code}
        ORDER BY g.nom
      `

      adhesions = results.map((r) => ({
        siren: r.siren,
        nom: r.nom,
        type: r.type.toLowerCase(),
        population: r.population,
        nbCommunes: r.nb_communes,
      }))
    }

    const duration = Date.now() - startTime

    return NextResponse.json(
      {
        siren: groupement.siren,
        nom: groupement.nom,
        type: groupement.type.toLowerCase(),
        direction,
        adhesions,
        total: adhesions.length,
        meta: {
          source: 'API Territoires (autonome) - BANATIC',
          description:
            direction === 'adheres_to'
              ? 'Groupements auxquels ce groupement adhère'
              : 'Groupements qui adhèrent à ce groupement',
        },
      },
      {
        headers: {
          ...corsHeaders,
          'X-Response-Time': `${duration}ms`,
        },
      }
    )
  } catch (error) {
    console.error('GET /territoires/[code]/adhesions error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const GET = withRequestLogging(handleGet)
