/**
 * Rate Limiting for API Territoires
 *
 * Simple in-memory rate limiter with:
 * - 100 req/min per IP without API key
 * - 1000 req/min with valid API key
 * - Temporary IP blocking after 10 violations (1h)
 *
 * Story 6-2: Rate Limiting & CORS
 * Story 6-3: API Key validation
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'

// Rate limit configuration
const RATE_LIMITS = {
  anonymous: {
    maxRequests: 500, // Augmenté: 100 → 500 req/min
    windowMs: 60 * 1000, // 1 minute
  },
  authenticated: {
    maxRequests: 5000, // Augmenté: 1000 → 5000 req/min
    windowMs: 60 * 1000, // 1 minute
  },
  blockDuration: 15 * 60 * 1000, // Réduit: 1h → 15 min
  maxViolations: 20, // Augmenté: 10 → 20 violations avant blocage
}

// In-memory stores (reset on server restart)
interface RateLimitEntry {
  count: number
  resetAt: number
  violations: number
  blockedUntil?: number
}

const ipStore = new Map<string, RateLimitEntry>()
const apiKeyStore = new Map<string, RateLimitEntry>()

// Cache for validated API keys (to avoid bcrypt on every request)
// Maps keyPrefix -> { valid: boolean, keyId: string, validatedAt: number }
interface ApiKeyCache {
  valid: boolean
  keyId: string
  validatedAt: number
  keyHash: string
}
const validatedKeyCache = new Map<string, ApiKeyCache>()
const API_KEY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Cleanup old entries every 5 minutes
setInterval(
  () => {
    const now = Date.now()
    Array.from(ipStore.entries()).forEach(([key, entry]) => {
      if (entry.resetAt < now && (!entry.blockedUntil || entry.blockedUntil < now)) {
        ipStore.delete(key)
      }
    })
    Array.from(apiKeyStore.entries()).forEach(([key, entry]) => {
      if (entry.resetAt < now) {
        apiKeyStore.delete(key)
      }
    })
    // Clean up API key cache
    Array.from(validatedKeyCache.entries()).forEach(([key, entry]) => {
      if (now - entry.validatedAt > API_KEY_CACHE_TTL) {
        validatedKeyCache.delete(key)
      }
    })
  },
  5 * 60 * 1000
)

/**
 * Validate an API key against the database
 * Uses bcrypt to compare against stored hash
 * Caches valid keys for 5 minutes to reduce DB load
 */
async function validateApiKey(apiKey: string): Promise<{ valid: boolean; keyId?: string; reason?: string }> {
  // Check format
  if (!apiKey || !apiKey.startsWith('atf_') || apiKey.length < 20) {
    return { valid: false, reason: 'Invalid API key format' }
  }

  const keyPrefix = apiKey.substring(0, 12)

  // Check cache first
  const cached = validatedKeyCache.get(apiKey)
  if (cached && Date.now() - cached.validatedAt < API_KEY_CACHE_TTL) {
    // Verify it's still the same key by checking prefix
    if (cached.valid) {
      return { valid: true, keyId: cached.keyId }
    }
    return { valid: false, reason: 'API key not found or invalid' }
  }

  try {
    // Find keys with matching prefix
    const keys = await prisma.apiKey.findMany({
      where: {
        keyPrefix,
        revoked: false,
      },
      select: {
        id: true,
        keyHash: true,
        expiresAt: true,
      },
    })

    if (keys.length === 0) {
      return { valid: false, reason: 'API key not found' }
    }

    // Check each key with bcrypt (usually just 1)
    for (const key of keys) {
      // Check expiration
      if (key.expiresAt && key.expiresAt < new Date()) {
        continue
      }

      // Verify hash
      const isValid = await bcrypt.compare(apiKey, key.keyHash)
      if (isValid) {
        // Cache the valid key
        validatedKeyCache.set(apiKey, {
          valid: true,
          keyId: key.id,
          keyHash: key.keyHash,
          validatedAt: Date.now(),
        })

        // Update usage stats in background (non-blocking)
        prisma.apiKey
          .update({
            where: { id: key.id },
            data: {
              totalCalls: { increment: 1 },
              lastUsedAt: new Date(),
            },
          })
          .catch((err) => console.error('Failed to update API key stats:', err))

        return { valid: true, keyId: key.id }
      }
    }

    return { valid: false, reason: 'API key not found or invalid' }
  } catch (error) {
    console.error('API key validation error:', error)
    // On database error, fail open (allow request) to not break API
    return { valid: false, reason: 'Validation error' }
  }
}

