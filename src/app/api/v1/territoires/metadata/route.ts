/**
 * GET /api/v1/territoires/metadata
 *
 * Returns metadata about the territorial data:
 * - Data sources and their versions
 * - Last update dates
 * - Statistics by territory type
 * - Coverage information
 *
 * Story 3-3: Métadonnées BANATIC & suggestions
 *
 * Response:
 *   {
 *     "version": "1.0.0",
 *     "sources": {...},
 *     "statistics": {...},
 *     "lastUpdated": "2026-01-15T00:00:00Z"
 *   }
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, rateLimitResponse, addRateLimitHeaders } from '@/lib/territoires/rate-limit'
import { NextRequest } from 'next/server'
import { withRequestLogging } from '@/lib/logger'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
}

// Handle preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

async function handleGet(request: NextRequest) {
  // Rate limiting check
  const rateLimitResult = await checkRateLimit(request)
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult)
  }

  const startTime = Date.now()

  try {
    // Get territory counts by type
    const typeCounts = await prisma.$queryRaw<Array<{ type: string; count: bigint }>>`
      SELECT type::text, COUNT(*) as count
      FROM territoire
      GROUP BY type
      ORDER BY count DESC
    `

    // Get geometry coverage stats
    const geoCoverage = await prisma.$queryRaw<
      Array<{
        type: string
        total: bigint
        with_geometry: bigint
        with_centroid: bigint
      }>
    >`
      SELECT
        type::text,
        COUNT(*) as total,
        COUNT(geometry) as with_geometry,
        COUNT(centroid) as with_centroid
      FROM territoire
      GROUP BY type
      ORDER BY total DESC
    `

    // Get alias statistics
    const aliasStats = await prisma.$queryRaw<Array<{ source: string; count: bigint }>>`
      SELECT source, COUNT(*) as count
      FROM alias
      GROUP BY source
      ORDER BY count DESC
    `

    // Get last update timestamp
    const lastUpdate = await prisma.$queryRaw<Array<{ last_update: Date }>>`
      SELECT MAX(updated_at) as last_update FROM territoire
    `

    // Build statistics object
    const statistics = {
      byType: Object.fromEntries(typeCounts.map((t) => [t.type, Number(t.count)])),
      total: typeCounts.reduce((sum, t) => sum + Number(t.count), 0),
      geometryCoverage: Object.fromEntries(
        geoCoverage.map((g) => [
          g.type,
          {
            total: Number(g.total),
            withGeometry: Number(g.with_geometry),
            withCentroid: Number(g.with_centroid),
            geometryCoverage: g.total > 0 ? Math.round((Number(g.with_geometry) / Number(g.total)) * 100) : 0,
          },
        ])
      ),
      aliases: {
        total: aliasStats.reduce((sum, a) => sum + Number(a.count), 0),
        bySource: Object.fromEntries(aliasStats.map((a) => [a.source, Number(a.count)])),
      },
    }

    // Build metadata response
    const metadata = {
      version: '1.0.0',
      apiVersion: 'v1',
      name: 'API Territoires France',
      description: 'Données territoriales administratives françaises',

      sources: {
        banatic: {
          name: 'Base nationale sur les intercommunalités (BANATIC)',
          url: 'https://www.banatic.interieur.gouv.fr/',
          provider: "DGCL - Ministère de l'Intérieur",
          description: 'Liste des groupements (EPCI, syndicats, PETR)',
          coverage: 'Métropole + Outre-mer',
        },
        cog: {
          name: 'Code Officiel Géographique (COG)',
          url: 'https://www.insee.fr/fr/information/2560452',
          provider: 'INSEE',
          description: 'Codes et noms des régions, départements, communes',
          coverage: 'Métropole + Outre-mer',
        },
        geoApi: {
          name: 'API Géo',
          url: 'https://geo.api.gouv.fr/',
          provider: 'Etalab',
          description: 'Géométries des territoires',
          coverage: 'Métropole + Outre-mer',
        },
        openDataSoft: {
          name: 'OpenDataSoft Géo Communes',
          url: 'https://public.opendatasoft.com/',
          provider: 'OpenDataSoft',
          description: 'Géométries détaillées des communes',
          coverage: 'Métropole',
        },
      },

      statistics,

      coverage: {
        regions: {
          count: statistics.byType.region || 0,
          description: '18 régions françaises (13 métropole + 5 outre-mer)',
        },
        departements: {
          count: statistics.byType.departement || 0,
          description: '101 départements (96 métropole + 5 outre-mer)',
        },
        communes: {
          count: statistics.byType.commune || 0,
          description: 'Toutes les communes françaises',
        },
        groupements: {
          epci:
            (statistics.byType.epci_cc || 0) +
            (statistics.byType.epci_ca || 0) +
            (statistics.byType.epci_cu || 0) +
            (statistics.byType.epci_metropole || 0) +
            (statistics.byType.epci_ept || 0),
          syndicats: (statistics.byType.syndicat || 0) + (statistics.byType.syndicat_energie || 0),
          autres: (statistics.byType.petr || 0) + (statistics.byType.pays || 0) + (statistics.byType.pnr || 0),
        },
      },

      lastUpdated: lastUpdate[0]?.last_update?.toISOString() || null,

      contact: {
        organization: 'ACTEE',
        website: 'https://www.actee.fr/',
        email: 'contact@actee.fr',
      },

      license: {
        name: 'Licence Ouverte 2.0',
        url: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
        description: 'Données réutilisables librement',
      },
    }

    const duration = Date.now() - startTime

    const response = NextResponse.json(metadata, {
      headers: {
        ...corsHeaders,
        'X-Response-Time': `${duration}ms`,
      },
    })

    return addRateLimitHeaders(response, rateLimitResult)
  } catch (error) {
    console.error('GET /territoires/metadata error:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } },
      { status: 500, headers: corsHeaders }
    )
  }
}

export const GET = withRequestLogging(handleGet)
