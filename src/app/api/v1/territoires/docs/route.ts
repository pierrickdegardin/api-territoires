/**
 * GET /api/v1/territoires/docs
 *
 * OpenAPI 3.0 specification for API Territoires
 *
 * Story 6-1: Documentation OpenAPI & Swagger UI
 *
 * Response:
 *   OpenAPI 3.0 specification in JSON format
 */

import { NextResponse } from 'next/server'
import { withRequestLogging } from '@/lib/logger'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=3600',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

async function handleGet() {
  const baseUrl = '/api/v1/territoires'

  const openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'API Territoires France',
      description: `API publique pour accéder aux données des territoires administratifs français.

## Fonctionnalités
- **Matching**: Résolution de noms de collectivités vers codes officiels
- **Recherche**: Full-text search via base de données
- **Données**: Régions, départements, communes, EPCI, syndicats
- **Géométries**: GeoJSON pour affichage cartographique

## Rate Limiting
- Sans API key: 100 requêtes/minute par IP
- Avec API key: 1000 requêtes/minute

## CORS
Tous les endpoints supportent CORS avec \`Access-Control-Allow-Origin: *\`
`,
      version: '1.0.0',
      contact: {
        name: 'ACTEE',
        email: 'contact@actee.fr',
        url: 'https://actee.fr',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'https://carte.pierrickdegardin.fr/api/v1/territoires',
        description: 'Production',
      },
      {
        url: 'https://dev.carte.pierrickdegardin.fr/api/v1/territoires',
        description: 'Development',
      },
      {
        url: 'http://localhost:3002/api/v1/territoires',
        description: 'Local',
      },
    ],
    tags: [
      { name: 'Matching', description: 'Résolution de noms vers codes officiels' },
      { name: 'Search', description: 'Recherche full-text' },
      { name: 'Territories', description: 'Accès aux données territoriales' },
      { name: 'Geometry', description: 'Géométries GeoJSON' },
      { name: 'Metadata', description: 'Informations et health check' },
    ],
    paths: {
      '/match': {
        post: {
          tags: ['Matching'],
          summary: 'Match un nom de collectivité vers son code officiel',
          description: 'Résout un nom de collectivité vers son code INSEE/SIREN avec score de confiance',
          operationId: 'matchTerritoire',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MatchRequest' },
                examples: {
                  simple: {
                    summary: 'Recherche simple',
                    value: { query: 'SYDEC' },
                  },
                  withHints: {
                    summary: 'Avec hints géographiques',
                    value: {
                      query: 'Langon',
                      hints: { departement: '35' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Match trouvé ou suggestions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MatchResponse' },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            429: { $ref: '#/components/responses/RateLimited' },
            500: { $ref: '#/components/responses/InternalError' },
          },
        },
      },
      '/batch': {
        post: {
          tags: ['Matching'],
          summary: 'Batch matching de plusieurs noms',
          description: "Soumet jusqu'à 1000 noms pour matching asynchrone",
          operationId: 'batchMatch',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BatchRequest' },
              },
            },
          },
          responses: {
            202: {
              description: 'Batch accepté',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BatchSubmitResponse' },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            429: { $ref: '#/components/responses/RateLimited' },
          },
        },
      },
      '/search': {
        get: {
          tags: ['Search'],
          summary: 'Recherche full-text sur les territoires',
          operationId: 'searchTerritoires',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              description: 'Terme de recherche (min 2 caractères)',
              schema: { type: 'string', minLength: 2, maxLength: 100 },
            },
            {
              name: 'type',
              in: 'query',
              description: 'Filtrer par type (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'departement',
              in: 'query',
              description: 'Filtrer par code département',
              schema: { type: 'string' },
            },
            {
              name: 'region',
              in: 'query',
              description: 'Filtrer par code région',
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Nombre de résultats (défaut: 20, max: 100)',
              schema: { type: 'integer', default: 20, maximum: 100 },
            },
            {
              name: 'autocomplete',
              in: 'query',
              description: 'Mode autocomplete (résultats simplifiés)',
              schema: { type: 'boolean', default: false },
            },
          ],
          responses: {
            200: {
              description: 'Résultats de recherche',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SearchResponse' },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
          },
        },
      },
      '/': {
        get: {
          tags: ['Territories'],
          summary: 'Liste les territoires avec filtres',
          operationId: 'listTerritoires',
          parameters: [
            {
              name: 'type',
              in: 'query',
              description: 'Type de territoire',
              schema: { $ref: '#/components/schemas/TerritoireType' },
            },
            {
              name: 'departement',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'region',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'geometry',
              in: 'query',
              description: 'Inclure les géométries',
              schema: { type: 'boolean', default: false },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50, maximum: 500 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            200: {
              description: 'Liste de territoires',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TerritoireListResponse' },
                },
              },
            },
          },
        },
      },
      '/{code}': {
        get: {
          tags: ['Territories'],
          summary: 'Récupère un territoire par code',
          operationId: 'getTerritoire',
          parameters: [
            {
              name: 'code',
              in: 'path',
              required: true,
              description: 'Code INSEE ou SIREN',
              schema: { type: 'string' },
            },
            {
              name: 'geometry',
              in: 'query',
              schema: { type: 'boolean', default: false },
            },
            {
              name: 'children',
              in: 'query',
              description: 'Inclure les territoires enfants',
              schema: { type: 'boolean', default: false },
            },
            {
              name: 'parents',
              in: 'query',
              description: 'Inclure les territoires parents',
              schema: { type: 'boolean', default: false },
            },
          ],
          responses: {
            200: {
              description: 'Détail du territoire',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Territoire' },
                },
              },
            },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/{code}/geometry': {
        get: {
          tags: ['Geometry'],
          summary: 'Récupère la géométrie GeoJSON',
          operationId: 'getTerritoireGeometry',
          parameters: [
            {
              name: 'code',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'simplified',
              in: 'query',
              description: 'Géométrie simplifiée (défaut: true)',
              schema: { type: 'boolean', default: true },
            },
          ],
          responses: {
            200: {
              description: 'GeoJSON Feature',
              content: {
                'application/geo+json': {
                  schema: { $ref: '#/components/schemas/GeoJSONFeature' },
                },
              },
            },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/geojson': {
        get: {
          tags: ['Geometry'],
          summary: 'Export GeoJSON FeatureCollection',
          operationId: 'exportGeoJSON',
          parameters: [
            {
              name: 'type',
              in: 'query',
              description: 'Type de territoire (requis)',
              schema: { $ref: '#/components/schemas/TerritoireType' },
            },
            {
              name: 'departement',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'region',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'codes',
              in: 'query',
              description: 'Liste de codes (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'simplified',
              in: 'query',
              schema: { type: 'boolean', default: true },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 100, maximum: 1000 },
            },
          ],
          responses: {
            200: {
              description: 'GeoJSON FeatureCollection',
              content: {
                'application/geo+json': {
                  schema: { $ref: '#/components/schemas/GeoJSONFeatureCollection' },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
          },
        },
      },
      '/regions': {
        get: {
          tags: ['Territories'],
          summary: 'Liste des régions françaises',
          operationId: 'listRegions',
          parameters: [
            {
              name: 'geometry',
              in: 'query',
              schema: { type: 'boolean', default: false },
            },
          ],
          responses: {
            200: {
              description: 'Liste des 18 régions',
            },
          },
        },
      },
      '/departements': {
        get: {
          tags: ['Territories'],
          summary: 'Liste des départements',
          operationId: 'listDepartements',
          parameters: [
            {
              name: 'region',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'geometry',
              in: 'query',
              schema: { type: 'boolean', default: false },
            },
          ],
          responses: {
            200: {
              description: 'Liste des 101 départements',
            },
          },
        },
      },
      '/communes': {
        get: {
          tags: ['Territories'],
          summary: 'Liste des communes',
          operationId: 'listCommunes',
          parameters: [
            {
              name: 'departement',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50, maximum: 500 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            200: {
              description: 'Liste paginée des communes',
            },
          },
        },
      },
      '/groupements': {
        get: {
          tags: ['Territories'],
          summary: 'Liste des groupements (EPCI, syndicats)',
          operationId: 'listGroupements',
          parameters: [
            {
              name: 'type',
              in: 'query',
              description: 'Type de groupement',
              schema: { type: 'string' },
            },
            {
              name: 'departement',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50, maximum: 500 },
            },
          ],
          responses: {
            200: {
              description: 'Liste des groupements',
            },
          },
        },
      },
      '/health': {
        get: {
          tags: ['Metadata'],
          summary: 'Health check',
          operationId: 'healthCheck',
          responses: {
            200: {
              description: 'Service healthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
            503: {
              description: 'Service unhealthy',
            },
          },
        },
      },
      '/info': {
        get: {
          tags: ['Metadata'],
          summary: 'Information API',
          operationId: 'getInfo',
          responses: {
            200: {
              description: 'Documentation API',
            },
          },
        },
      },
      '/alias/suggest': {
        post: {
          tags: ['Matching'],
          summary: 'Suggérer un nouvel alias',
          description: 'Permet de suggérer un alias manquant pour enrichir la base',
          operationId: 'suggestAlias',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AliasSuggestion' },
              },
            },
          },
          responses: {
            201: {
              description: 'Suggestion enregistrée',
            },
            400: { $ref: '#/components/responses/BadRequest' },
            409: {
              description: 'Alias déjà existant',
            },
          },
        },
      },
    },
    components: {
      schemas: {
        TerritoireType: {
          type: 'string',
          enum: [
            'region',
            'departement',
            'commune',
            'epci_cc',
            'epci_ca',
            'epci_cu',
            'epci_metropole',
            'epci_ept',
            'syndicat',
            'syndicat_energie',
            'petr',
            'pays',
            'pnr',
          ],
        },
        MatchRequest: {
          type: 'object',
          required: ['query'],
          properties: {
            query: {
              type: 'string',
              description: 'Nom de la collectivité à matcher',
              minLength: 1,
              maxLength: 200,
            },
            hints: {
              type: 'object',
              properties: {
                departement: { type: 'string' },
                region: { type: 'string' },
                type: { $ref: '#/components/schemas/TerritoireType' },
              },
            },
          },
        },
        MatchResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['matched', 'suggestions', 'failed'],
            },
            code: { type: 'string' },
            nom: { type: 'string' },
            type: { $ref: '#/components/schemas/TerritoireType' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            matchSource: {
              type: 'string',
              enum: ['direct', 'alias', 'database'],
            },
            alternatives: {
              type: 'array',
              items: { $ref: '#/components/schemas/MatchAlternative' },
            },
          },
        },
        MatchAlternative: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            nom: { type: 'string' },
            type: { $ref: '#/components/schemas/TerritoireType' },
            confidence: { type: 'number' },
          },
        },
        BatchRequest: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              maxItems: 1000,
              items: { $ref: '#/components/schemas/MatchRequest' },
            },
            clientId: { type: 'string' },
            webhookUrl: { type: 'string', format: 'uri' },
          },
        },
        BatchSubmitResponse: {
          type: 'object',
          properties: {
            requestId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['pending', 'processing', 'completed'] },
            totalItems: { type: 'integer' },
            statusUrl: { type: 'string' },
            resultsUrl: { type: 'string' },
          },
        },
        SearchResponse: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: { $ref: '#/components/schemas/TerritoireSummary' },
            },
            total: { type: 'integer' },
            query: { type: 'string' },
            searchTime: { type: 'string' },
          },
        },
        Territoire: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            type: { $ref: '#/components/schemas/TerritoireType' },
            nom: { type: 'string' },
            departement: { type: 'string' },
            region: { type: 'string' },
            population: { type: 'integer' },
            geometry: { $ref: '#/components/schemas/GeoJSONGeometry' },
            centroid: { $ref: '#/components/schemas/GeoJSONPoint' },
            children: { type: 'array', items: { $ref: '#/components/schemas/TerritoireSummary' } },
            parents: { type: 'array', items: { $ref: '#/components/schemas/TerritoireSummary' } },
            aliases: { type: 'array', items: { type: 'string' } },
          },
        },
        TerritoireSummary: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            type: { type: 'string' },
            nom: { type: 'string' },
            departement: { type: 'string' },
            region: { type: 'string' },
          },
        },
        TerritoireListResponse: {
          type: 'object',
          properties: {
            territoires: {
              type: 'array',
              items: { $ref: '#/components/schemas/TerritoireSummary' },
            },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
          },
        },
        GeoJSONFeature: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['Feature'] },
            properties: { type: 'object' },
            geometry: { $ref: '#/components/schemas/GeoJSONGeometry' },
          },
        },
        GeoJSONFeatureCollection: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['FeatureCollection'] },
            features: { type: 'array', items: { $ref: '#/components/schemas/GeoJSONFeature' } },
          },
        },
        GeoJSONGeometry: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['Point', 'Polygon', 'MultiPolygon'] },
            coordinates: {},
          },
        },
        GeoJSONPoint: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['Point'] },
            coordinates: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            services: {
              type: 'object',
              properties: {
                database: { type: 'string', enum: ['up', 'down'] },
              },
            },
            version: { type: 'string' },
            uptime: { type: 'number' },
          },
        },
        AliasSuggestion: {
          type: 'object',
          required: ['alias', 'codeOfficiel'],
          properties: {
            alias: { type: 'string', minLength: 2, maxLength: 200 },
            codeOfficiel: { type: 'string', description: 'Code INSEE ou SIREN cible' },
            source: { type: 'string', default: 'user_contribution' },
            comment: { type: 'string', maxLength: 500 },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
              },
            },
          },
        },
      },
      responses: {
        BadRequest: {
          description: 'Requête invalide',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
            },
          },
        },
        NotFound: {
          description: 'Ressource non trouvée',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
            },
          },
        },
        RateLimited: {
          description: 'Trop de requêtes',
          headers: {
            'Retry-After': {
              schema: { type: 'integer' },
              description: 'Secondes avant retry',
            },
            'X-RateLimit-Remaining': {
              schema: { type: 'integer' },
            },
          },
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
            },
          },
        },
        InternalError: {
          description: 'Erreur interne',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
            },
          },
        },
      },
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key pour rate limit étendu (1000 req/min)',
        },
      },
    },
    security: [],
  }

  return NextResponse.json(openApiSpec, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

export const GET = withRequestLogging(handleGet)
