/**
 * Zod validation schemas for API Territoires
 *
 * Reusable schemas and helpers for request validation across all endpoints.
 */

import { z } from 'zod'
import { NextResponse } from 'next/server'

// ===== REUSABLE SCHEMAS =====

/** Pagination: limit + offset */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

/** Page-based pagination: page + limit */
export const pagePaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
})

/** Code INSEE (2-5 chars) or SIREN (9 chars) */
export const codeSchema = z.string().min(1).max(9)

/** SIREN code (exactly 9 chars) */
export const sirenSchema = z.string().length(9, 'SIREN must be exactly 9 characters')

/** Search query */
export const searchQuerySchema = z
  .string()
  .min(1, 'Search query cannot be empty')
  .max(200, 'Search query too long (max 200 characters)')

/** UUID */
export const uuidSchema = z.string().uuid('Invalid UUID format')

/** Boolean from query string */
export const booleanParamSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true')

/** Territory type for list endpoint */
export const territoryListTypeSchema = z.enum(['region', 'departement', 'commune', 'groupement']).optional()

/** Territory type for match/search */
export const territoireTypeSchema = z
  .enum([
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
  ])
  .optional()

/** Département code (2-3 chars) */
export const departementCodeSchema = z.string().min(1).max(3).optional()

/** Région code (2 chars) */
export const regionCodeSchema = z.string().min(1).max(3).optional()

/** GeoJSON type filter for /geojson endpoint */
export const geojsonTypeSchema = z
  .enum([
    'region',
    'departement',
    'commune',
    'groupement',
    'epci',
    'syndicat',
    'syndicat_energie',
    'pnr',
    'petr',
    'caue',
    'alec',
    'arec',
  ])
  .optional()

/** Simplify tolerance */
export const simplifySchema = z.coerce.number().min(0).max(1).optional()

/** Email */
export const emailSchema = z.string().email('Invalid email format')

/** Direction for adhesions endpoint */
export const directionSchema = z.enum(['adheres_to', 'has_adherents']).default('adheres_to')

/** Bbox: "minLon,minLat,maxLon,maxLat" */
export const bboxSchema = z
  .string()
  .regex(
    /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/,
    'Invalid bbox format. Expected: minLon,minLat,maxLon,maxLat'
  )
  .transform((s) => {
    const [minLon, minLat, maxLon, maxLat] = s.split(',').map(Number)
    return { minLon, minLat, maxLon, maxLat }
  })
  .optional()

/** EnRezo type */
export const enrezoTypeSchema = z
  .enum([
    'gisement',
    'gisements',
    'installation',
    'installations',
    'plateforme',
    'plateformes',
    'reseau',
    'reseaux',
    'zone',
    'zones',
  ])
  .optional()

/** Format: json or geojson */
export const formatSchema = z.enum(['json', 'geojson']).default('json')

// ===== COMPOUND SCHEMAS =====

/** GET /api/v1/territoires */
export const listTerritoiresQuerySchema = z.object({
  type: territoryListTypeSchema,
  departement: departementCodeSchema,
  region: regionCodeSchema,
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  geometry: booleanParamSchema,
})

/** GET /api/v1/territoires/search */
export const searchQueryParamsSchema = z.object({
  q: z.string().min(1, 'Query parameter "q" is required').max(100, 'Query too long (max 100 characters)'),
  type: territoryListTypeSchema,
  departement: departementCodeSchema,
  region: regionCodeSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  autocomplete: booleanParamSchema,
})

/** POST /api/v1/territoires/match */
export const matchBodySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty').max(200, 'Query too long (max 200 characters)'),
  hints: z
    .object({
      departement: z.string().optional(),
      region: z.string().optional(),
      type: z.string().optional(),
    })
    .optional(),
})

/** POST /api/v1/territoires/batch */
export const batchBodySchema = z.object({
  items: z
    .array(
      z.object({
        query: z.string().min(1).max(200),
        hints: z
          .object({
            departement: z.string().optional(),
            region: z.string().optional(),
            type: z.string().optional(),
          })
          .optional(),
      })
    )
    .min(1, 'Items array cannot be empty')
    .max(1000, 'Maximum 1000 items per batch'),
  clientId: z.string().max(100).optional(),
  webhookUrl: z.string().url().optional(),
})

