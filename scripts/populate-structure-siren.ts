/**
 * Script pour peupler les SIREN des structures à partir de l'API Territoires
 * Usage: npx tsx scripts/populate-structure-siren.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const API_BASE = 'http://localhost:3020/api/v1/territoires'

// Structures connues avec leur SIREN (pour éviter les homonymes)
const KNOWN_STRUCTURES: Record<string, string> = {
  // Syndicats d'énergie
  syane: '200023372',
  syder: '243800758',
  sde07: '200054906',
  sde09: '200054948',
  sde24: '200041630',
  sde28: '200033678',
  sde35: '253500015',
  sde38: '200068658',
  sde54: '200068146',
  sdet: '200043602',
  siel42: '200068989',
  sdey: '258900219',
  sydev: '200076002',
  sydec: '254001399',
  'sie de la nièvre': '200066975',
  "syndicat departemental d'energie 35": '253500015',

  // Métropoles
  'bordeaux métropole': '243300316',
  'bordeaux metropole': '243300316',
  'métropole de lyon': '200046977',
  'metropole de lyon': '200046977',
  'grand lyon': '200046977',
  'aix-marseille-provence métropole': '200054807',
  'toulouse métropole': '243100518',
  'métropole de nantes': '244400404',
  'métropole de lille': '200093201',
  'métropole de grenoble': '200040715',
  'métropole de nice': '200030195',
  'métropole de rennes': '243500139',
  'métropole de montpellier': '243400017',
  'métropole de strasbourg': '246700488',
  'nimes métropole': '200035319',
  "communauté d'agglomération de nîmes métropole": '200035319',

  // ALECs et autres
  'arec occitanie': '820992847',
}

function normalizeString(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function searchSiren(
  structureName: string,
  structureType: string,
  departementCode: string | null
): Promise<string | null> {
  const normalizedName = normalizeString(structureName)

  // Vérifier les structures connues d'abord
  if (KNOWN_STRUCTURES[normalizedName]) {
    console.log(`  ✓ Structure connue: ${KNOWN_STRUCTURES[normalizedName]}`)
    return KNOWN_STRUCTURES[normalizedName]
  }

  // Recherche via l'API
  try {
    const searchUrl = `${API_BASE}/search?q=${encodeURIComponent(structureName)}&limit=10`
    const response = await fetch(searchUrl)
    if (!response.ok) {
      console.log(`  ✗ Erreur API: ${response.status}`)
      return null
    }

    const data = await response.json()
    const results = data.results || []

    if (results.length === 0) {
      console.log(`  ✗ Aucun résultat`)
      return null
    }

    // Score les résultats
    let bestMatch: any = null
    let bestScore = 0

    for (const result of results) {
      let score = 0
      const resultName = normalizeString(result.nom || '')

      // Score de similarité du nom
      if (resultName === normalizedName) {
        score += 100
      } else if (resultName.includes(normalizedName) || normalizedName.includes(resultName)) {
        score += 50
      }

      // Bonus si le département correspond
      if (departementCode && result.departement?.code === departementCode) {
        score += 30
      }

      // Bonus selon le type
      if (
        structureType === 'SYNDICAT_ENERGIE' &&
        (result.type?.includes('SYNDICAT') || result.type?.includes('ENER'))
      ) {
        score += 20
      }
      if (
        structureType === 'COMMUNAUTE_COMMUNES' &&
        (result.type?.includes('EPCI') ||
          result.type?.includes('CC') ||
          result.type?.includes('CA') ||
          result.type?.includes('CU') ||
          result.type?.includes('METROPOLE'))
      ) {
        score += 20
      }

      if (score > bestScore) {
        bestScore = score
        bestMatch = result
      }
    }

    if (bestMatch && bestScore >= 30) {
      const siren = bestMatch.siren || bestMatch.code
      if (siren && /^\d{9}$/.test(siren)) {
        console.log(`  ✓ Trouvé: ${siren} (${bestMatch.nom}, score: ${bestScore})`)
        return siren
      }
    }

    console.log(`  ✗ Pas de match suffisant (meilleur score: ${bestScore})`)
    return null
  } catch (error) {
    console.log(`  ✗ Erreur: ${error}`)
    return null
  }
}

async function main() {
  console.log('=== Peuplement des SIREN des structures ===\n')

  // Récupérer toutes les structures sans SIREN
  const structures = await prisma.structure.findMany({
    where: { siren: null },
    orderBy: { nom: 'asc' },
  })

  console.log(`${structures.length} structures sans SIREN\n`)

  let updated = 0
  let notFound = 0

  for (const structure of structures) {
    console.log(`[${updated + notFound + 1}/${structures.length}] ${structure.nom} (${structure.type})`)

    const siren = await searchSiren(structure.nom, structure.type, structure.departementCode)

    if (siren) {
      try {
        await prisma.structure.update({
          where: { id: structure.id },
          data: { siren },
        })
        updated++
      } catch (error) {
        // SIREN déjà utilisé (doublon)
        console.log(`  ✗ SIREN déjà utilisé`)
        notFound++
      }
    } else {
      notFound++
    }

    // Pause pour éviter rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  console.log(`\n=== Résultat ===`)
  console.log(`Mis à jour: ${updated}`)
  console.log(`Non trouvés: ${notFound}`)

  await prisma.$disconnect()
}

main().catch(console.error)
