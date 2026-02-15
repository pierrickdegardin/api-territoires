/**
 * Script pour peupler les SIREN des ALECs et établissements de santé
 * - ALECs via API SIRENE (recherche-entreprises.api.gouv.fr)
 * - Hôpitaux via API FINESS (et SIRENE en fallback)
 *
 * Usage: npx tsx scripts/populate-alec-finess.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// API SIRENE: https://recherche-entreprises.api.gouv.fr/search
const SIRENE_API = 'https://recherche-entreprises.api.gouv.fr/search'

// API FINESS: https://etablissements-finess.api.gouv.fr
const FINESS_API = 'https://etablissements-finess.api.gouv.fr/api/etablissements'

// Mapping connu des ALECs avec leur SIREN
const KNOWN_ALECS: Record<string, string> = {
  // Format: nom normalisé -> SIREN
  'alec lyon': '449015437',
  'alec marseille metropole': '522992246',
  'alec ouest essonne': '527977888',
  'alec soleval': '802314347',
  'alec 27': '823180486',
  'alec grand paris sud est avenir': '824120143',
  'alec mvse': '482616626',
  'alec plaine commune': '508024359',
  'alec montpellier': '502953182',
  'alec nancy': '482895857',
  'alec rennes': '443604896',
  ale08: '518574732',
  aloen: '521985571',
  'alec pays de st brieuc': '539016882',
  'alec grenoble': '483715842',
}

// Mapping des ARS avec leur SIREN (source: annuaire-entreprises.data.gouv.fr)
const KNOWN_ARS: Record<string, { siren: string; regionCode: string }> = {
  'auvergne rhone alpes': { siren: '130017214', regionCode: '84' },
  'bourgogne franche comte': { siren: '130017271', regionCode: '27' },
  bretagne: { siren: '130017289', regionCode: '53' },
  'centre val de loire': { siren: '130017297', regionCode: '24' },
  corse: { siren: '130020259', regionCode: '94' },
  'grand est': { siren: '130017305', regionCode: '44' },
  guadeloupe: { siren: '130020069', regionCode: '01' },
  guyane: { siren: '130020085', regionCode: '03' },
  'hauts de france': { siren: '130017313', regionCode: '32' },
  'ile de france': { siren: '130017321', regionCode: '11' },
  martinique: { siren: '130020077', regionCode: '02' },
  mayotte: { siren: '130020234', regionCode: '06' },
  normandie: { siren: '130017339', regionCode: '28' },
  'nouvelle aquitaine': { siren: '130017347', regionCode: '75' },
  occitanie: { siren: '130017354', regionCode: '76' },
  'pays de la loire': { siren: '130017362', regionCode: '52' },
  'provence alpes cote d azur': { siren: '130017370', regionCode: '93' },
  reunion: { siren: '130020093', regionCode: '04' },
  'la reunion': { siren: '130020093', regionCode: '04' },
}

// Mapping connu des établissements de santé avec leur FINESS/SIREN
const KNOWN_HOSPITALS: Record<string, { finess?: string; siren?: string }> = {
  'chu lyon': { siren: '263100023' }, // Hospices Civils de Lyon
  'chu nantes': { siren: '264400152' },
  'chu niort': { siren: '267900045' }, // CH de Niort
  'centre hospitalier de niort': { siren: '267900045' },
  'ch niort': { siren: '267900045' },
  'ch le vinatier': { siren: '266900163' }, // CH Le Vinatier (psychiatrie)
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

async function searchSirene(query: string, departement?: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      q: query,
      per_page: '5',
    })
    if (departement) {
      params.append('departement', departement)
    }

    const url = `${SIRENE_API}?${params}`
    console.log(`    Recherche SIRENE: ${query}`)

    const response = await fetch(url)
    if (!response.ok) {
      console.log(`    ✗ Erreur SIRENE: ${response.status}`)
      return null
    }

    const data = await response.json()
    const results = data.results || []

    if (results.length === 0) {
      console.log(`    ✗ Aucun résultat SIRENE`)
      return null
    }

    // Chercher une correspondance
    const normalizedQuery = normalizeString(query)

    for (const result of results) {
      const siren = result.siren
      const nom = result.nom_complet || result.nom_raison_sociale || ''
      const normalizedNom = normalizeString(nom)

      // Match si le nom contient la requête ou vice versa
      if (normalizedNom.includes(normalizedQuery) || normalizedQuery.includes(normalizedNom)) {
        console.log(`    ✓ SIRENE trouvé: ${siren} (${nom})`)
        return siren
      }
    }

    // Si pas de match exact, prendre le premier résultat si pertinent
    const firstResult = results[0]
    const firstNom = normalizeString(firstResult.nom_complet || firstResult.nom_raison_sociale || '')

    // Vérifier que c'est une ALEC ou établissement de santé
    if (
      firstNom.includes('alec') ||
      firstNom.includes('energie') ||
      firstNom.includes('climat') ||
      firstNom.includes('hospitalier') ||
      firstNom.includes('hopital') ||
      firstNom.includes('chu')
    ) {
      console.log(`    ✓ SIRENE (premier résultat): ${firstResult.siren} (${firstResult.nom_complet})`)
      return firstResult.siren
    }

    console.log(`    ✗ Pas de match pertinent`)
    return null
  } catch (error) {
    console.log(`    ✗ Erreur: ${error}`)
    return null
  }
}

async function searchFiness(nom: string, departement?: string): Promise<string | null> {
  try {
    // L'API FINESS nécessite un code FINESS, pas une recherche par nom
    // On utilise SIRENE en fallback
    return null
  } catch (error) {
    return null
  }
}

async function main() {
  console.log('=== Peuplement SIREN ALECs et Établissements de Santé ===\n')

  // 1. Récupérer les ALECs sans SIREN
  const alecs = await prisma.structure.findMany({
    where: {
      OR: [{ type: 'ALEC' }, { nom: { contains: 'ALEC', mode: 'insensitive' } }],
      siren: null,
    },
  })

  console.log(`\n=== ALECs (${alecs.length}) ===\n`)

  let updatedAlecs = 0
  for (const alec of alecs) {
    console.log(`[ALEC] ${alec.nom}`)

    const normalizedNom = normalizeString(alec.nom)

    // Vérifier le mapping connu
    if (KNOWN_ALECS[normalizedNom]) {
      const siren = KNOWN_ALECS[normalizedNom]
      if (/^\d{9}$/.test(siren)) {
        try {
          await prisma.structure.update({
            where: { id: alec.id },
            data: { siren },
          })
          console.log(`  ✓ SIREN connu: ${siren}`)
          updatedAlecs++
        } catch (e) {
          console.log(`  ✗ SIREN déjà utilisé`)
        }
        continue
      }
    }

    // Recherche SIRENE pour les vraies ALECs
    if (alec.nom.toLowerCase().includes('alec')) {
      const siren = await searchSirene(alec.nom, alec.departementCode || undefined)
      if (siren) {
        try {
          await prisma.structure.update({
            where: { id: alec.id },
            data: { siren },
          })
          updatedAlecs++
        } catch (e) {
          console.log(`  ✗ SIREN déjà utilisé`)
        }
      }
    } else {
      console.log(`  → Pas une vraie ALEC, skip`)
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  // 2. Récupérer les établissements de santé sans SIREN
  const hospitals = await prisma.structure.findMany({
    where: {
      OR: [
        { nom: { contains: 'CH ', mode: 'insensitive' } },
        { nom: { contains: 'CHU', mode: 'insensitive' } },
        { nom: { contains: 'hopital', mode: 'insensitive' } },
        { nom: { contains: 'hôpital', mode: 'insensitive' } },
        { nom: { contains: 'hospitalier', mode: 'insensitive' } },
      ],
      siren: null,
    },
  })

  console.log(`\n=== Établissements de Santé (${hospitals.length}) ===\n`)

  let updatedHospitals = 0
  for (const hospital of hospitals) {
    console.log(`[Hôpital] ${hospital.nom}`)

    const normalizedNom = normalizeString(hospital.nom)

    // Vérifier le mapping connu
    for (const [key, value] of Object.entries(KNOWN_HOSPITALS)) {
      if (normalizedNom.includes(key) || key.includes(normalizedNom)) {
        if (value.siren) {
          try {
            await prisma.structure.update({
              where: { id: hospital.id },
              data: { siren: value.siren },
            })
            console.log(`  ✓ SIREN connu: ${value.siren}`)
            updatedHospitals++
          } catch (e) {
            console.log(`  ✗ SIREN déjà utilisé`)
          }
          break
        }
      }
    }

    // Recherche SIRENE
    const siren = await searchSirene(hospital.nom, hospital.departementCode || undefined)
    if (siren) {
      try {
        await prisma.structure.update({
          where: { id: hospital.id },
          data: { siren },
        })
        updatedHospitals++
      } catch (e) {
        console.log(`  ✗ SIREN déjà utilisé`)
      }
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  console.log(`\n=== Résultat ===`)
  console.log(`ALECs mis à jour: ${updatedAlecs}/${alecs.length}`)
  console.log(`Hôpitaux mis à jour: ${updatedHospitals}/${hospitals.length}`)

  await prisma.$disconnect()
}

main().catch(console.error)