/** GET /api/v1/territoires/[code] */
export const codeDetailQuerySchema = z.object({
  type: z.enum(['region', 'departement', 'commune', 'groupement']).optional(),
  geometry: booleanParamSchema,
  membres: booleanParamSchema,
  enriched: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
})

/** GET /api/v1/territoires/[code]/membres */
export const membresQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  geometry: booleanParamSchema,
})

/** GET /api/v1/territoires/communes */
export const communesQuerySchema = z.object({
  departement: departementCodeSchema,
  region: regionCodeSchema,
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  geometry: booleanParamSchema,
  enriched: booleanParamSchema,
})

/** GET /api/v1/territoires/groupements */
export const groupementsQuerySchema = z.object({
  type: z.string().optional(),
  region: regionCodeSchema,
  q: z.string().max(200).optional(),
  competence: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  geometry: booleanParamSchema,
  enriched: booleanParamSchema,
})

/** GET /api/v1/territoires/geojson */
export const geojsonQuerySchema = z.object({
  type: geojsonTypeSchema,
  departement: departementCodeSchema,
  region: regionCodeSchema,
  limit: z.coerce.number().int().min(1).max(10000).optional(),
  minimal: booleanParamSchema,
  simplify: z.coerce.number().min(0).max(1).optional(),
  groupementTypes: z.string().optional(),
})

/** GET /api/v1/territoires/[code]/geometry */
export const geometryQuerySchema = z.object({
  type: z.enum(['region', 'departement', 'commune', 'groupement']).optional(),
  simplify: z.coerce.number().min(0).max(1).optional(),
})

/** GET /api/v1/territoires/[code]/adhesions */
export const adhesionsQuerySchema = z.object({
  direction: directionSchema,
})

/** POST /api/v1/territoires/apikeys */
export const createApiKeyBodySchema = z.object({
  email: emailSchema,
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
})

/** GET /api/v1/territoires/apikeys */
export const listApiKeysQuerySchema = z.object({
  email: emailSchema,
})

/** DELETE /api/v1/territoires/apikeys */
export const deleteApiKeyQuerySchema = z.object({
  id: z.string().min(1, 'API key ID is required'),
  email: emailSchema,
})

/** POST /api/v1/territoires/alias/suggest */
export const aliasSuggestBodySchema = z.object({
  alias: z.string().min(2, 'Alias must be at least 2 characters').max(200, 'Alias must be at most 200 characters'),
  codeOfficiel: z.string().min(1, 'Code officiel is required').max(9, 'Invalid code officiel format'),
  source: z.string().max(50).optional(),
  comment: z.string().max(500).optional(),
})

/** GET /api/v1/enrezo */
export const enrezoQuerySchema = z.object({
  type: enrezoTypeSchema,
  subtype: z.string().max(100).optional(),
  departement: departementCodeSchema,
  region: regionCodeSchema,
  commune: z.string().max(5).optional(),
  format: formatSchema,
  limit: z.coerce.number().int().min(1).max(10000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'Invalid bbox format')
    .optional(),
})

/** GET /api/v1/enrezo/stats */
export const enrezoStatsQuerySchema = z.object({
  departement: departementCodeSchema,
  region: regionCodeSchema,
})

/** GET /api/v1/laureats */
export const laureatsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  region: z.string().optional(),
  departement: z.string().optional(),
  type: z.string().optional(),
  statut: z.string().optional(),
  source: z.string().optional(),
  q: z.string().max(200).optional(),
})

/** POST /api/v1/laureats */
export const createLaureatBodySchema = z.object({
  nom: z.string().min(1, 'Nom is required').max(500),
  type: z.string().optional(),
  codeInsee: z.string().max(5).optional(),
  siren: z.string().max(14).optional(),
  regionCode: z.string().max(3).optional(),
  departementCode: z.string().max(3).optional(),
  communeCode: z.string().max(5).optional(),
  groupementSiren: z.string().max(9).optional(),
  statut: z.string().optional(),
  source: z.string().optional(),
  aap: z.string().optional(),
  commentaires: z.string().optional(),
  contactNom: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactTelephone: z.string().optional(),
  coutTotal: z.number().optional().nullable(),
  aideSollicitee: z.number().optional().nullable(),
  aideValidee: z.number().optional().nullable(),
  lot1: z.boolean().default(false),
  lot2: z.boolean().default(false),
  lot3: z.boolean().default(false),
  lot4: z.boolean().default(false),
  lot5: z.boolean().default(false),
})

