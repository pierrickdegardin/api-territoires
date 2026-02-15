import { NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=3600',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'API Territoires',
    version: '2.0.0',
    description:
      "API publique de données territoriales françaises. Fournit les régions, départements, communes, groupements (EPCI, syndicats), données énergétiques EnRezo (CEREMA), lauréats ACTEE et structures d'accompagnement. Source unique de référence pour toutes les données géographiques et territoriales.",
    contact: {
      name: 'Pierrick de Gardin',
      url: 'https://carte.pierrickdegardin.fr',
    },
    license: {
      name: 'Licence Ouverte / Open Licence 2.0',
      url: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
    },
  },
  servers: [{ url: '/api/v1', description: 'API v1' }],
  tags: [
    {
      name: 'Territoires',
      description: 'Recherche et consultation des territoires (régions, départements, communes, groupements)',
    },
    { name: 'Régions', description: 'Liste et détail des régions françaises' },
    { name: 'Départements', description: 'Liste et détail des départements' },
    { name: 'Communes', description: 'Liste et détail des communes' },
    { name: 'Groupements', description: 'EPCI, syndicats, PETR, PNR et autres groupements' },
    { name: 'GeoJSON', description: 'Export GeoJSON des territoires' },
    { name: 'Batch', description: 'Matching par lots (batch)' },
    { name: 'EnRezo', description: 'Données énergétiques CEREMA (gisements, installations, réseaux, zones)' },
    { name: 'Lauréats', description: "Lauréats des programmes d'accompagnement ACTEE" },
    { name: 'Structures', description: "Structures d'accompagnement" },
    { name: 'Stats', description: 'Statistiques agrégées' },
    { name: 'Santé', description: 'Health check et monitoring' },
  ],
  paths: {
    '/territoires': {
      get: {
        tags: ['Territoires'],
        summary: 'Lister les territoires',
        description:
          'Liste les territoires avec filtres et pagination. Cherche dans toutes les tables (régions, départements, communes, groupements) sauf si un type est spécifié.',
        operationId: 'listTerritoires',
        parameters: [
          { $ref: '#/components/parameters/TypeFilter' },
          { $ref: '#/components/parameters/DepartementFilter' },
          { $ref: '#/components/parameters/RegionFilter' },
          { $ref: '#/components/parameters/SearchQuery' },
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Offset' },
          {
            name: 'geometry',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Inclure les géométries',
          },
        ],
        responses: {
          '200': {
            description: 'Liste de territoires',
            headers: {
              'X-Response-Time': { $ref: '#/components/headers/X-Response-Time' },
              'X-Total-Count': { $ref: '#/components/headers/X-Total-Count' },
              'X-RateLimit-Limit': { $ref: '#/components/headers/X-RateLimit-Limit' },
              'X-RateLimit-Remaining': { $ref: '#/components/headers/X-RateLimit-Remaining' },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    territoires: { type: 'array', items: { $ref: '#/components/schemas/Territoire' } },
                    total: { type: 'integer' },
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    meta: { type: 'object' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '429': { $ref: '#/components/responses/RateLimited' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/search': {
      get: {
        tags: ['Territoires'],
        summary: 'Recherche full-text de territoires',
        description:
          "Recherche full-text insensible aux accents dans tous les territoires. Tri par pertinence (correspondance exacte, puis commence par, puis contient). Supporte le mode autocomplete pour l'intégration UI.",
        operationId: 'searchTerritoires',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string', minLength: 1 },
            description: 'Terme de recherche (requis)',
          },
          { $ref: '#/components/parameters/TypeFilter' },
          { $ref: '#/components/parameters/DepartementFilter' },
          { $ref: '#/components/parameters/RegionFilter' },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 20, maximum: 100 },
            description: 'Nombre de résultats (max 100)',
          },
          {
            name: 'autocomplete',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Mode autocomplete (résultats simplifiés)',
          },
        ],
        responses: {
          '200': {
            description: 'Résultats de recherche',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    results: { type: 'array', items: { $ref: '#/components/schemas/Territoire' } },
                    total: { type: 'integer' },
                    query: { type: 'string' },
                    searchTime: { type: 'string', example: '12ms' },
                    filters: { type: 'object' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/match': {
      post: {
        tags: ['Territoires'],
        summary: 'Matcher un nom de territoire',
        description:
          "Résout un nom de territoire vers son code officiel. Supporte des hints (département, région, type) pour améliorer la précision. Retourne le match avec un score de confiance, ou des suggestions si la correspondance n'est pas certaine.",
        operationId: 'matchTerritoire',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: {
                  query: { type: 'string', description: 'Nom du territoire à résoudre', example: 'SYDEC' },
                  hints: {
                    type: 'object',
                    properties: {
                      departement: { type: 'string', description: 'Code département', example: '40' },
                      region: { type: 'string', description: 'Code région', example: '75' },
                      type: { type: 'string', description: 'Type attendu', example: 'syndicat_energie' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Résultat du matching',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['matched'] },
                        code: { type: 'string' },
                        nom: { type: 'string' },
                        type: { type: 'string' },
                        confidence: { type: 'number', minimum: 0, maximum: 1 },
                      },
                    },
                    {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['suggestions'] },
                        alternatives: { type: 'array', items: { $ref: '#/components/schemas/Territoire' } },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '429': { $ref: '#/components/responses/RateLimited' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/batch': {
      post: {
        tags: ['Batch'],
        summary: 'Soumettre un batch de matching',
        description:
          'Soumet une liste de territoires à résoudre en batch (max 1000 items). Le traitement est asynchrone. Utilisez les endpoints status et results pour suivre la progression.',
        operationId: 'submitBatch',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BatchRequest' },
            },
          },
        },
        responses: {
          '202': {
            description: 'Batch accepté',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    requestId: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['pending'] },
                    totalItems: { type: 'integer' },
                    estimatedDuration: { type: 'integer', description: 'Durée estimée en secondes' },
                    statusUrl: { type: 'string' },
                    resultsUrl: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/batch/{requestId}': {
      get: {
        tags: ['Batch'],
        summary: "Statut d'un batch",
        description: "Retourne l'état d'avancement d'une requête batch (pending, processing, completed, failed).",
        operationId: 'getBatchStatus',
        parameters: [
          {
            name: 'requestId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID de la requête batch',
          },
        ],
        responses: {
          '200': {
            description: 'Statut du batch',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    requestId: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
                    totalItems: { type: 'integer' },
                    processed: { type: 'integer' },
                    matched: { type: 'integer' },
                    suggestions: { type: 'integer' },
                    failed: { type: 'integer' },
                    progress: { type: 'integer', description: 'Pourcentage de progression' },
                    createdAt: { type: 'string', format: 'date-time' },
                    startedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/batch/{requestId}/results': {
      get: {
        tags: ['Batch'],
        summary: "Résultats d'un batch",
        description:
          "Retourne les résultats du matching batch. Si le traitement n'est pas terminé, retourne un statut 202 avec un header Retry-After.",
        operationId: 'getBatchResults',
        parameters: [
          {
            name: 'requestId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID de la requête batch',
          },
        ],
        responses: {
          '200': {
            description: 'Résultats du batch',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BatchResult' },
              },
            },
          },
          '202': {
            description: 'Batch en cours de traitement',
            headers: {
              'Retry-After': { schema: { type: 'string' }, description: 'Délai suggéré avant retry (secondes)' },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/{code}': {
      get: {
        tags: ['Territoires'],
        summary: 'Détail par code',
        description:
          "Retourne un territoire par son code. La résolution est automatique par longueur du code (2ch=région, 2-3ch=département, 5ch=commune, 9ch=groupement). Le paramètre type permet de forcer la recherche dans une table spécifique en cas d'ambiguïté.",
        operationId: 'getTerritoire',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 9 },
            description: 'Code territoire (code INSEE ou SIREN)',
            examples: {
              region: { value: '84', summary: 'Région Auvergne-Rhône-Alpes' },
              departement: { value: '69', summary: 'Département du Rhône' },
              commune: { value: '69123', summary: 'Commune de Lyon' },
              groupement: { value: '200046977', summary: 'Métropole de Lyon' },
            },
          },
          { $ref: '#/components/parameters/TypeFilter' },
          {
            name: 'geometry',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Inclure centroïde et géométrie',
          },
          {
            name: 'membres',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Inclure les communes membres (groupements)',
          },
          {
            name: 'enriched',
            in: 'query',
            schema: { type: 'boolean', default: true },
            description: 'Inclure données enrichies BANATIC (contacts, statistiques, compétences)',
          },
        ],
        responses: {
          '200': {
            description: 'Détail du territoire',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Territoire' } } },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '429': { $ref: '#/components/responses/RateLimited' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/{code}/geometry': {
      get: {
        tags: ['GeoJSON'],
        summary: 'Géométrie GeoJSON Feature',
        description:
          "Retourne la géométrie d'un territoire sous forme de GeoJSON Feature. Supporte la simplification géométrique pour réduire le poids des réponses.",
        operationId: 'getTerritoireGeometry',
        parameters: [
          { name: 'code', in: 'path', required: true, schema: { type: 'string' }, description: 'Code territoire' },
          { $ref: '#/components/parameters/TypeFilter' },
          {
            name: 'simplify',
            in: 'query',
            schema: { type: 'number', minimum: 0 },
            description: 'Tolérance de simplification (ex: 0.001)',
          },
        ],
        responses: {
          '200': {
            description: 'GeoJSON Feature',
            content: { 'application/geo+json': { schema: { $ref: '#/components/schemas/GeoJSONFeature' } } },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/{code}/membres': {
      get: {
        tags: ['Groupements'],
        summary: "Membres d'un groupement",
        description:
          'Liste les communes membres du groupement identifié par son SIREN. Supporte la pagination et les centroïdes.',
        operationId: 'getGroupementMembres',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^\\d{9}$' },
            description: 'SIREN du groupement (9 chiffres)',
          },
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Offset' },
          {
            name: 'geometry',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Inclure les centroïdes des communes',
          },
        ],
        responses: {
          '200': {
            description: 'Liste des membres',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    groupement: {
                      type: 'object',
                      properties: {
                        siren: { type: 'string' },
                        nom: { type: 'string' },
                        type: { type: 'string' },
                        nbCommunes: { type: 'integer' },
                      },
                    },
                    membres: { type: 'array', items: { $ref: '#/components/schemas/Commune' } },
                    total: { type: 'integer' },
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '429': { $ref: '#/components/responses/RateLimited' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/{code}/adhesions': {
      get: {
        tags: ['Groupements'],
        summary: "Adhésions d'un groupement",
        description:
          "Retourne les adhésions inter-groupements. Direction 'adheres_to': groupements auxquels celui-ci adhère. Direction 'has_adherents': groupements qui adhèrent à celui-ci.",
        operationId: 'getGroupementAdhesions',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^\\d{9}$' },
            description: 'SIREN du groupement',
          },
          {
            name: 'direction',
            in: 'query',
            schema: { type: 'string', enum: ['adheres_to', 'has_adherents'], default: 'adheres_to' },
            description: "Direction de l'adhésion",
          },
        ],
        responses: {
          '200': {
            description: 'Liste des adhésions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    siren: { type: 'string' },
                    nom: { type: 'string' },
                    type: { type: 'string' },
                    direction: { type: 'string' },
                    adhesions: { type: 'array', items: { $ref: '#/components/schemas/Groupement' } },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/regions': {
      get: {
        tags: ['Régions'],
        summary: 'Lister les régions',
        description: 'Retourne toutes les régions françaises. Résultats mis en cache.',
        operationId: 'listRegions',
        parameters: [
          {
            name: 'geometry',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Inclure les géométries',
          },
        ],
        responses: {
          '200': {
            description: 'Liste des régions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    regions: { type: 'array', items: { $ref: '#/components/schemas/Region' } },
                    total: { type: 'integer' },
                    meta: { type: 'object' },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/departements': {
      get: {
        tags: ['Départements'],
        summary: 'Lister les départements',
        description: 'Retourne les départements, avec filtre optionnel par région. Résultats mis en cache.',
        operationId: 'listDepartements',
        parameters: [
          { $ref: '#/components/parameters/RegionFilter' },
          {
            name: 'geometry',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Inclure les géométries',
          },
        ],
        responses: {
          '200': {
            description: 'Liste des départements',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    departements: { type: 'array', items: { $ref: '#/components/schemas/Departement' } },
                    total: { type: 'integer' },
                    meta: { type: 'object' },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/communes': {
      get: {
        tags: ['Communes'],
        summary: 'Lister les communes',
        description:
          'Retourne les communes avec pagination. Supporte le mode enrichi avec données BANATIC (maire, contacts, statistiques socio-économiques).',
        operationId: 'listCommunes',
        parameters: [
          { $ref: '#/components/parameters/DepartementFilter' },
          { $ref: '#/components/parameters/RegionFilter' },
          { $ref: '#/components/parameters/SearchQuery' },
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Offset' },
          {
            name: 'geometry',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Inclure les géométries',
          },
          {
            name: 'enriched',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Inclure données enrichies (maire, contacts, stats)',
          },
        ],
        responses: {
          '200': {
            description: 'Liste des communes',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    communes: { type: 'array', items: { $ref: '#/components/schemas/Commune' } },
                    total: { type: 'integer' },
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    meta: { type: 'object' },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/groupements': {
      get: {
        tags: ['Groupements'],
        summary: 'Lister les groupements',
        description:
          "Retourne les groupements (EPCI, syndicats, PETR, PNR, etc.) avec pagination. Supporte le filtre par compétence (comp_1 à comp_123 ou recherche par nom comme 'électricité').",
        operationId: 'listGroupements',
        parameters: [
          {
            name: 'type',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'EPCI_CC',
                'EPCI_CA',
                'EPCI_CU',
                'EPCI_METROPOLE',
                'EPCI_EPT',
                'SYNDICAT',
                'SYNDICAT_MIXTE',
                'SYNDICAT_ENERGIE',
                'PETR',
                'PAYS',
                'PNR',
                'CAUE',
                'ALEC',
                'AREC',
              ],
            },
            description: 'Filtrer par type de groupement',
          },
          { $ref: '#/components/parameters/RegionFilter' },
          { $ref: '#/components/parameters/SearchQuery' },
          {
            name: 'competence',
            in: 'query',
            schema: { type: 'string' },
            description: "Filtrer par compétence (comp_XX ou nom comme 'électricité')",
          },
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Offset' },
          {
            name: 'geometry',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Inclure les géométries',
          },
          {
            name: 'enriched',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Inclure données enrichies (président, contacts, compétences, fiscalité)',
          },
        ],
        responses: {
          '200': {
            description: 'Liste des groupements',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    groupements: { type: 'array', items: { $ref: '#/components/schemas/Groupement' } },
                    total: { type: 'integer' },
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    meta: { type: 'object' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/geojson': {
      get: {
        tags: ['GeoJSON'],
        summary: 'Export GeoJSON FeatureCollection',
        description:
          "Exporte les territoires sous forme de GeoJSON FeatureCollection. Au moins un filtre (type, departement ou region) est requis. Supporte le mode minimal pour l'affichage cartographique et la simplification géométrique.",
        operationId: 'getTerritoiresGeoJSON',
        parameters: [
          {
            name: 'type',
            in: 'query',
            required: true,
            schema: {
              type: 'string',
              enum: [
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
              ],
            },
            description: 'Type de territoire',
          },
          { $ref: '#/components/parameters/DepartementFilter' },
          { $ref: '#/components/parameters/RegionFilter' },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 100, maximum: 10000 },
            description: 'Nombre max de features',
          },
          {
            name: 'minimal',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description: 'Mode minimal (code + géométrie uniquement)',
          },
          {
            name: 'simplify',
            in: 'query',
            schema: { type: 'number', minimum: 0 },
            description: 'Tolérance de simplification (ex: 0.001)',
          },
          {
            name: 'groupementTypes',
            in: 'query',
            schema: { type: 'string' },
            description: 'Types de groupement (séparés par virgule)',
          },
        ],
        responses: {
          '200': {
            description: 'GeoJSON FeatureCollection',
            content: {
              'application/geo+json': {
                schema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['FeatureCollection'] },
                    features: { type: 'array', items: { $ref: '#/components/schemas/GeoJSONFeature' } },
                    metadata: { type: 'object' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/territoires/health': {
      get: {
        tags: ['Santé'],
        summary: 'Health check',
        description:
          "Vérifie l'état de santé de l'API, la connexion base de données et Redis. Retourne les compteurs de territoires.",
        operationId: 'healthCheck',
        responses: {
          '200': {
            description: 'Service sain',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                    services: {
                      type: 'object',
                      properties: {
                        database: { type: 'string', enum: ['up', 'down', 'unknown'] },
                        redis: {
                          type: 'object',
                          properties: {
                            connected: { type: 'boolean' },
                            keys: { type: 'integer' },
                            memoryUsed: { type: 'string' },
                          },
                        },
                      },
                    },
                    stats: {
                      type: 'object',
                      properties: {
                        regions: { type: 'integer' },
                        departements: { type: 'integer' },
                        communes: { type: 'integer' },
                        groupements: { type: 'integer' },
                        aliases: { type: 'integer' },
                      },
                    },
                    version: { type: 'string' },
                    uptime: { type: 'number' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          '503': { description: 'Service indisponible' },
        },
      },
    },
    '/enrezo': {
      get: {
        tags: ['EnRezo'],
        summary: 'Données énergétiques EnRezo',
        description:
          "Accès aux données énergétiques CEREMA EnRezo: gisements de chaleur, installations de production, plateformes de stockage bois, réseaux de chaleur/froid, zones d'opportunité. Sans le paramètre type, retourne les endpoints disponibles et les statistiques.",
        operationId: 'getEnRezo',
        parameters: [
          {
            name: 'type',
            in: 'query',
            schema: { type: 'string', enum: ['gisement', 'installation', 'plateforme', 'reseau', 'zone'] },
            description: 'Type de données',
          },
          {
            name: 'subtype',
            in: 'query',
            schema: { type: 'string' },
            description: 'Sous-type (ex: INCINERATION, CHAUFFERIE_BOIS, CHALEUR)',
          },
          { $ref: '#/components/parameters/DepartementFilter' },
          { $ref: '#/components/parameters/RegionFilter' },
          { name: 'commune', in: 'query', schema: { type: 'string' }, description: 'Code INSEE de la commune' },
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Offset' },
          {
            name: 'format',
            in: 'query',
            schema: { type: 'string', enum: ['json', 'geojson'], default: 'json' },
            description: 'Format de réponse',
          },
          {
            name: 'bbox',
            in: 'query',
            schema: { type: 'string' },
            description: 'Bounding box (minLon,minLat,maxLon,maxLat) - zones uniquement',
          },
        ],
        responses: {
          '200': {
            description: 'Données EnRezo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/EnRezoGisement' } },
                    total: { type: 'integer' },
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    searchTime: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/enrezo/stats': {
      get: {
        tags: ['EnRezo'],
        summary: 'Statistiques EnRezo',
        description:
          'Statistiques détaillées des données EnRezo par type, avec agrégats (potentiel, puissance, longueur, etc.). Filtrable par département ou région.',
        operationId: 'getEnRezoStats',
        parameters: [
          { $ref: '#/components/parameters/DepartementFilter' },
          { $ref: '#/components/parameters/RegionFilter' },
        ],
        responses: {
          '200': {
            description: 'Statistiques EnRezo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    filters: { type: 'object' },
                    gisements: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        potentielTotalMwh: { type: 'number' },
                        byType: { type: 'object' },
                      },
                    },
                    installations: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        puissanceTotaleKw: { type: 'number' },
                        productionTotaleMwh: { type: 'number' },
                        byType: { type: 'object' },
                      },
                    },
                    plateformes: {
                      type: 'object',
                      properties: { total: { type: 'integer' }, capaciteTotaleTonnes: { type: 'number' } },
                    },
                    reseaux: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        longueurTotaleKm: { type: 'number' },
                        livraisonsTotalesMwh: { type: 'number' },
                        byType: { type: 'object' },
                      },
                    },
                    zones: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        besoinChauffageTotalMwh: { type: 'number' },
                        besoinFroidTotalMwh: { type: 'number' },
                        byType: { type: 'object' },
                      },
                    },
                    source: { type: 'string' },
                    lastUpdate: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/laureats': {
      get: {
        tags: ['Lauréats'],
        summary: 'Lister les lauréats',
        description: "Liste les lauréats des programmes d'accompagnement ACTEE avec filtres et pagination.",
        operationId: 'listLaureats',
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1, minimum: 1 },
            description: 'Numéro de page',
          },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Résultats par page' },
          { $ref: '#/components/parameters/RegionFilter' },
          { $ref: '#/components/parameters/DepartementFilter' },
          { name: 'type', in: 'query', schema: { type: 'string' }, description: 'Type de lauréat' },
          { name: 'statut', in: 'query', schema: { type: 'string' }, description: 'Statut du lauréat' },
          { name: 'source', in: 'query', schema: { type: 'string' }, description: 'Source du programme' },
          { $ref: '#/components/parameters/SearchQuery' },
        ],
        responses: {
          '200': {
            description: 'Liste des lauréats',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    laureats: { type: 'array', items: { $ref: '#/components/schemas/Laureat' } },
                    pagination: { $ref: '#/components/schemas/PaginationInfo' },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      post: {
        tags: ['Lauréats'],
        summary: 'Créer un lauréat',
        description: 'Crée un nouveau lauréat.',
        operationId: 'createLaureat',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LaureatInput' } } },
        },
        responses: {
          '201': {
            description: 'Lauréat créé',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Laureat' } } },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/laureats/{id}': {
      get: {
        tags: ['Lauréats'],
        summary: "Détail d'un lauréat",
        description: "Retourne le détail complet d'un lauréat avec ses relations territoriales.",
        operationId: 'getLaureat',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ID du lauréat' },
        ],
        responses: {
          '200': {
            description: 'Détail du lauréat',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Laureat' } } },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      put: {
        tags: ['Lauréats'],
        summary: 'Mettre à jour un lauréat',
        operationId: 'updateLaureat',
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LaureatInput' } } },
        },
        responses: {
          '200': {
            description: 'Lauréat mis à jour',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Laureat' } } },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/laureats/geojson': {
      get: {
        tags: ['Lauréats', 'GeoJSON'],
        summary: 'Export GeoJSON des lauréats',
        description:
          'Exporte les lauréats sous forme de GeoJSON FeatureCollection. Les coordonnées sont résolues depuis le groupement, la commune ou le département du lauréat.',
        operationId: 'getLaureatsGeoJSON',
        parameters: [
          { $ref: '#/components/parameters/RegionFilter' },
          { $ref: '#/components/parameters/DepartementFilter' },
          { name: 'type', in: 'query', schema: { type: 'string' }, description: 'Type de lauréat' },
          { name: 'statut', in: 'query', schema: { type: 'string' }, description: 'Statut' },
          { name: 'source', in: 'query', schema: { type: 'string' }, description: 'Source' },
        ],
        responses: {
          '200': {
            description: 'GeoJSON FeatureCollection',
            content: {
              'application/geo+json': {
                schema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['FeatureCollection'] },
                    features: { type: 'array', items: { $ref: '#/components/schemas/GeoJSONFeature' } },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/structures': {
      get: {
        tags: ['Structures'],
        summary: 'Lister les structures',
        description: "Liste les structures d'accompagnement avec filtres et pagination.",
        operationId: 'listStructures',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { $ref: '#/components/parameters/RegionFilter' },
          { $ref: '#/components/parameters/DepartementFilter' },
          { name: 'type', in: 'query', schema: { type: 'string' }, description: 'Type de structure' },
          {
            name: 'geoMode',
            in: 'query',
            schema: { type: 'string', enum: ['ADRESSE', 'TERRITOIRE', 'CUSTOM'] },
            description: 'Mode de géolocalisation',
          },
          { $ref: '#/components/parameters/SearchQuery' },
        ],
        responses: {
          '200': {
            description: 'Liste des structures',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    structures: { type: 'array', items: { $ref: '#/components/schemas/Structure' } },
                    pagination: { $ref: '#/components/schemas/PaginationInfo' },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      post: {
        tags: ['Structures'],
        summary: 'Créer une structure',
        operationId: 'createStructure',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StructureInput' } } },
        },
        responses: {
          '201': {
            description: 'Structure créée',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Structure' } } },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/structures/{id}': {
      get: {
        tags: ['Structures'],
        summary: "Détail d'une structure",
        operationId: 'getStructure',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Détail de la structure',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Structure' } } },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      put: {
        tags: ['Structures'],
        summary: 'Mettre à jour une structure',
        operationId: 'updateStructure',
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StructureInput' } } },
        },
        responses: {
          '200': {
            description: 'Structure mise à jour',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Structure' } } },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/structures/geojson': {
      get: {
        tags: ['Structures', 'GeoJSON'],
        summary: 'Export GeoJSON des structures',
        operationId: 'getStructuresGeoJSON',
        parameters: [
          { $ref: '#/components/parameters/RegionFilter' },
          { $ref: '#/components/parameters/DepartementFilter' },
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'geoMode', in: 'query', schema: { type: 'string', enum: ['ADRESSE', 'TERRITOIRE', 'CUSTOM'] } },
        ],
        responses: {
          '200': {
            description: 'GeoJSON FeatureCollection',
            content: {
              'application/geo+json': {
                schema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['FeatureCollection'] },
                    features: { type: 'array', items: { $ref: '#/components/schemas/GeoJSONFeature' } },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/stats': {
      get: {
        tags: ['Stats'],
        summary: 'Statistiques dashboard',
        description:
          'Retourne les statistiques agrégées: nombre de lauréats et structures par source, statut, type et région. Inclut les agrégats financiers.',
        operationId: 'getStats',
        parameters: [{ $ref: '#/components/parameters/RegionFilter' }],
        responses: {
          '200': {
            description: 'Statistiques',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    laureats: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        bySource: { type: 'object', additionalProperties: { type: 'integer' } },
                        byStatut: { type: 'object', additionalProperties: { type: 'integer' } },
                        byType: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: { type: { type: 'string' }, count: { type: 'integer' } },
                          },
                        },
                      },
                    },
                    structures: { type: 'object', properties: { total: { type: 'integer' } } },
                    financials: {
                      type: 'object',
                      properties: {
                        coutTotal: { type: 'number' },
                        aideSollicitee: { type: 'number' },
                        aideValidee: { type: 'number' },
                      },
                    },
                    byRegion: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          code: { type: 'string' },
                          nom: { type: 'string' },
                          nbLaureats: { type: 'integer' },
                          coutTotal: { type: 'number' },
                          aideSollicitee: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey' as const,
        in: 'header' as const,
        name: 'X-API-Key',
        description:
          "Clé API optionnelle. Sans clé: 100 req/min. Avec clé: 1000 req/min. Obtenue via l'endpoint /territoires/apikeys (admin).",
      },
    },
    parameters: {
      TypeFilter: {
        name: 'type',
        in: 'query',
        schema: { type: 'string', enum: ['region', 'departement', 'commune', 'groupement'] },
        description: 'Filtrer par type de territoire',
      },
      DepartementFilter: {
        name: 'departement',
        in: 'query',
        schema: { type: 'string' },
        description: 'Filtrer par code département (ex: 69, 2A)',
      },
      RegionFilter: {
        name: 'region',
        in: 'query',
        schema: { type: 'string' },
        description: 'Filtrer par code région (ex: 84)',
      },
      SearchQuery: {
        name: 'q',
        in: 'query',
        schema: { type: 'string' },
        description: 'Recherche par nom',
      },
      Limit: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 50, minimum: 1, maximum: 500 },
        description: 'Nombre de résultats (défaut: 50, max: 500)',
      },
      Offset: {
        name: 'offset',
        in: 'query',
        schema: { type: 'integer', default: 0, minimum: 0 },
        description: 'Décalage pour la pagination',
      },
    },
    headers: {
      'X-Request-ID': { schema: { type: 'string', format: 'uuid' }, description: 'Identifiant unique de la requête' },
      'X-Response-Time': { schema: { type: 'string', example: '42ms' }, description: 'Temps de traitement' },
      'X-Total-Count': { schema: { type: 'integer' }, description: 'Nombre total de résultats' },
      'X-RateLimit-Limit': { schema: { type: 'integer' }, description: 'Limite de requêtes par minute' },
      'X-RateLimit-Remaining': { schema: { type: 'integer' }, description: 'Requêtes restantes dans la fenêtre' },
    },
    schemas: {
      Territoire: {
        type: 'object',
        description: 'Représentation générique de tout type de territoire',
        properties: {
          code: { type: 'string', description: 'Code INSEE ou SIREN' },
          type: {
            type: 'string',
            enum: [
              'region',
              'departement',
              'commune',
              'groupement',
              'epci_cc',
              'epci_ca',
              'epci_cu',
              'epci_metropole',
              'syndicat',
              'syndicat_mixte',
              'syndicat_energie',
              'petr',
              'pays',
              'pnr',
            ],
          },
          nom: { type: 'string' },
          codeDepartement: { type: 'string', nullable: true },
          codeRegion: { type: 'string', nullable: true },
          population: { type: 'integer', nullable: true },
          superficie: { type: 'number', nullable: true },
          aliases: { type: 'array', items: { type: 'string' } },
        },
        required: ['code', 'type', 'nom'],
      },
      Region: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code région (2 caractères)', example: '84' },
          nom: { type: 'string', example: 'Auvergne-Rhône-Alpes' },
          type: { type: 'string', enum: ['region'] },
          population: { type: 'integer', nullable: true },
          superficie: { type: 'number', nullable: true },
          chefLieu: { type: 'string', nullable: true },
        },
        required: ['code', 'nom'],
      },
      Departement: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code département (2-3 caractères)', example: '69' },
          nom: { type: 'string', example: 'Rhône' },
          type: { type: 'string', enum: ['departement'] },
          codeRegion: { type: 'string' },
          population: { type: 'integer', nullable: true },
          superficie: { type: 'number', nullable: true },
          chefLieu: { type: 'string', nullable: true },
        },
        required: ['code', 'nom', 'codeRegion'],
      },
      Commune: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code INSEE (5 caractères)', example: '69123' },
          nom: { type: 'string', example: 'Lyon' },
          type: { type: 'string', enum: ['commune'] },
          codeDepartement: { type: 'string' },
          codeRegion: { type: 'string' },
          codesPostaux: { type: 'array', items: { type: 'string' } },
          population: { type: 'integer', nullable: true },
          superficie: { type: 'number', nullable: true },
          latitude: { type: 'number', nullable: true },
          longitude: { type: 'number', nullable: true },
          caracteristiques: { type: 'object', description: 'Données enrichies (mode enriched)', nullable: true },
          maire: {
            type: 'object',
            nullable: true,
            properties: { civilite: { type: 'string' }, nom: { type: 'string' }, prenom: { type: 'string' } },
          },
          contact: {
            type: 'object',
            nullable: true,
            properties: {
              adresse: { type: 'string' },
              codePostal: { type: 'string' },
              telephone: { type: 'string' },
              email: { type: 'string' },
            },
          },
          statistiques: {
            type: 'object',
            nullable: true,
            properties: {
              densite: { type: 'number' },
              variationPopulation: { type: 'number' },
              tauxActivite: { type: 'number' },
              tauxChomage: { type: 'number' },
              revenuFiscalMedian: { type: 'number' },
            },
          },
          dotations: {
            type: 'object',
            nullable: true,
            properties: { dgfTotale: { type: 'number' }, dgfParHabitant: { type: 'number' } },
          },
        },
        required: ['code', 'nom'],
      },
      Groupement: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'SIREN (9 caractères)' },
          siren: { type: 'string' },
          nom: { type: 'string' },
          type: { type: 'string' },
          nature: { type: 'string', nullable: true },
          codeRegion: { type: 'string', nullable: true },
          population: { type: 'integer', nullable: true },
          nbCommunes: { type: 'integer', nullable: true },
          latitude: { type: 'number', nullable: true },
          longitude: { type: 'number', nullable: true },
          communeSiege: { type: 'string', nullable: true },
          caracteristiques: { type: 'object', nullable: true },
          president: {
            type: 'object',
            nullable: true,
            properties: { civilite: { type: 'string' }, nom: { type: 'string' }, prenom: { type: 'string' } },
          },
          contact: { type: 'object', nullable: true },
          fiscalite: { type: 'object', nullable: true },
          competences: {
            type: 'array',
            nullable: true,
            items: { type: 'object', properties: { code: { type: 'string' }, nom: { type: 'string' } } },
          },
        },
        required: ['siren', 'nom', 'type'],
      },
      EnRezoGisement: {
        type: 'object',
        description: "Entité de données EnRezo (gisement, installation, plateforme, réseau, zone d'opportunité)",
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          nom: { type: 'string', nullable: true },
          codeInsee: { type: 'string', nullable: true },
          codeDepartement: { type: 'string', nullable: true },
          codeRegion: { type: 'string', nullable: true },
          latitude: { type: 'number', nullable: true },
          longitude: { type: 'number', nullable: true },
        },
      },
      Laureat: {
        type: 'object',
        description: "Lauréat d'un programme ACTEE",
        properties: {
          id: { type: 'string' },
          nom: { type: 'string' },
          type: { type: 'string' },
          statut: { type: 'string' },
          source: { type: 'string' },
          regionCode: { type: 'string', nullable: true },
          departementCode: { type: 'string', nullable: true },
          communeCode: { type: 'string', nullable: true },
          groupementSiren: { type: 'string', nullable: true },
          coutTotal: { type: 'number', nullable: true },
          aideSollicitee: { type: 'number', nullable: true },
          aideValidee: { type: 'number', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'nom'],
      },
      LaureatInput: {
        type: 'object',
        description: "Données de création/mise à jour d'un lauréat",
        properties: {
          nom: { type: 'string' },
          type: { type: 'string' },
          statut: { type: 'string' },
          source: { type: 'string' },
          regionCode: { type: 'string' },
          departementCode: { type: 'string' },
          communeCode: { type: 'string' },
          groupementSiren: { type: 'string' },
          coutTotal: { type: 'number' },
          aideSollicitee: { type: 'number' },
          aideValidee: { type: 'number' },
        },
        required: ['nom'],
      },
      Structure: {
        type: 'object',
        description: "Structure d'accompagnement",
        properties: {
          id: { type: 'string' },
          nom: { type: 'string' },
          type: { type: 'string' },
          siren: { type: 'string', nullable: true },
          finess: { type: 'string', nullable: true },
          geoMode: { type: 'string', enum: ['ADRESSE', 'TERRITOIRE', 'CUSTOM'] },
          adresse: { type: 'string', nullable: true },
          codePostal: { type: 'string', nullable: true },
          ville: { type: 'string', nullable: true },
          telephone: { type: 'string', nullable: true },
          latitude: { type: 'number', nullable: true },
          longitude: { type: 'number', nullable: true },
          regionCode: { type: 'string', nullable: true },
          departementCode: { type: 'string', nullable: true },
          groupementSiren: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'nom', 'type'],
      },
      StructureInput: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          type: { type: 'string' },
          siren: { type: 'string' },
          geoMode: { type: 'string', enum: ['ADRESSE', 'TERRITOIRE', 'CUSTOM'] },
          adresse: { type: 'string' },
          codePostal: { type: 'string' },
          ville: { type: 'string' },
          telephone: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          regionCode: { type: 'string' },
          departementCode: { type: 'string' },
          groupementSiren: { type: 'string' },
        },
        required: ['nom', 'type'],
      },
      GeoJSONFeature: {
        type: 'object',
        description: 'GeoJSON Feature',
        properties: {
          type: { type: 'string', enum: ['Feature'] },
          properties: { type: 'object' },
          geometry: {
            type: 'object',
            nullable: true,
            properties: {
              type: { type: 'string', enum: ['Point', 'MultiPolygon', 'Polygon', 'LineString', 'MultiLineString'] },
              coordinates: {},
            },
          },
        },
        required: ['type', 'properties', 'geometry'],
      },
      BatchRequest: {
        type: 'object',
        description: 'Requête de matching par lots',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            maxItems: 1000,
            items: {
              type: 'object',
              required: ['query'],
              properties: {
                query: { type: 'string', maxLength: 200 },
                hints: {
                  type: 'object',
                  properties: {
                    departement: { type: 'string' },
                    region: { type: 'string' },
                    type: { type: 'string' },
                  },
                },
              },
            },
          },
          clientId: { type: 'string', maxLength: 100, description: 'Identifiant client pour le suivi' },
          webhookUrl: { type: 'string', format: 'uri', description: 'URL de callback en fin de traitement' },
        },
      },
      BatchResult: {
        type: 'object',
        description: 'Résultats du matching par lots',
        properties: {
          requestId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                query: { type: 'string' },
                status: { type: 'string', enum: ['matched', 'suggestions', 'failed'] },
                code: { type: 'string', nullable: true },
                nom: { type: 'string', nullable: true },
                type: { type: 'string', nullable: true },
                confidence: { type: 'number', nullable: true },
                alternatives: { type: 'array', items: { $ref: '#/components/schemas/Territoire' }, nullable: true },
                error: { type: 'string', nullable: true },
              },
            },
          },
          summary: {
            type: 'object',
            properties: {
              total: { type: 'integer' },
              matched: { type: 'integer' },
              suggestions: { type: 'integer' },
              failed: { type: 'integer' },
              successRate: { type: 'number' },
            },
          },
        },
      },
      PaginationInfo: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          pages: { type: 'integer' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object', nullable: true },
            },
            required: ['code', 'message'],
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Requête invalide',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Ressource non trouvée',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      RateLimited: {
        description: 'Limite de requêtes dépassée',
        headers: {
          'Retry-After': { schema: { type: 'integer' }, description: 'Secondes avant retry' },
          'X-RateLimit-Limit': { $ref: '#/components/headers/X-RateLimit-Limit' },
          'X-RateLimit-Remaining': { $ref: '#/components/headers/X-RateLimit-Remaining' },
        },
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      InternalError: {
        description: 'Erreur interne du serveur',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }, {}],
}

export async function GET() {
  return NextResponse.json(spec, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
