/**
 * POST /api/v1/territoires/batch
 *
 * Submit a batch matching request
 *
 * Request:
 *   POST /api/v1/territoires/batch
 *   {
 *     "items": [
 *       { "query": "SYDEC", "hints": { "type": "syndicat_energie" } },
 *       { "query": "Lyon" },
 *       { "query": "Paris" }
 *     ],
 *     "clientId": "chene6"
 *   }
 *
 * Response:
 *   {
 *     "requestId": "uuid",
 *     "status": "pending",
 *     "totalItems": 3,
 *     "estimatedDuration": 1,
 *     "statusUrl": "/api/v1/territoires/batch/uuid",
 *     "resultsUrl": "/api/v1/territoires/batch/uuid/results"
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { submitBatchRequest } from '@/lib/territoires/batch'
import { validationError, internalError } from '@/lib/territoires/errors'
import { BatchMatchInput, BatchMatchInputItem } from '@/lib/territoires/types'
import { parseBody, batchBodySchema } from '@/lib/validation'
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

// Validate batch input item
function validateItem(item: unknown, index: number): BatchMatchInputItem | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const i = item as Record<string, unknown>

  if (!i.query || typeof i.query !== 'string') {
    return null
  }

  const query = i.query.trim()
  if (query.length === 0 || query.length > 200) {
    return null
  }

  const validated: BatchMatchInputItem = { query }

  // Process hints if present
  if (i.hints && typeof i.hints === 'object') {
    const h = i.hints as Record<string, unknown>
    validated.hints = {}

    if (h.departement && typeof h.departement === 'string') {
      validated.hints.departement = h.departement.trim()
    }
    if (h.region && typeof h.region === 'string') {
      validated.hints.region = h.region.trim()
    }
    if (h.type && typeof h.type === 'string') {
      validated.hints.type = h.type.trim()
    }
  }

  return validated
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

    // Validate with Zod
    const parsed = parseBody(rawBody, batchBodySchema)
    if (!parsed.success) return parsed.response

    const { items, clientId, webhookUrl } = parsed.data

    // Build validated items
    const validatedItems: BatchMatchInputItem[] = items.map((item) => ({
      query: item.query.trim(),
      hints: item.hints
        ? {
            ...(item.hints.departement && { departement: item.hints.departement.trim() }),
            ...(item.hints.region && { region: item.hints.region.trim() }),
            ...(item.hints.type && { type: item.hints.type.trim() }),
          }
        : undefined,
    }))

    // Build input
    const input: BatchMatchInput = {
      items: validatedItems,
    }

    if (clientId) {
      input.clientId = clientId.trim().substring(0, 100)
    }

    if (webhookUrl) {
      input.webhookUrl = webhookUrl.trim()
    }

    // Get base URL for response links
    const proto = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host') || 'localhost'
    const baseUrl = `${proto}://${host}`

    // Submit batch
    const result = await submitBatchRequest(input, baseUrl)

    const duration = Date.now() - startTime

    return NextResponse.json(result, {
      status: 202, // Accepted
      headers: {
        ...corsHeaders,
        'X-Response-Time': `${duration}ms`,
      },
    })
  } catch (error) {
    console.error('Batch submission error:', error)
    if (error instanceof Error) {
      return validationError('batch', error.message)
    }
    return internalError(error)
  }
}

export const POST = withRequestLogging(handlePost)
