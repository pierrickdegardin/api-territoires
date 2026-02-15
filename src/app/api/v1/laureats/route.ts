import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseQueryParams, parseBody, laureatsQuerySchema, createLaureatBodySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// GET /api/v1/laureats - Liste des lauréats avec filtres
async function handleGet(request: NextRequest) {
  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, laureatsQuerySchema)
    if (!parsed.success) return parsed.response

    const { page, limit, region, departement, type, statut, source, q } = parsed.data
    const skip = (page - 1) * limit

    // Construction du where
    const where: any = {}

    if (region) where.regionCode = region
    if (departement) where.departementCode = departement
    if (type) where.type = type
    if (statut) where.statut = statut
    if (source) where.source = source
    if (q) {
      where.nom = { contains: q, mode: 'insensitive' }
    }

    // Requête
    const [laureats, total] = await Promise.all([
      prisma.laureat.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nom: 'asc' },
        include: {
          region: { select: { nom: true } },
          departement: { select: { nom: true } },
        },
      }),
      prisma.laureat.count({ where }),
    ])

    return NextResponse.json({
      laureats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching laureats:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des lauréats' }, { status: 500 })
  }
}

// POST /api/v1/laureats - Créer un lauréat
async function handlePost(request: NextRequest) {
  try {
    const rawBody = await request.json()

    // Validate body with Zod
    const parsed = parseBody(rawBody, createLaureatBodySchema)
    if (!parsed.success) return parsed.response

    const body = parsed.data

    const laureat = await prisma.laureat.create({
      data: body as any,
    })

    return NextResponse.json(laureat, { status: 201 })
  } catch (error) {
    console.error('Error creating laureat:', error)
    return NextResponse.json({ error: 'Erreur lors de la création du lauréat' }, { status: 500 })
  }
}

export const GET = withRequestLogging(handleGet)
export const POST = withRequestLogging(handlePost)
