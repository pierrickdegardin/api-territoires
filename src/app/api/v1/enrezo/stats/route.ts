/**
 * GET /api/v1/enrezo/stats
 *
 * Get detailed statistics about EnRezo data
 *
 * Query Parameters:
 *   - departement: Filter by department code
 *   - region: Filter by region code
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseQueryParams, enrezoStatsQuerySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

async function handleGet(request: NextRequest) {
  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, enrezoStatsQuerySchema)
    if (!parsed.success) return parsed.response

    const { departement, region } = parsed.data

    const where: any = {}
    if (departement) where.codeDepartement = departement
    if (region) where.codeRegion = region

    // Get counts by type
    const [gisementsByType, installationsByType, reseauxByType, zonesByType] = await Promise.all([
      prisma.gisementChaleur.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
        _sum: { potentielAnnuel: true },
      }),
      prisma.installationProduction.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
        _sum: { puissanceTotaleKw: true, productionMwhAn: true },
      }),
      prisma.reseauChaleurFroid.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
        _sum: { longueurKm: true, livraisonsMwh: true },
      }),
      prisma.zoneOpportunite.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
        _sum: { besoinChauffage: true, besoinFroid: true },
      }),
    ])

    // Get plateformes count
    const plateformesCount = await prisma.plateformeStockageBois.count({ where })
    const plateformesCapacity = await prisma.plateformeStockageBois.aggregate({
      where,
      _sum: { capaciteTonnes: true },
    })

    // Format gisements stats
    const gisements = {
      total: gisementsByType.reduce((acc, g) => acc + g._count.id, 0),
      potentielTotalMwh: gisementsByType.reduce((acc, g) => acc + (g._sum.potentielAnnuel || 0), 0),
      byType: Object.fromEntries(
        gisementsByType.map((g) => [
          g.type,
          {
            count: g._count.id,
            potentielMwh: g._sum.potentielAnnuel || 0,
          },
        ])
      ),
    }

    // Format installations stats
    const installations = {
      total: installationsByType.reduce((acc, i) => acc + i._count.id, 0),
      puissanceTotaleKw: installationsByType.reduce((acc, i) => acc + (i._sum.puissanceTotaleKw || 0), 0),
      productionTotaleMwh: installationsByType.reduce((acc, i) => acc + (i._sum.productionMwhAn || 0), 0),
      byType: Object.fromEntries(
        installationsByType.map((i) => [
          i.type,
          {
            count: i._count.id,
            puissanceKw: i._sum.puissanceTotaleKw || 0,
            productionMwh: i._sum.productionMwhAn || 0,
          },
        ])
      ),
    }

    // Format plateformes stats
    const plateformes = {
      total: plateformesCount,
      capaciteTotaleTonnes: plateformesCapacity._sum.capaciteTonnes || 0,
    }

    // Format reseaux stats
    const reseaux = {
      total: reseauxByType.reduce((acc, r) => acc + r._count.id, 0),
      longueurTotaleKm: reseauxByType.reduce((acc, r) => acc + (r._sum.longueurKm || 0), 0),
      livraisonsTotalesMwh: reseauxByType.reduce((acc, r) => acc + (r._sum.livraisonsMwh || 0), 0),
      byType: Object.fromEntries(
        reseauxByType.map((r) => [
          r.type,
          {
            count: r._count.id,
            longueurKm: r._sum.longueurKm || 0,
            livraisonsMwh: r._sum.livraisonsMwh || 0,
          },
        ])
      ),
    }

    // Format zones stats
    const zones = {
      total: zonesByType.reduce((acc, z) => acc + z._count.id, 0),
      besoinChauffageTotalMwh: zonesByType.reduce((acc, z) => acc + (z._sum.besoinChauffage || 0), 0),
      besoinFroidTotalMwh: zonesByType.reduce((acc, z) => acc + (z._sum.besoinFroid || 0), 0),
      byType: Object.fromEntries(
        zonesByType.map((z) => [
          z.type,
          {
            count: z._count.id,
            besoinChauffageMwh: z._sum.besoinChauffage || 0,
            besoinFroidMwh: z._sum.besoinFroid || 0,
          },
        ])
      ),
    }

    return NextResponse.json(
      {
        filters: { departement, region },
        gisements,
        installations,
        plateformes,
        reseaux,
        zones,
        source: 'CEREMA EnRezo',
        lastUpdate: new Date().toISOString(),
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('EnRezo stats error:', error)
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 500, headers: corsHeaders })
  }
}

export const GET = withRequestLogging(handleGet)
