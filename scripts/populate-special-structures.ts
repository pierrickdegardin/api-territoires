/**
 * Script pour peupler les SIREN/codes des structures spéciales:
 * - ALECs via API SIRENE
 * - Hôpitaux via API SIRENE
 * - ARS via mapping connu (périmètre régional)
 * - PNR et PETR via API Territoires (BANATIC)
 *
 * Usage: npx tsx scripts/populate-special-structures.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SIRENE_API = 'https://recherche-entreprises.api.gouv.fr/search'
const API_TERRITOIRES = 'http://localhost:3020/api/v1/territoires'

// =============================================================================
// MAPPINGS CONNUS
// =============================================================================

// ALECs avec leur SIREN
const KNOWN_ALECS: Record<string, string> = {
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

// ARS avec leur SIREN et code région
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
  paca: { siren: '130017370', regionCode: '93' },
  reunion: { siren: '130020093', regionCode: '04' },
  'la reunion': { siren: '130020093', regionCode: '04' },
}

// Hôpitaux avec leur SIREN
const KNOWN_HOSPITALS: Record<string, string> = {
  'hospices civils de lyon': '263100023',
  'chu lyon': '263100023',
  'chu nantes': '264400152',
  'chu niort': '267900045',
  'ch niort': '267900045',
  'centre hospitalier de niort': '267900045',
  'ch le vinatier': '266900163',
  'chu bordeaux': '263300035',
  'chu toulouse': '263100056',
  'chu montpellier': '263400041',
  'chu marseille': '261300024', // AP-HM
  'ap hm': '261300024',
  aphm: '261300024',
  'chu strasbourg': '266700049',
  'chu lille': '265900045',
  'chu rennes': '263500024',
  'chu nancy': '265400038',
  'chu grenoble': '263800028',
  'chu clermont ferrand': '266300016',
  'chu saint etienne': '264200029',
  'chu angers': '264900031',
  'chu tours': '263700020',
  'chu dijon': '262100030',
  'chu reims': '265100034',
  'chu amiens': '268000023',
  'chu rouen': '267600025',
  'chu caen': '261400022',
  'chu poitiers': '268600020',
  'chu limoges': '268700028',
  'chu brest': '262900017',
  'chu nimes': '263000015',
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

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

    const response = await fetch(`${SIRENE_API}?${params}`)
    if (!response.ok) return null

    const data = await response.json()
    const results = data.results || []
    if (results.length === 0) return null

    const normalizedQuery = normalizeString(query)

    for (const result of results) {
      const nom = normalizeString(result.nom_complet || result.nom_raison_sociale || '')
      if (nom.includes(normalizedQuery) || normalizedQuery.includes(nom)) {
        return result.siren
      }
    }

    // Premier résultat si pertinent
    const first = results[0]
    const firstName = normalizeString(first.nom_complet || first.nom_raison_sociale || '')
    if (
      firstName.includes('alec') ||
      firstName.includes('energie') ||
      firstName.includes('climat') ||
      firstName.includes('hospitalier') ||
      firstName.includes('hopital') ||
      firstName.includes('chu') ||
      firstName.includes('centre hospitalier')
    ) {
      return first.siren
    }

    return null
  } catch (error) {
    return null
  }
}

async function searchTerritoires(query: string, type?: string): Promise<{ siren: string; nom: string } | null> {
  try {
    const params = new URLSearchParams({ q: query, limit: '10' })
    if (type) params.append('type', type)

    const response = await fetch(`${API_TERRITOIRES}/search?${params}`)
    if (!response.ok) return null

    const data = await response.json()
    const results = data.results || []
    if (results.length === 0) return null

    const normalizedQuery = normalizeString(query)

    for (const result of results) {
      const nom = normalizeString(result.nom || '')
      if (nom.includes(normalizedQuery) || normalizedQuery.includes(nom)) {
        if (result.siren || result.code) {
          return { siren: result.siren || result.code, nom: result.nom }
        }
      }
    }

    return null
  } catch (error) {
    return null
  }
}

// =============================================================================
// FONCTIONS DE MISE À JOUR
// =============================================================================

async function updateALECs() {
  console.log('\n=== ALECs ===\n')

  const alecs = await prisma.structure.findMany({
    where: {
      OR: [{ type: 'ALEC' }, { nom: { contains: 'ALEC', mode: 'insensitive' } }],
      siren: null,
    },
  })

  let updated = 0
  for (const alec of alecs) {
    // Ne traiter que les vraies ALECs
    if (!alec.nom.toLowerCase().includes('alec')) {
      continue
    }

    console.log(`[ALEC] ${alec.nom}`)

    const normalizedNom = normalizeString(alec.nom)

    // Vérifier mapping connu
    let siren: string | null = null
    for (const [key, value] of Object.entries(KNOWN_ALECS)) {
      if (normalizedNom.includes(key) || key.includes(normalizedNom)) {
        siren = value
        break
      }
    }

    // Sinon recherche SIRENE
    if (!siren) {
      siren = await searchSirene(alec.nom, alec.departementCode || undefined)
    }

    if (siren && /^\d{9}$/.test(siren)) {
      try {
        await prisma.structure.update({
          where: { id: alec.id },
          data: { siren },
        })
        console.log(`  ✓ SIREN: ${siren}`)
        updated++
      } catch (e) {
        console.log(`  ✗ SIREN déjà utilisé`)
      }
    } else {
      console.log(`  ✗ Non trouvé`)
    }

    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`\nALECs mis à jour: ${updated}`)
  return updated
}

async function updateARS() {
  console.log('\n=== ARS (Agences Régionales de Santé) ===\n')

  const arsStructures = await prisma.structure.findMany({
    where: {
      OR: [
        { nom: { contains: 'ARS', mode: 'insensitive' } },
        { nom: { contains: 'Agence Régionale de Santé', mode: 'insensitive' } },
        { nom: { contains: 'Agence Regionale de Sante', mode: 'insensitive' } },
      ],
      siren: null,
    },
  })

  let updated = 0
  for (const ars of arsStructures) {
    console.log(`[ARS] ${ars.nom}`)

    const normalizedNom = normalizeString(ars.nom)

    // Chercher dans les ARS connues
    let found = false
    for (const [key, value] of Object.entries(KNOWN_ARS)) {
      if (normalizedNom.includes(key)) {
        try {
          await prisma.structure.update({
            where: { id: ars.id },
            data: {
              siren: value.siren,
              regionCode: value.regionCode,
            },
          })
          console.log(`  ✓ SIREN: ${value.siren}, Région: ${value.regionCode}`)
          updated++
          found = true
        } catch (e) {
          console.log(`  ✗ SIREN déjà utilisé`)
        }
        break
      }
    }

    if (!found) {
      console.log(`  ✗ Région non identifiée`)
    }
  }

  console.log(`\nARS mis à jour: ${updated}`)
  return updated
}

async function updateHospitals() {
  console.log('\n=== Établissements de Santé ===\n')

  const hospitals = await prisma.structure.findMany({
    where: {
      OR: [
        { nom: { startsWith: 'CH ', mode: 'insensitive' } },
        { nom: { contains: 'CHU', mode: 'insensitive' } },
        { nom: { contains: 'hopital', mode: 'insensitive' } },
        { nom: { contains: 'hôpital', mode: 'insensitive' } },
        { nom: { contains: 'hospitalier', mode: 'insensitive' } },
        { nom: { contains: 'CENTRE HOSPITALIER', mode: 'insensitive' } },
      ],
      siren: null,
    },
  })

  let updated = 0
  for (const hospital of hospitals) {
    console.log(`[Hôpital] ${hospital.nom}`)

    const normalizedNom = normalizeString(hospital.nom)

    // Vérifier mapping connu
    let siren: string | null = null
    for (const [key, value] of Object.entries(KNOWN_HOSPITALS)) {
      if (normalizedNom.includes(key) || key.includes(normalizedNom)) {
        siren = value
        break
      }
    }

    // Sinon recherche SIRENE
    if (!siren) {
      siren = await searchSirene(hospital.nom, hospital.departementCode || undefined)
    }

    if (siren && /^\d{9}$/.test(siren)) {
      try {
        await prisma.structure.update({
          where: { id: hospital.id },
          data: { siren },
        })
        console.log(`  ✓ SIREN: ${siren}`)
        updated++
      } catch (e) {
        console.log(`  ✗ SIREN déjà utilisé`)
      }
    } else {
      console.log(`  ✗ Non trouvé`)
    }

    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`\nHôpitaux mis à jour: ${updated}`)
  return updated
}

async function updatePNRandPETR() {
  console.log('\n=== PNR et PETR ===\n')

  const structures = await prisma.structure.findMany({
    where: {
      OR: [
        { nom: { contains: 'PNR', mode: 'insensitive' } },
        { nom: { contains: 'Parc Naturel', mode: 'insensitive' } },
        { nom: { contains: 'PETR', mode: 'insensitive' } },
        { nom: { contains: "Pôle d'Équilibre", mode: 'insensitive' } },
        { nom: { contains: "Pole d'Equilibre", mode: 'insensitive' } },
        { nom: { contains: 'Pays ', mode: 'insensitive' } },
      ],
      siren: null,
    },
  })

  let updated = 0
  for (const structure of structures) {
    console.log(`[PNR/PETR] ${structure.nom}`)

    // Recherche dans API Territoires (BANATIC)
    const result = await searchTerritoires(structure.nom, 'groupement')

    if (result && /^\d{9}$/.test(result.siren)) {
      try {
        await prisma.structure.update({
          where: { id: structure.id },
          data: { siren: result.siren },
        })
        console.log(`  ✓ SIREN: ${result.siren} (${result.nom})`)
        updated++
      } catch (e) {
        console.log(`  ✗ SIREN déjà utilisé`)
      }
    } else {
      // Fallback SIRENE
      const siren = await searchSirene(structure.nom, structure.departementCode || undefined)
      if (siren) {
        try {
          await prisma.structure.update({
            where: { id: structure.id },
            data: { siren },
          })
          console.log(`  ✓ SIREN (SIRENE): ${siren}`)
          updated++
        } catch (e) {
          console.log(`  ✗ SIREN déjà utilisé`)
        }
      } else {
        console.log(`  ✗ Non trouvé`)
      }
    }

    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`\nPNR/PETR mis à jour: ${updated}`)
  return updated
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('=== Peuplement SIREN structures spéciales ===')
  console.log('ALECs, ARS, Hôpitaux, PNR, PETR\n')

  const results = {
    alecs: await updateALECs(),
    ars: await updateARS(),
    hospitals: await updateHospitals(),
    pnrPetr: await updatePNRandPETR(),
  }

  console.log('\n=== RÉSUMÉ ===')
  console.log(`ALECs: ${results.alecs}`)
  console.log(`ARS: ${results.ars}`)
  console.log(`Hôpitaux: ${results.hospitals}`)
  console.log(`PNR/PETR: ${results.pnrPetr}`)
  console.log(`Total: ${Object.values(results).reduce((a, b) => a + b, 0)}`)

  await prisma.$disconnect()
}

main().catch(console.error)
