/**
 * Import des géométries PNR depuis OpenStreetMap (data.gouv.fr)
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'

const prisma = new PrismaClient()

interface PNRFeature {
  type: string
  properties: {
    name?: string
    [key: string]: unknown
  }
  geometry: {
    type: string
    coordinates: unknown
  }
}

interface GeoJSON {
  type: string
  features: PNRFeature[]
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/parc naturel regional/gi, '')
    .replace(/syndicat mixte/gi, '')
    .replace(/d'amenagement et de gestion/gi, '')
    .replace(/de gestion/gi, '')
    .replace(/du|de la|des|le|la|les|de|d'/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  const dataPath = '/tmp/pnr-osm.json'

  if (!fs.existsSync(dataPath)) {
    console.error('Fichier non trouvé:', dataPath)
    process.exit(1)
  }

  const data: GeoJSON = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
  console.log('PNR dans le fichier:', data.features.length)

  // Récupérer tous les PNR de la base
  const dbPnr = await prisma.groupement.findMany({
    where: {
      OR: [
        { nom: { contains: 'parc naturel', mode: 'insensitive' } },
        { nom: { contains: 'PNR', mode: 'insensitive' } },
      ],
    },
    select: { siren: true, nom: true },
  })

  console.log('PNR dans DB:', dbPnr.length)

  let matched = 0
  let updated = 0
  const notMatched: string[] = []

  for (const feature of data.features) {
    const pnrName = feature.properties.name || ''
    const normPnr = normalize(pnrName)

    // Chercher le meilleur match
    let bestMatch: { siren: string; nom: string } | null = null
    let bestScore = 0

    for (const db of dbPnr) {
      const normDb = normalize(db.nom)

      // Compter les mots communs
      const pnrWords = normPnr.split(' ').filter((w) => w.length >= 3)
      const dbWords = normDb.split(' ').filter((w) => w.length >= 3)

      let common = 0
      for (const pw of pnrWords) {
        for (const dw of dbWords) {
          if (pw === dw || pw.includes(dw) || dw.includes(pw)) {
            common++
            break
          }
        }
      }

      const score = common / Math.max(1, Math.min(pnrWords.length, dbWords.length))

      if (score > bestScore) {
        bestScore = score
        bestMatch = db
      }
    }

    if (bestMatch && bestScore >= 0.5) {
      matched++

      try {
        const geomJson = JSON.stringify(feature.geometry)

        await prisma.$executeRaw`
          UPDATE groupement SET
            geometry = ST_Multi(ST_GeomFromGeoJSON(${geomJson})),
            centroid = ST_Centroid(ST_GeomFromGeoJSON(${geomJson}))
          WHERE siren = ${bestMatch.siren}
          AND geometry IS NULL
        `
        updated++
        console.log(`✓ ${pnrName.substring(0, 45).padEnd(45)} -> ${bestMatch.nom.substring(0, 50)}`)
      } catch (e: any) {
        console.log(`✗ ${pnrName.substring(0, 45)} - ${e.message?.substring(0, 40) || e}`)
      }
    } else {
      notMatched.push(pnrName)
    }
  }

  console.log('\n=== Résultats ===')
  console.log(`Matched: ${matched}`)
  console.log(`Updated: ${updated}`)
  console.log(`Not matched: ${notMatched.length}`)

  if (notMatched.length > 0) {
    console.log('\nPNR non matchés:')
    for (const nm of notMatched.slice(0, 10)) {
      console.log(`  - ${nm}`)
    }
  }

  // Stats finales
  const stats = await prisma.$queryRaw<Array<{ total: bigint; with_geom: bigint }>>`
    SELECT
      COUNT(*) as total,
      COUNT(geometry) as with_geom
    FROM groupement
    WHERE nom ILIKE '%parc naturel%' OR nom ILIKE '%PNR%'
  `

  console.log(`\nPNR: ${stats[0].with_geom}/${stats[0].total} avec géométrie`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
