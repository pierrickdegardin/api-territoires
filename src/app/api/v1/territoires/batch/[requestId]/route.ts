/**
 * GET /api/v1/territoires/batch/[requestId]
 *
 * Get batch request status
 *
 * Response:
 *   {
 *     "requestId": "uuid",
 *     "status": "processing",
 *     "totalItems": 100,
 *     "processed": 45,
 *     "matched": 40,
 *     "suggestions": 3,
 *     "failed": 2,
 *     "progress": 45,
 *     "createdAt": "2026-01-15T...",
 *     "startedAt": "2026-01-15T..."
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getBatchStatus } from '@/lib/territoires/batch'
import { createErrorResponse, ErrorCodes } from '@/lib/territoires/errors'
import { uuidSchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
}

// Handle preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  })
}

async function handleGet(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const startTime = Date.now()

  try {
    const { requestId } = await params

    // Validate UUID with Zod
    const uuidResult = uuidSchema.safeParse(requestId)
    if (!uuidResult.success) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 'Invalid request ID format (must be a valid UUID)')
    }

    // Get status
    const status = await getBatchStatus(requestId)

    if (!status) {
      return createErrorResponse(ErrorCodes.NOT_FOUND, `Batch request ${requestId} not found`)
    }

    const duration = Date.now() - startTime

    return NextResponse.json(status, {
      headers: {
        ...corsHeaders,
        'X-Response-Time': `${duration}ms`,
      },
    })
  } catch (error) {
    console.error('Batch status error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const GET = withRequestLogging(handleGet)
