import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseQueryParams, statsQuerySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// GET /api/v1/stats - Dashboard stats
async function handleGet(request: NextRequest) {
  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, statsQuerySchema)
    if (!parsed.success) return parsed.response

    const { region } = parsed.data

    const where: any = {}
    if (region) where.regionCode = region

    // Stats lauréats
    const [
      totalLaureats,
      laureatsBySource,
      laureatsByStatut,
      laureatsByType,
      totalEconomes,
      economesByStatut,
      totalStructures,
      financials,
    ] = await Promise.all([
      // Total lauréats
      prisma.laureat.count({ where }),

      // Par source
      prisma.laureat.groupBy({
        by: ['source'],
        where,
        _count: true,
      }),

      // Par statut
      prisma.laureat.groupBy({
        by: ['statut'],
        where,
        _count: true,
      }),

      // Par type
      prisma.laureat.groupBy({
        by: ['type'],
        where,
        _count: true,
        orderBy: { _count: { type: 'desc' } },
        take: 10,
      }),

      // Total économes
      prisma.economeFlux.count({ where }),

      // Économes par statut
      prisma.economeFlux.groupBy({
        by: ['statut'],
        where,
        _count: true,
      }),

      // Total structures
      prisma.structure.count({ where }),

      // Agrégats financiers
      prisma.laureat.aggregate({
        where,
        _sum: {
          coutTotal: true,
          aideSollicitee: true,
          aideValidee: true,
        },
      }),
    ])

    // Stats par région
    const statsByRegion = await prisma.$queryRaw<any[]>`
      SELECT
        r.code,
        r.nom,
        COUNT(DISTINCT l.id) as nb_laureats,
        COUNT(DISTINCT e.id) as nb_economes,
        COALESCE(SUM(l.cout_total), 0) as cout_total,
        COALESCE(SUM(l.aide_sollicitee), 0) as aide_sollicitee
      FROM region r
      LEFT JOIN laureat l ON l.region_code = r.code
      LEFT JOIN econome_flux e ON e.region_code = r.code
      GROUP BY r.code, r.nom
      ORDER BY nb_laureats DESC
    `

    return NextResponse.json({
      laureats: {
        total: totalLaureats,
        bySource: laureatsBySource.reduce(
          (acc, item) => {
            acc[item.source] = item._count
            return acc
          },
          {} as Record<string, number>
        ),
        byStatut: laureatsByStatut.reduce(
          (acc, item) => {
            acc[item.statut] = item._count
            return acc
          },
          {} as Record<string, number>
        ),
        byType: laureatsByType.map((item) => ({
          type: item.type,
          count: item._count,
        })),
      },
      economes: {
        total: totalEconomes,
        byStatut: economesByStatut.reduce(
          (acc, item) => {
            acc[item.statut] = item._count
            return acc
          },
          {} as Record<string, number>
        ),
      },
      structures: {
        total: totalStructures,
      },
      financials: {
        coutTotal: financials._sum.coutTotal || 0,
        aideSollicitee: financials._sum.aideSollicitee || 0,
        aideValidee: financials._sum.aideValidee || 0,
      },
      byRegion: statsByRegion.map((r) => ({
        code: r.code,
        nom: r.nom,
        nbLaureats: Number(r.nb_laureats),
        nbEconomes: Number(r.nb_economes),
        coutTotal: Number(r.cout_total),
        aideSollicitee: Number(r.aide_sollicitee),
      })),
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des statistiques' }, { status: 500 })
  }
}

export const GET = withRequestLogging(handleGet)
