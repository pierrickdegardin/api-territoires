import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseQueryParams, geojsonFilterSchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// GET /api/v1/economes/geojson - Export GeoJSON des économes
async function handleGet(request: NextRequest) {
  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, geojsonFilterSchema)
    if (!parsed.success) return parsed.response

    const { region, departement, statut, reseau } = parsed.data

    const where: any = {}
    if (region) where.regionCode = region
    if (departement) where.departementCode = departement
    if (statut) where.statut = statut
    if (reseau) where.reseau = reseau

    const economes = await prisma.economeFlux.findMany({
      where,
      include: {
        structure: true,
        region: { select: { nom: true } },
        departement: { select: { nom: true } },
      },
    })

    // Construire les features GeoJSON
    const features = await Promise.all(
      economes.map(async (econome) => {
        let coordinates: [number, number] | null = null

        // Priorité 1: coordonnées de la structure (si mode ADRESSE)
        if (econome.structure?.latitude && econome.structure?.longitude) {
          coordinates = [econome.structure.longitude, econome.structure.latitude]
        }
        // Priorité 2: centroïde du groupement de la structure
        else if (econome.structure?.groupementSiren) {
          const groupement = await prisma.$queryRaw<any[]>`
            SELECT ST_X(centroid) as lon, ST_Y(centroid) as lat
            FROM groupement
            WHERE siren = ${econome.structure.groupementSiren}
            AND centroid IS NOT NULL
          `
          if (groupement.length > 0) {
            coordinates = [groupement[0].lon, groupement[0].lat]
          }
        }
        // Priorité 3: centroïde du département
        else if (econome.departementCode) {
          const dept = await prisma.$queryRaw<any[]>`
            SELECT ST_X(centroid) as lon, ST_Y(centroid) as lat
            FROM departement
            WHERE code = ${econome.departementCode}
            AND centroid IS NOT NULL
          `
          if (dept.length > 0) {
            coordinates = [dept[0].lon, dept[0].lat]
          }
        }

        return {
          type: 'Feature' as const,
          geometry: coordinates
            ? {
                type: 'Point' as const,
                coordinates,
              }
            : null,
          properties: {
            id: econome.id,
            nom: econome.nom,
            prenom: econome.prenom,
            email: econome.email,
            statut: econome.statut,
            reseau: econome.reseau,
            structure: econome.structure?.nom,
            structureType: econome.structure?.type,
            region: econome.region?.nom,
            departement: econome.departement?.nom,
            regionCode: econome.regionCode,
            departementCode: econome.departementCode,
          },
        }
      })
    )

    const geojson = {
      type: 'FeatureCollection',
      features: features.filter((f) => f.geometry !== null),
    }

    return NextResponse.json(geojson)
  } catch (error) {
    console.error('Error generating GeoJSON:', error)
    return NextResponse.json({ error: 'Erreur lors de la génération du GeoJSON' }, { status: 500 })
  }
}

export const GET = withRequestLogging(handleGet)
