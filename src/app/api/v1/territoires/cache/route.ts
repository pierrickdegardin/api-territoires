import { NextRequest, NextResponse } from 'next/server'
import { invalidateCache, getCacheStats } from '@/lib/cache'
import { parseQueryParams, cacheDeleteQuerySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

// GET /cache - Stats du cache
async function handleGet() {
  const stats = await getCacheStats()
  return NextResponse.json(stats, { headers: corsHeaders })
}

// DELETE /cache - Invalider le cache
async function handleDelete(request: NextRequest) {
  // Validate query parameters with Zod
  const parsed = parseQueryParams(request.url, cacheDeleteQuerySchema)
  if (!parsed.success) return parsed.response

  const { pattern } = parsed.data
  const count = await invalidateCache(pattern || undefined)

  return NextResponse.json(
    {
      success: true,
      invalidated: count,
      message: `Invalidated ${count} cache entries`,
    },
    { headers: corsHeaders }
  )
}

export const GET = withRequestLogging(handleGet)
export const DELETE = withRequestLogging(handleDelete)
