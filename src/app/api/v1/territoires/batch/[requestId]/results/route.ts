/**
 * GET /api/v1/territoires/batch/[requestId]/results
 *
 * Get batch matching results
 *
 * Response:
 *   {
 *     "requestId": "uuid",
 *     "status": "completed",
 *     "results": [
 *       { "index": 0, "query": "Lyon", "status": "matched", "code": "69123", ... },
 *       { "index": 1, "query": "SYDEC", "status": "suggestions", "alternatives": [...] },
 *       { "index": 2, "query": "xyz", "status": "failed", "error": "Not found" }
 *     ],
 *     "summary": {
 *       "total": 3,
 *       "matched": 1,
 *       "suggestions": 1,
 *       "failed": 1,
 *       "successRate": 33
 *     }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getBatchResults } from '@/lib/territoires/batch'
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

    // Get results
    const results = await getBatchResults(requestId)

    if (!results) {
      return createErrorResponse(ErrorCodes.NOT_FOUND, `Batch request ${requestId} not found`)
    }

    // Check if processing is complete
    if (results.status === 'pending' || results.status === 'processing') {
      return NextResponse.json(
        {
          requestId: results.requestId,
          status: results.status,
          message: 'Batch is still processing. Check status endpoint for progress.',
          results: [],
          summary: results.summary,
        },
        {
          status: 202, // Accepted but not ready
          headers: {
            ...corsHeaders,
            'Retry-After': '5', // Suggest retry in 5 seconds
          },
        }
      )
    }

    const duration = Date.now() - startTime

    return NextResponse.json(results, {
      headers: {
        ...corsHeaders,
        'X-Response-Time': `${duration}ms`,
      },
    })
  } catch (error) {
    console.error('Batch results error:', error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
  }
}

export const GET = withRequestLogging(handleGet)
