import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseQueryParams, searchByCommuneQuerySchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// GET /api/v1/economes/search-by-commune - Trouver les économes couvrant une commune
async function handleGet(request: NextRequest) {
  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, searchByCommuneQuerySchema)
    if (!parsed.success) return parsed.response

    const communeCode = parsed.data.commune

    // Récupérer la commune et ses groupements
    const commune = await prisma.commune.findUnique({
      where: { code: communeCode },
      include: {
        groupements: {
          include: {
            groupement: true,
          },
        },
      },
    })

    if (!commune) {
      return NextResponse.json({ error: 'Commune non trouvée' }, { status: 404 })
    }

    // SIRENs des groupements de la commune
    const groupementSirens = commune.groupements.map((g) => g.groupement.siren)

    // Rechercher les économes dont la structure couvre cette commune
    const economes = await prisma.economeFlux.findMany({
      where: {
        OR: [
          // Structure liée à un groupement contenant la commune
          {
            structure: {
              groupementSiren: { in: groupementSirens },
            },
          },
          // Structure du département
          {
            structure: {
              departementCode: commune.codeDepartement,
              geoMode: 'TERRITOIRE',
            },
          },
          // Structure de la région
          {
            structure: {
              regionCode: commune.codeRegion,
              geoMode: 'TERRITOIRE',
            },
          },
          // Économe affecté directement au département
          {
            departementCode: commune.codeDepartement,
          },
        ],
        statut: 'ACTIF',
      },
      include: {
        structure: {
          select: {
            id: true,
            nom: true,
            type: true,
            geoMode: true,
          },
        },
        region: { select: { nom: true } },
        departement: { select: { nom: true } },
      },
    })

    return NextResponse.json({
      commune: {
        code: commune.code,
        nom: commune.nom,
        departementCode: commune.codeDepartement,
        regionCode: commune.codeRegion,
        groupements: commune.groupements.map((g) => ({
          siren: g.groupement.siren,
          nom: g.groupement.nom,
          type: g.groupement.type,
        })),
      },
      economes: economes.map((e) => ({
        id: e.id,
        nom: e.nom,
        prenom: e.prenom,
        email: e.email,
        telephone: e.telephone,
        structure: e.structure,
        region: e.region?.nom,
        departement: e.departement?.nom,
      })),
    })
  } catch (error) {
    console.error('Error searching economes by commune:', error)
    return NextResponse.json({ error: 'Erreur lors de la recherche des économes' }, { status: 500 })
  }
}

export const GET = withRequestLogging(handleGet)
