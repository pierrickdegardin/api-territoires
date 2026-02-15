/**
 * GET /api/v1/territoires/health
 *
 * Health check endpoint for monitoring
 *
 * Response:
 *   {
 *     "status": "healthy",
 *     "services": {
 *       "database": "up",
 *       "redis": { "connected": true, "keys": 42, "memoryUsed": "1.5M" }
 *     },
 *     "stats": {
 *       "regions": 18,
 *       "departements": 101,
 *       "communes": 34875,
 *       "groupements": 1234
 *     },
 *     "version": "1.0.0"
 *   }
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkRedisHealth } from '@/lib/redis'
import { getCacheStats } from '@/lib/cache'
import { withRequestLogging } from '@/lib/logger'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

async function handleGet() {
  const startTime = Date.now()

  const health: {
    status: 'healthy' | 'degraded' | 'unhealthy'
    services: {
      database: 'up' | 'down' | 'unknown'
      redis: {
        connected: boolean
        keys: number
        memoryUsed: string
      }
    }
    stats?: {
      regions: number
      departements: number
      communes: number
      groupements: number
      aliases: number
    }
    version: string
    uptime: number
    timestamp: string
    error?: string
  } = {
    status: 'healthy',
    services: {
      database: 'unknown',
      redis: { connected: false, keys: 0, memoryUsed: '0' },
    },
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }

  // Check database and get stats
  try {
    // Simple connectivity check
    await prisma.$queryRaw`SELECT 1`
    health.services.database = 'up'

    // Get stats
    const [regions, departements, communes, groupements, aliases] = await Promise.all([
      prisma.region.count(),
      prisma.departement.count(),
      prisma.commune.count(),
      prisma.groupement.count(),
      prisma.alias.count(),
    ])

    health.stats = {
      regions,
      departements,
      communes,
      groupements,
      aliases,
    }
  } catch (error) {
    health.services.database = 'down'
    health.status = 'unhealthy'
    health.error = error instanceof Error ? error.message : 'Database connection failed'
    console.error('Health check - Database error:', error)
  }

  // Check Redis (graceful - doesn't affect overall status)
  try {
    const redisHealthy = await checkRedisHealth()
    const cacheStats = await getCacheStats()
    health.services.redis = {
      connected: redisHealthy,
      keys: cacheStats.keys,
      memoryUsed: cacheStats.memoryUsed,
    }
    // Redis being down doesn't make the API unhealthy (graceful degradation)
    if (!redisHealthy && health.status === 'healthy') {
      health.status = 'degraded'
    }
  } catch {
    // Redis check failed silently - service continues without cache
    health.services.redis = { connected: false, keys: 0, memoryUsed: '0' }
  }

  const duration = Date.now() - startTime
  const httpStatus = health.status === 'unhealthy' ? 503 : 200

  return NextResponse.json(health, {
    status: httpStatus,
    headers: {
      ...corsHeaders,
      'X-Response-Time': `${duration}ms`,
    },
  })
}

export const GET = withRequestLogging(handleGet)
