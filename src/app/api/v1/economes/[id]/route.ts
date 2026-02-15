import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseBody, updateEconomeBodySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// GET /api/v1/economes/[id]
async function handleGet(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const econome = await prisma.economeFlux.findUnique({
      where: { id },
      include: {
        structure: true,
        region: true,
        departement: true,
      },
    })

    if (!econome) {
      return NextResponse.json({ error: 'Économe non trouvé' }, { status: 404 })
    }

    return NextResponse.json(econome)
  } catch (error) {
    console.error('Error fetching econome:', error)
    return NextResponse.json({ error: "Erreur lors de la récupération de l'économe" }, { status: 500 })
  }
}

// PUT /api/v1/economes/[id]
async function handlePut(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const rawBody = await request.json()

    // Validate body with Zod
    const parsed = parseBody(rawBody, updateEconomeBodySchema)
    if (!parsed.success) return parsed.response

    const body = parsed.data

    const econome = await prisma.economeFlux.update({
      where: { id },
      data: body as any,
    })

    return NextResponse.json(econome)
  } catch (error) {
    console.error('Error updating econome:', error)
    return NextResponse.json({ error: "Erreur lors de la mise à jour de l'économe" }, { status: 500 })
  }
}

// DELETE /api/v1/economes/[id]
async function handleDelete(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.economeFlux.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting econome:', error)
    return NextResponse.json({ error: "Erreur lors de la suppression de l'économe" }, { status: 500 })
  }
}

export const GET = withRequestLogging(handleGet)
export const PUT = withRequestLogging(handlePut)
export const DELETE = withRequestLogging(handleDelete)
