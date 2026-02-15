import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseBody, updateLaureatBodySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// GET /api/v1/laureats/[id]
async function handleGet(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const laureat = await prisma.laureat.findUnique({
      where: { id },
      include: {
        region: true,
        departement: true,
        communeRef: true,
        groupement: true,
      },
    })

    if (!laureat) {
      return NextResponse.json({ error: 'Lauréat non trouvé' }, { status: 404 })
    }

    return NextResponse.json(laureat)
  } catch (error) {
    console.error('Error fetching laureat:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération du lauréat' }, { status: 500 })
  }
}

// PUT /api/v1/laureats/[id]
async function handlePut(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const rawBody = await request.json()

    // Validate body with Zod
    const parsed = parseBody(rawBody, updateLaureatBodySchema)
    if (!parsed.success) return parsed.response

    const body = parsed.data

    const laureat = await prisma.laureat.update({
      where: { id },
      data: body as any,
    })

    return NextResponse.json(laureat)
  } catch (error) {
    console.error('Error updating laureat:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour du lauréat' }, { status: 500 })
  }
}

// DELETE /api/v1/laureats/[id]
async function handleDelete(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.laureat.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting laureat:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression du lauréat' }, { status: 500 })
  }
}

export const GET = withRequestLogging(handleGet)
export const PUT = withRequestLogging(handlePut)
export const DELETE = withRequestLogging(handleDelete)
