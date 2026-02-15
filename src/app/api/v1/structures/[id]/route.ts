import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseBody, updateStructureBodySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// GET /api/v1/structures/[id]
async function handleGet(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const structure = await prisma.structure.findUnique({
      where: { id },
      include: {
        region: true,
        departement: true,
        groupement: true,
        economes: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            statut: true,
          },
        },
      },
    })

    if (!structure) {
      return NextResponse.json({ error: 'Structure non trouvée' }, { status: 404 })
    }

    return NextResponse.json(structure)
  } catch (error) {
    console.error('Error fetching structure:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération de la structure' }, { status: 500 })
  }
}

// PUT /api/v1/structures/[id]
async function handlePut(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const rawBody = await request.json()

    // Validate body with Zod
    const parsed = parseBody(rawBody, updateStructureBodySchema)
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

    const structure = await prisma.structure.update({
      where: { id },
      data: {
        ...body,
        latitude,
        longitude,
      } as any,
    })

    return NextResponse.json(structure)
  } catch (error) {
    console.error('Error updating structure:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour de la structure' }, { status: 500 })
  }
}

// DELETE /api/v1/structures/[id]
async function handleDelete(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // Vérifier qu'il n'y a pas d'économes liés
    const structure = await prisma.structure.findUnique({
      where: { id },
      include: { _count: { select: { economes: true } } },
    })

    if (!structure) {
      return NextResponse.json({ error: 'Structure non trouvée' }, { status: 404 })
    }

    if (structure._count.economes > 0) {
      return NextResponse.json(
        {
          error: `Impossible de supprimer: ${structure._count.economes} économe(s) lié(s)`,
        },
        { status: 400 }
      )
    }

    await prisma.structure.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting structure:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression de la structure' }, { status: 500 })
  }
}

export const GET = withRequestLogging(handleGet)
export const PUT = withRequestLogging(handlePut)
export const DELETE = withRequestLogging(handleDelete)
