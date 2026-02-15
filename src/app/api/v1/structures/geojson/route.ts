import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseQueryParams, geojsonFilterSchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// GET /api/v1/structures/geojson - Export GeoJSON des structures
async function handleGet(request: NextRequest) {
  try {
    // Validate query parameters with Zod
    const parsed = parseQueryParams(request.url, geojsonFilterSchema)
    if (!parsed.success) return parsed.response

    const { region, departement, type, geoMode } = parsed.data

    const where: any = {}
    if (region) where.regionCode = region
    if (departement) where.departementCode = departement
    if (type) where.type = type
    if (geoMode) where.geoMode = geoMode

    const structures = await prisma.structure.findMany({
      where,
      include: {
        region: { select: { nom: true } },
        departement: { select: { nom: true } },
        _count: { select: { economes: true } },
      },
    })

    // Construire les features GeoJSON
    const features = await Promise.all(
      structures.map(async (structure) => {
        let geometry: any = null

        // Mode ADRESSE: point géocodé
        if (structure.geoMode === 'ADRESSE' && structure.latitude && structure.longitude) {
          geometry = {
            type: 'Point',
            coordinates: [structure.longitude, structure.latitude],
          }
        }
        // Mode CUSTOM: polygone personnalisé
        else if (structure.geoMode === 'CUSTOM' && structure.perimetreCustom) {
          geometry = structure.perimetreCustom
        }
        // Mode TERRITOIRE: centroïde du territoire référencé
        else if (structure.geoMode === 'TERRITOIRE') {
          // Priorité: groupement > département > région
          if (structure.groupementSiren) {
            const groupement = await prisma.$queryRaw<any[]>`
              SELECT ST_X(centroid) as lon, ST_Y(centroid) as lat
              FROM groupement
              WHERE siren = ${structure.groupementSiren}
              AND centroid IS NOT NULL
            `
            if (groupement.length > 0) {
              geometry = {
                type: 'Point',
                coordinates: [groupement[0].lon, groupement[0].lat],
              }
            }
          } else if (structure.departementCode) {
            const dept = await prisma.$queryRaw<any[]>`
              SELECT ST_X(centroid) as lon, ST_Y(centroid) as lat
              FROM departement
              WHERE code = ${structure.departementCode}
              AND centroid IS NOT NULL
            `
            if (dept.length > 0) {
              geometry = {
                type: 'Point',
                coordinates: [dept[0].lon, dept[0].lat],
              }
            }
          } else if (structure.regionCode) {
            const region = await prisma.$queryRaw<any[]>`
              SELECT ST_X(centroid) as lon, ST_Y(centroid) as lat
              FROM region
              WHERE code = ${structure.regionCode}
              AND centroid IS NOT NULL
            `
            if (region.length > 0) {
              geometry = {
                type: 'Point',
                coordinates: [region[0].lon, region[0].lat],
              }
            }
          }
        }

        return {
          type: 'Feature' as const,
          geometry,
          properties: {
            id: structure.id,
            nom: structure.nom,
            type: structure.type,
            siren: structure.siren,
            geoMode: structure.geoMode,
            region: structure.region?.nom,
            departement: structure.departement?.nom,
            regionCode: structure.regionCode,
            departementCode: structure.departementCode,
            nbEconomes: structure._count.economes,
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
