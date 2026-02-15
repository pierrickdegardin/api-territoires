/**
 * API Keys Management for Territoires API
 *
 * POST /api/v1/territoires/apikeys
 *   - Generate a new API key (returns key ONCE)
 *
 * GET /api/v1/territoires/apikeys
 *   - List API keys for an email (keys are masked)
 *
 * DELETE /api/v1/territoires/apikeys/{id}
 *   - Revoke an API key
 *
 * Story 6-3: Gestion des API Keys
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as crypto from 'crypto'
import * as bcrypt from 'bcryptjs'
import {
  parseBody,
  parseQueryParams,
  createApiKeyBodySchema,
  listApiKeysQuerySchema,
  deleteApiKeyQuerySchema,
} from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
}

// Handle preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

/**
 * Generate a secure random API key
 * Format: atf_<32 random hex chars>
 */
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(16).toString('hex')
  return `atf_${randomBytes}`
}

/**
 * Hash an API key for storage
 * Uses bcrypt with cost factor 10
 */
async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, 10)
}

/**
 * POST /api/v1/territoires/apikeys
 * Create a new API key
 */
async function handlePost(request: NextRequest) {
  try {
    const rawBody = await request.json()

    // Validate body with Zod
    const parsed = parseBody(rawBody, createApiKeyBodySchema)
    if (!parsed.success) return parsed.response

    const { email, name, description } = parsed.data

    // Check rate limit: max 5 keys per email
    const existingCount = await prisma.apiKey.count({
      where: { email, revoked: false },
    })

    if (existingCount >= 5) {
      return NextResponse.json(
        {
          error: {
            code: 'LIMIT_EXCEEDED',
            message: 'Maximum 5 active API keys per email. Revoke existing keys first.',
          },
        },
        { status: 429, headers: corsHeaders }
      )
    }

    // Generate and hash the key
    const apiKey = generateApiKey()
    const keyHash = await hashApiKey(apiKey)
    const keyPrefix = apiKey.substring(0, 12) // "atf_xxxxxxxx"

    // Store in database
    const created = await prisma.apiKey.create({
      data: {
        keyHash,
        keyPrefix,
        email: email.toLowerCase().trim(),
        name: name?.trim() || null,
        description: description?.trim() || null,
      },
    })

    // Return the key (ONCE ONLY - not stored in plain text)
    return NextResponse.json(
      {
        id: created.id,
        key: apiKey,
        keyPrefix: created.keyPrefix,
        email: created.email,
        name: created.name,
        createdAt: created.createdAt.toISOString(),
        message: 'Save this API key securely. It will not be shown again. Use header X-API-Key to authenticate.',
        rateLimit: '1000 requests/minute with valid API key (vs 100/minute anonymous)',
      },
      { status: 201, headers: corsHeaders }
    )
  } catch (error) {
    console.error('POST /apikeys error:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create API key' } },
      { status: 500, headers: corsHeaders }
    )
  }
}

/**
 * GET /api/v1/territoires/apikeys
 * List API keys for an email (keys are masked)
 */
async function handleGet(request: NextRequest) {
  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, listApiKeysQuerySchema)
    if (!parsed.success) return parsed.response

    const { email } = parsed.data

    const keys = await prisma.apiKey.findMany({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        keyPrefix: true,
        name: true,
        description: true,
        revoked: true,
        revokedAt: true,
        expiresAt: true,
        totalCalls: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(
      {
        email: email.toLowerCase().trim(),
        keys: keys.map((k) => ({
          ...k,
          keyPrefix: `${k.keyPrefix}...`, // Mask the key
          status: k.revoked ? 'revoked' : k.expiresAt && k.expiresAt < new Date() ? 'expired' : 'active',
        })),
        total: keys.length,
        active: keys.filter((k) => !k.revoked && (!k.expiresAt || k.expiresAt > new Date())).length,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('GET /apikeys error:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to list API keys' } },
      { status: 500, headers: corsHeaders }
    )
  }
}

/**
 * DELETE /api/v1/territoires/apikeys
 * Revoke an API key (by id + email for verification)
 */
async function handleDelete(request: NextRequest) {
  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, deleteApiKeyQuerySchema)
    if (!parsed.success) return parsed.response

    const { id, email } = parsed.data

    // Find and verify ownership
    const key = await prisma.apiKey.findFirst({
      where: { id, email: email.toLowerCase().trim() },
    })

    if (!key) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'API key not found or email mismatch' } },
        { status: 404, headers: corsHeaders }
      )
    }

    if (key.revoked) {
      return NextResponse.json(
        { error: { code: 'ALREADY_REVOKED', message: 'API key is already revoked' } },
        { status: 400, headers: corsHeaders }
      )
    }

    // Revoke the key
    await prisma.apiKey.update({
      where: { id },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    })

    return NextResponse.json(
      {
        success: true,
        message: 'API key revoked successfully',
        id,
        keyPrefix: key.keyPrefix,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('DELETE /apikeys error:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke API key' } },
      { status: 500, headers: corsHeaders }
    )
  }
}

export const GET = withRequestLogging(handleGet)
export const POST = withRequestLogging(handlePost)
export const DELETE = withRequestLogging(handleDelete)
