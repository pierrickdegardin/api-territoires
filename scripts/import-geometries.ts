/**
 * Import des géométries depuis geo.api.gouv.fr
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const GEO_API = 'https://geo.api.gouv.fr'

async function importRegionGeometries() {
  console.log('\n📍 Import géométries REGIONS...')

  const response = await fetch(`${GEO_API}/regions?fields=code,nom,contour`)
  const regions = (await response.json()) as Array<{
    code: string
    nom: string
    contour?: { type: string; coordinates: number[][][] }
  }>

  for (const r of regions) {
    if (r.contour) {
      await prisma.$executeRawUnsafe(
        `
        UPDATE region 
        SET geometry = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
            centroid = ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))
        WHERE code = $2
      `,
        JSON.stringify(r.contour),
        r.code
      )
    }
  }
  console.log(`   ✅ ${regions.length} régions avec géométrie`)
}

async function importDepartementGeometries() {
  console.log('\n📍 Import géométries DEPARTEMENTS...')

  const response = await fetch(`${GEO_API}/departements?fields=code,nom,contour`)
  const depts = (await response.json()) as Array<{
    code: string
    nom: string
    contour?: { type: string; coordinates: number[][][] }
  }>

  let count = 0
  for (const d of depts) {
    if (d.contour) {
      await prisma.$executeRawUnsafe(
        `
        UPDATE departement 
        SET geometry = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
            centroid = ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))
        WHERE code = $2
      `,
        JSON.stringify(d.contour),
        d.code
      )
      count++
    }
  }
  console.log(`   ✅ ${count} départements avec géométrie`)
}

async function main() {
  console.log('╔════════════════════════════════════════════╗')
  console.log('║   Import des GEOMETRIES (polygones)        ║')
  console.log('╚════════════════════════════════════════════╝')

  await importRegionGeometries()
  await importDepartementGeometries()

  // Vérifier
  const stats = await prisma.$queryRaw<Array<{ regions: bigint; depts: bigint }>>`
    SELECT 
      (SELECT COUNT(*) FROM region WHERE geometry IS NOT NULL) as regions,
      (SELECT COUNT(*) FROM departement WHERE geometry IS NOT NULL) as depts
  `

  console.log('\n✅ Import terminé')
  console.log(`   - Régions avec géométrie: ${stats[0].regions}`)
  console.log(`   - Départements avec géométrie: ${stats[0].depts}`)

  await prisma.$disconnect()
}

main().catch(console.error)