/** PUT /api/v1/laureats/[id] - same as create but all optional */
export const updateLaureatBodySchema = createLaureatBodySchema.partial()

/** GET /api/v1/structures */
export const structuresQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  region: z.string().optional(),
  departement: z.string().optional(),
  type: z.string().optional(),
  geoMode: z.string().optional(),
  q: z.string().max(200).optional(),
})

/** POST /api/v1/structures */
export const createStructureBodySchema = z.object({
  nom: z.string().min(1, 'Nom is required').max(500),
  type: z.string().optional(),
  siren: z.string().max(14).optional(),
  geoMode: z.enum(['TERRITOIRE', 'ADRESSE', 'CUSTOM']).default('TERRITOIRE'),
  groupementSiren: z.string().max(9).optional(),
  departementCode: z.string().max(3).optional(),
  regionCode: z.string().max(3).optional(),
  perimetreCustom: z.any().optional(),
  adresse: z.string().optional(),
  codePostal: z.string().max(10).optional(),
  ville: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
})

/** PUT /api/v1/structures/[id] */
export const updateStructureBodySchema = createStructureBodySchema.partial()

/** GET /api/v1/stats */
export const statsQuerySchema = z.object({
  region: z.string().optional(),
})

/** GET /api/v1/laureats/geojson, structures/geojson */
export const geojsonFilterSchema = z.object({
  region: z.string().optional(),
  departement: z.string().optional(),
  type: z.string().optional(),
  statut: z.string().optional(),
  source: z.string().optional(),
  reseau: z.string().optional(),
  geoMode: z.string().optional(),
})

/** DELETE /api/v1/territoires/cache */
export const cacheDeleteQuerySchema = z.object({
  pattern: z.string().max(200).optional(),
})

/** GET /api/v1/territoires/departements */
export const departementsQuerySchema = z.object({
  region: regionCodeSchema,
  geometry: booleanParamSchema,
})

/** GET /api/v1/territoires/regions */
export const regionsQuerySchema = z.object({
  geometry: booleanParamSchema,
})

/** POST /api/v1/import */
export const importTypeSchema = z.enum(['laureats', 'structures'])

// ===== HELPER FUNCTIONS =====

/**
 * Parse URL search params against a Zod schema.
 * Returns { success: true, data } or { success: false, response } with a 400 error.
 */
export function parseQueryParams<T extends z.ZodType>(
  url: string | URL,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; response: NextResponse } {
  const { searchParams } = new URL(typeof url === 'string' ? url : url.toString())
  const rawParams: Record<string, string> = {}

  searchParams.forEach((value, key) => {
    rawParams[key] = value
  })

  const result = schema.safeParse(rawParams)

  if (!result.success) {
    return {
      success: false,
      response: zodErrorResponse(result.error),
    }
  }

  return { success: true, data: result.data }
}

/**
 * Parse a JSON body against a Zod schema.
 * Returns { success: true, data } or { success: false, response } with a 400 error.
 */
export function parseBody<T extends z.ZodType>(
  body: unknown,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; response: NextResponse } {
  const result = schema.safeParse(body)

  if (!result.success) {
    return {
      success: false,
      response: zodErrorResponse(result.error),
    }
  }

  return { success: true, data: result.data }
}

/**
 * Format a ZodError into a standardized 400 API error response.
 */
export function zodErrorResponse(error: z.ZodError<unknown>): NextResponse {
  const fieldErrors = error.issues.map((e: z.ZodIssue) => ({
    field: e.path.join('.') || '(root)',
    message: e.message,
    code: e.code,
  }))

  return NextResponse.json(
    {
      error: {
        code: 'INVALID_REQUEST',
        message: `Validation failed: ${fieldErrors.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join('; ')}`,
        details: { fields: fieldErrors },
      },
    },
    {
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    }
  )
}