/**
 * Get client IP address
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  return forwarded?.split(',')[0]?.trim() || realIp || 'unknown'
}

/**
 * Get client identifier and validate API key if present
 */
async function getClientId(
  request: NextRequest
): Promise<{ type: 'ip' | 'apikey'; id: string; apiKeyValid?: boolean; apiKeyId?: string }> {
  const apiKey = request.headers.get('x-api-key')

  if (apiKey) {
    // Validate API key against database
    const validation = await validateApiKey(apiKey)

    if (validation.valid) {
      return { type: 'apikey', id: apiKey, apiKeyValid: true, apiKeyId: validation.keyId }
    }

    // Invalid API key - fall back to IP-based limiting
    // but mark as invalid so we can return appropriate headers
    return { type: 'ip', id: getClientIp(request), apiKeyValid: false }
  }

  return { type: 'ip', id: getClientIp(request) }
}

// Type for rate limit check result
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  blocked?: boolean
  retryAfter?: number
  apiKeyValid?: boolean
}

/**
 * Check rate limit and return result
 */
export async function checkRateLimit(request: NextRequest): Promise<RateLimitResult> {
  const now = Date.now()
  const client = await getClientId(request)
  const store = client.type === 'apikey' ? apiKeyStore : ipStore
  const limits = client.type === 'apikey' ? RATE_LIMITS.authenticated : RATE_LIMITS.anonymous

  let entry = store.get(client.id)

  // Check if blocked
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.blockedUntil,
      blocked: true,
      retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
    }
  }

  // Reset if window expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + limits.windowMs,
      violations: entry?.violations || 0,
    }
    // Clear blocked status if block expired
    if (entry.blockedUntil && entry.blockedUntil < now) {
      entry.blockedUntil = undefined
      entry.violations = 0
    }
  }

  // Check limit
  if (entry.count >= limits.maxRequests) {
    entry.violations++

    // Block IP after max violations
    if (client.type === 'ip' && entry.violations >= RATE_LIMITS.maxViolations) {
      entry.blockedUntil = now + RATE_LIMITS.blockDuration
      store.set(client.id, entry)

      console.warn(`[Rate Limit] IP blocked for 1h: ${client.id} (${entry.violations} violations)`)

      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        blocked: true,
        retryAfter: Math.ceil(RATE_LIMITS.blockDuration / 1000),
      }
    }

    store.set(client.id, entry)

    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  // Increment and allow
  entry.count++
  store.set(client.id, entry)

  return {
    allowed: true,
    remaining: limits.maxRequests - entry.count,
    resetAt: entry.resetAt,
    apiKeyValid: client.apiKeyValid,
  }
}

/**
 * Create rate limit error response
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
    'Access-Control-Allow-Origin': '*',
  }

  if (result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString()
  }

  if (result.blocked) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Your IP has been temporarily blocked.',
          retryAfter: result.retryAfter,
        },
      },
      { status: 429, headers }
    )
  }

  return NextResponse.json(
    {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down.',
        retryAfter: result.retryAfter,
      },
    },
    { status: 429, headers }
  )
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(response: NextResponse, result: RateLimitResult): NextResponse {
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  response.headers.set('X-RateLimit-Reset', new Date(result.resetAt).toISOString())
  return response
}

/**
 * Rate limit middleware wrapper for API routes
 */
export function withRateLimit<T>(
  handler: (request: NextRequest, context?: T) => Promise<NextResponse>
): (request: NextRequest, context?: T) => Promise<NextResponse> {
  return async (request: NextRequest, context?: T) => {
    const result = await checkRateLimit(request)

    if (!result.allowed) {
      return rateLimitResponse(result)
    }

    const response = await handler(request, context)
    return addRateLimitHeaders(response, result)
  }
}
