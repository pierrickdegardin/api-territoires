/**
 * POST /api/v1/territoires/alias/suggest
 *
 * Suggest a new alias for community contribution
 *
 * Request:
 *   POST /api/v1/territoires/alias/suggest
 *   {
 *     "alias": "SDEM50",
 *     "codeOfficiel": "200066389",
 *     "source": "user_contribution",
 *     "comment": "Syndicat départemental d'énergie de la Manche"
 *   }
 *
 * Response:
 *   201: { "status": "created", "message": "Alias enregistré" }
 *   400: { "error": { "code": "INVALID_REQUEST", "message": "..." } }
 *   409: { "error": { "code": "CONFLICT", "message": "Alias already exists" } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createErrorResponse, ErrorCodes, validationError } from '@/lib/territoires/errors'
import { normalizeNom, findByCode, createAlias } from '@/lib/territoires/alias'
import { parseBody, aliasSuggestBodySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
}

// Handle preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  })
}

async function handlePost(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Parse body
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return validationError('body', 'Invalid JSON body')
    }

    // Validate body with Zod
    const parsed = parseBody(rawBody, aliasSuggestBodySchema)
    if (!parsed.success) return parsed.response

    const { alias, codeOfficiel, source, comment } = parsed.data

    const trimmedAlias = alias.trim()
    const trimmedCode = codeOfficiel.trim()

    // Verify that the target territoire exists
    const territoire = await findByCode(trimmedCode)

    if (!territoire) {
      return createErrorResponse(ErrorCodes.NOT_FOUND, `Territory with code "${trimmedCode}" not found`, {
        codeOfficiel: trimmedCode,
      })
    }

    // Check if alias already exists (exact or normalized)
    const normalizedAlias = normalizeNom(trimmedAlias)

    const existingAlias = await prisma.alias.findFirst({
      where: {
        OR: [{ alias: trimmedAlias }, { aliasNorm: normalizedAlias }],
      },
    })

    if (existingAlias) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'This alias already exists',
            details: {
              existingAlias: existingAlias.alias,
              targetCode: existingAlias.codeOfficiel,
            },
          },
        },
        { status: 409, headers: corsHeaders }
      )
    }

    // Create the alias directly
    await createAlias(
      trimmedAlias,
      trimmedCode,
      territoire.type,
      source ? source.trim().substring(0, 50) : 'user_contribution'
    )

    const duration = Date.now() - startTime

    return NextResponse.json(
      {
        status: 'created',
        message: 'Alias enregistré',
        alias: trimmedAlias,
        targetTerritoire: {
          code: territoire.code,
          nom: territoire.nom,
          type: territoire.type,
        },
      },
      {
        status: 201,
        headers: {
          ...corsHeaders,
          'X-Response-Time': `${duration}ms`,
        },
      }
    )
  } catch (error) {
    console.error('POST /alias/suggest error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const POST = withRequestLogging(handlePost)
