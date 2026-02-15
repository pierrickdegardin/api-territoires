/**
 * Standardized error responses for API Territoires
 */

import { NextResponse } from 'next/server'
import { ApiError } from './types'

// Error codes
export const ErrorCodes = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  AMBIGUOUS: 'AMBIGUOUS',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONFLICT: 'CONFLICT',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

// HTTP status mapping
const ERROR_STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  AMBIGUOUS: 200, // Not really an error, more like multiple results
  RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
  INTERNAL_ERROR: 500,
  CONFLICT: 409,
}

/**
 * Suggestion for a not found error
 */
export interface NotFoundSuggestion {
  code: string
  nom: string
  type: string
  similarity?: number
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): NextResponse<ApiError> {
  const status = ERROR_STATUS[code]

  const body: ApiError = {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  }

  return NextResponse.json(body, { status })
}

/**
 * Create a not found error response with suggestions
 */
export function createNotFoundWithSuggestions(
  query: string,
  suggestions: NotFoundSuggestion[],
  headers?: Record<string, string>
): NextResponse {
  const body = {
    error: {
      code: ErrorCodes.NOT_FOUND,
      message: `Territory "${query}" not found`,
      details: { query },
    },
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    hint:
      suggestions.length > 0
        ? 'Did you mean one of these territories?'
        : 'Try using /search endpoint for fuzzy matching',
  }

  return NextResponse.json(body, {
    status: 404,
    headers: {
      'Access-Control-Allow-Origin': '*',
      ...headers,
    },
  })
}

/**
 * Create a validation error response
 */
export function validationError(field: string, message: string): NextResponse<ApiError> {
  return createErrorResponse(ErrorCodes.INVALID_REQUEST, message, { field })
}

/**
 * Create a not found error response
 */
export function notFoundError(query: string): NextResponse<ApiError> {
  return createErrorResponse(ErrorCodes.NOT_FOUND, `No territoire found matching "${query}"`, {
    query,
  })
}

/**
 * Create an internal error response
 */
export function internalError(error?: unknown): NextResponse<ApiError> {
  console.error('Internal error:', error)
  return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'An internal error occurred')
}
