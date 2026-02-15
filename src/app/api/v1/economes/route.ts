import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseQueryParams, parseBody, economesQuerySchema, createEconomeBodySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// GET /api/v1/economes - Liste des économes de flux
async function handleGet(request: NextRequest) {
  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, economesQuerySchema)
    if (!parsed.success) return parsed.response

    const { page, limit, region, departement, statut, reseau, structure: structureId, q } = parsed.data
    const skip = (page - 1) * limit

    const where: any = {}
    if (region) where.regionCode = region
    if (departement) where.departementCode = departement
    if (statut) where.statut = statut
    if (reseau) where.reseau = reseau
    if (structureId) where.structureId = structureId
    if (q) {
      where.OR = [
        { nom: { contains: q, mode: 'insensitive' } },
        { prenom: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [economes, total] = await Promise.all([
      prisma.economeFlux.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
        include: {
          structure: {
            select: {
              id: true,
              nom: true,
              type: true,
              siren: true,
              finess: true,
              finessEj: true,
              categorieFiness: true,
              adresse: true,
              codePostal: true,
              ville: true,
              telephone: true,
              latitude: true,
              longitude: true,
            },
          },
          region: { select: { nom: true } },
          departement: { select: { nom: true } },
        },
      }),
      prisma.economeFlux.count({ where }),
    ])

    return NextResponse.json({
      economes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching economes:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des économes' }, { status: 500 })
  }
}

// POST /api/v1/economes - Créer un économe
async function handlePost(request: NextRequest) {
  try {
    const rawBody = await request.json()

    // Validate body with Zod
    const parsed = parseBody(rawBody, createEconomeBodySchema)
    if (!parsed.success) return parsed.response

    const body = parsed.data

    const econome = await prisma.economeFlux.create({
      data: body as any,
    })

    return NextResponse.json(econome, { status: 201 })
  } catch (error) {
    console.error('Error creating econome:', error)
    return NextResponse.json({ error: "Erreur lors de la création de l'économe" }, { status: 500 })
  }
}

export const GET = withRequestLogging(handleGet)
export const POST = withRequestLogging(handlePost)
