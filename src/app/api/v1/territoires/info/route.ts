/**
 * GET /api/v1/territoires/info
 *
 * API information and available endpoints
 *
 * Response:
 *   {
 *     "name": "API Territoires France",
 *     "version": "1.0.0",
 *     "endpoints": [...]
 *   }
 */

import { NextResponse } from 'next/server'
import { withRequestLogging } from '@/lib/logger'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=3600',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

async function handleGet() {
  const baseUrl = '/api/v1/territoires'

  const info = {
    name: 'API Territoires France',
    version: '1.0.0',
    description: 'API publique pour les territoires administratifs français',
    documentation: 'https://github.com/actee-energie/carte/blob/main/docs/api-territoires.md',
    endpoints: [
      {
        method: 'GET',
        path: `${baseUrl}`,
        description: 'Liste les territoires avec filtres et pagination',
        params: ['type', 'departement', 'region', 'q', 'limit', 'offset', 'geometry'],
      },
      {
        method: 'GET',
        path: `${baseUrl}/{code}`,
        description: "Détail d'un territoire par code",
        params: ['geometry', 'children', 'parents'],
      },
      {
        method: 'GET',
        path: `${baseUrl}/regions`,
        description: 'Liste des 18 régions françaises',
        params: ['geometry'],
      },
      {
        method: 'GET',
        path: `${baseUrl}/departements`,
        description: 'Liste des départements',
        params: ['region', 'geometry'],
      },
      {
        method: 'GET',
        path: `${baseUrl}/communes`,
        description: 'Liste des communes avec pagination',
        params: ['departement', 'region', 'q', 'limit', 'offset', 'geometry'],
      },
      {
        method: 'GET',
        path: `${baseUrl}/groupements`,
        description: 'Liste des groupements (EPCI, syndicats, etc.)',
        params: ['type', 'departement', 'region', 'q', 'limit', 'offset', 'geometry'],
      },
      {
        method: 'GET',
        path: `${baseUrl}/search`,
        description: 'Recherche full-text sur tous les territoires',
        params: ['q', 'type', 'departement', 'region', 'limit', 'autocomplete'],
      },
      {
        method: 'POST',
        path: `${baseUrl}/match`,
        description: 'Résout un nom de territoire en code officiel',
        body: {
          query: 'string',
          hints: { type: 'string?', departement: 'string?', region: 'string?' },
        },
      },
      {
        method: 'POST',
        path: `${baseUrl}/batch`,
        description: 'Soumet un batch de matching (max 1000 items)',
        body: { items: '[{query, hints?}]', clientId: 'string?' },
      },
      {
        method: 'GET',
        path: `${baseUrl}/batch/{requestId}`,
        description: "Status d'un batch de matching",
      },
      {
        method: 'GET',
        path: `${baseUrl}/batch/{requestId}/results`,
        description: "Résultats d'un batch de matching",
      },
      {
        method: 'GET',
        path: `${baseUrl}/{code}/geometry`,
        description: "Géométrie GeoJSON d'un territoire",
        params: ['simplified'],
      },
      {
        method: 'GET',
        path: `${baseUrl}/geojson`,
        description: 'Export FeatureCollection GeoJSON',
        params: ['type', 'departement', 'region', 'codes', 'simplified', 'limit'],
      },
      {
        method: 'GET',
        path: `${baseUrl}/health`,
        description: 'Health check pour monitoring',
      },
      {
        method: 'GET',
        path: `${baseUrl}/info`,
        description: 'Cette documentation',
      },
      {
        method: 'GET',
        path: `${baseUrl}/metadata`,
        description: 'Métadonnées sur les sources de données',
      },
      {
        method: 'GET',
        path: `${baseUrl}/{code}/membres`,
        description: "Liste des membres d'un territoire avec pagination",
        params: ['type', 'relation', 'limit', 'offset', 'geometry'],
      },
      {
        method: 'GET',
        path: `${baseUrl}/docs`,
        description: 'Documentation OpenAPI (Swagger)',
      },
      {
        method: 'POST',
        path: `${baseUrl}/alias/suggest`,
        description: 'Suggérer un nouvel alias pour un territoire',
        body: {
          aliasNom: 'string',
          codeOfficiel: 'string',
          source: 'string?',
          justification: 'string?',
        },
      },
      {
        method: 'POST',
        path: `${baseUrl}/apikeys`,
        description: 'Créer une nouvelle clé API (1000 req/min vs 100 anonymous)',
        body: { email: 'string', name: 'string?', description: 'string?' },
        note: 'La clé est retournée une seule fois, sauvegardez-la.',
      },
      {
        method: 'GET',
        path: `${baseUrl}/apikeys`,
        description: 'Lister les clés API pour un email',
        params: ['email'],
      },
      {
        method: 'DELETE',
        path: `${baseUrl}/apikeys`,
        description: 'Révoquer une clé API',
        params: ['id', 'email'],
      },
    ],
    types: {
      region: 'Région (18)',
      departement: 'Département (101)',
      commune: 'Commune (34875)',
      epci_cc: 'Communauté de communes',
      epci_ca: "Communauté d'agglomération",
      epci_cu: 'Communauté urbaine',
      epci_metropole: 'Métropole',
      epci_ept: 'Établissement public territorial',
      syndicat: 'Syndicat intercommunal',
      syndicat_mixte: 'Syndicat mixte',
      syndicat_energie: "Syndicat d'énergie (réseau Territoire d'énergie / FNCCR)",
      petr: "Pôle d'équilibre territorial et rural",
      pays: 'Pays',
      pnr: 'Parc naturel régional',
      caue: "Conseil d'Architecture, d'Urbanisme et de l'Environnement (1 par département)",
      alec: "Agence Locale de l'Énergie et du Climat (réseau FLAME)",
      arec: "Agence Régionale de l'Énergie et du Climat (réseau RARE)",
    },
    contact: {
      organization: 'ACTEE',
      email: 'contact@actee.fr',
    },
  }

  return NextResponse.json(info, {
    headers: corsHeaders,
  })
}

export const GET = withRequestLogging(handleGet)
