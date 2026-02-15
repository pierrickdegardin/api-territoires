import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseQueryParams, geojsonFilterSchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// GET /api/v1/laureats/geojson - Export GeoJSON
async function handleGet(request: NextRequest) {
  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, geojsonFilterSchema)
    if (!parsed.success) return parsed.response

    const { region, departement, type, statut, source } = parsed.data

    const where: any = {}
    if (region) where.regionCode = region
    if (departement) where.departementCode = departement
    if (type) where.type = type
    if (statut) where.statut = statut
    if (source) where.source = source

    // Récupérer les lauréats avec leurs territoires
    const laureats = await prisma.laureat.findMany({
      where,
      include: {
        region: { select: { nom: true } },
        departement: { select: { nom: true } },
      },
    })

    // Récupérer les centroïdes des territoires
    const laureatIds = laureats.map((l) => l.id)

    // Pour chaque lauréat, récupérer le centroïde du territoire associé
    const features = await Promise.all(
      laureats.map(async (laureat) => {
        let coordinates: [number, number] | null = null

        // Essayer d'abord le groupement
        if (laureat.groupementSiren) {
          const groupement = await prisma.$queryRaw<any[]>`
            SELECT ST_X(centroid) as lon, ST_Y(centroid) as lat
            FROM groupement
            WHERE siren = ${laureat.groupementSiren}
            AND centroid IS NOT NULL
          `
          if (groupement.length > 0) {
            coordinates = [groupement[0].lon, groupement[0].lat]
          }
        }

        // Sinon essayer la commune
        if (!coordinates && laureat.communeCode) {
          const commune = await prisma.$queryRaw<any[]>`
            SELECT longitude as lon, latitude as lat
            FROM commune
            WHERE code = ${laureat.communeCode}
          `
          if (commune.length > 0 && commune[0].lon && commune[0].lat) {
            coordinates = [commune[0].lon, commune[0].lat]
          }
        }

        // Sinon centroïde du département
        if (!coordinates) {
          const dept = await prisma.$queryRaw<any[]>`
            SELECT ST_X(centroid) as lon, ST_Y(centroid) as lat
            FROM departement
            WHERE code = ${laureat.departementCode}
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
            id: laureat.id,
            nom: laureat.nom,
            type: laureat.type,
            statut: laureat.statut,
            source: laureat.source,
            region: laureat.region?.nom,
            departement: laureat.departement?.nom,
            regionCode: laureat.regionCode,
            departementCode: laureat.departementCode,
            coutTotal: laureat.coutTotal,
            aideSollicitee: laureat.aideSollicitee,
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
