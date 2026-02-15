import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseQueryParams, parseBody, structuresQuerySchema, createStructureBodySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// GET /api/v1/structures - Liste des structures
async function handleGet(request: NextRequest) {
  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, structuresQuerySchema)
    if (!parsed.success) return parsed.response

    const { page, limit, region, departement, type, geoMode, q } = parsed.data
    const skip = (page - 1) * limit

    const where: any = {}
    if (region) where.regionCode = region
    if (departement) where.departementCode = departement
    if (type) where.type = type
    if (geoMode) where.geoMode = geoMode
    if (q) {
      where.nom = { contains: q, mode: 'insensitive' }
    }

    const [structures, total] = await Promise.all([
      prisma.structure.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nom: 'asc' },
        include: {
          region: { select: { nom: true } },
          departement: { select: { nom: true } },
        },
      }),
      prisma.structure.count({ where }),
    ])

    return NextResponse.json({
      structures,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching structures:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des structures' }, { status: 500 })
  }
}

// POST /api/v1/structures - Créer une structure
async function handlePost(request: NextRequest) {
  try {
    const rawBody = await request.json()

    // Validate body with Zod
    const parsed = parseBody(rawBody, createStructureBodySchema)
    if (!parsed.success) return parsed.response

    const body = parsed.data

    // Si mode ADRESSE, géocoder l'adresse
    let latitude = body.latitude
    let longitude = body.longitude

    if (body.geoMode === 'ADRESSE' && body.adresse && !latitude) {
      try {
        const adresseComplete = `${body.adresse} ${body.codePostal} ${body.ville}`
        const response = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresseComplete)}&limit=1`
        )
        const data = await response.json()
        if (data.features && data.features.length > 0) {
          const [lon, lat] = data.features[0].geometry.coordinates
          longitude = lon
          latitude = lat
        }
      } catch (e) {
        console.error('Geocoding error:', e)
      }
    }

    const structure = await prisma.structure.create({
      data: {
        ...body,
        latitude,
        longitude,
      } as any,
    })

    return NextResponse.json(structure, { status: 201 })
  } catch (error) {
    console.error('Error creating structure:', error)
    return NextResponse.json({ error: 'Erreur lors de la création de la structure' }, { status: 500 })
  }
}

export const GET = withRequestLogging(handleGet)
export const POST = withRequestLogging(handlePost)
