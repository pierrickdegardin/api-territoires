/**
 * POST /api/v1/territoires/match
 *
 * Match a territory name to its official code
 *
 * Request:
 *   POST /api/v1/territoires/match
 *   {
 *     "query": "SYDEC",
 *     "hints": {
 *       "departement": "40",
 *       "region": "75",
 *       "type": "syndicat_energie"
 *     }
 *   }
 *
 * Response:
 *   { "status": "matched", "code": "244000675", "confidence": 0.98, ... }
 *   { "status": "suggestions", "alternatives": [...] }
 *   { "error": { "code": "NOT_FOUND", "message": "..." } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { matchTerritoire } from '@/lib/territoires/matching'
import { validationError, internalError } from '@/lib/territoires/errors'
import { MatchRequest, MatchHints, TerritoireType } from '@/lib/territoires/types'
import { checkRateLimit, rateLimitResponse, addRateLimitHeaders } from '@/lib/territoires/rate-limit'
import { parseBody, matchBodySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// CORS headers for public API
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  })
}

// Valid territory types
const VALID_TYPES: TerritoireType[] = [
  'region',
  'departement',
  'commune',
  'epci_cc',
  'epci_ca',
  'epci_cu',
  'epci_metropole',
  'epci_ept',
  'syndicat',
  'syndicat_mixte',
  'petr',
  'pays',
  'pnr',
]

// Validate type hint if provided
function validateTypeHint(type: string | undefined): TerritoireType | string | undefined {
  if (!type) return undefined

  if (VALID_TYPES.includes(type as TerritoireType)) {
    return type as TerritoireType
  }

  // Allow as-is for flexibility
  return type
}

async function handlePost(request: NextRequest) {
  // Rate limiting check
  const rateLimitResult = await checkRateLimit(request)
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult)
  }

  const startTime = Date.now()

  try {
    // Parse request body
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return validationError('body', 'Invalid JSON body')
    }

    // Validate with Zod
    const parsed = parseBody(rawBody, matchBodySchema)
    if (!parsed.success) return parsed.response

    const { query, hints } = parsed.data

    // Build match request
    const matchRequest: MatchRequest = {
      query: query.trim(),
    }

    // Process hints if provided
    if (hints) {
      const processedHints: MatchHints = {}

      if (hints.departement) {
        processedHints.departement = hints.departement.trim()
      }

      if (hints.region) {
        processedHints.region = hints.region.trim()
      }

      if (hints.type) {
        processedHints.type = validateTypeHint(hints.type.trim())
      }

      if (Object.keys(processedHints).length > 0) {
        matchRequest.hints = processedHints
      }
    }

    // Execute matching
    const result = await matchTerritoire(matchRequest)

    // Add timing header
    const duration = Date.now() - startTime

    const response = NextResponse.json(result, {
      headers: {
        ...corsHeaders,
        'X-Response-Time': `${duration}ms`,
      },
    })

    return addRateLimitHeaders(response, rateLimitResult)
  } catch (error) {
    console.error('Match endpoint error:', error)
    return internalError(error)
  }
}

export const POST = withRequestLogging(handlePost)
