/**
 * Import des CAUE et ALEC depuis l'API recherche-entreprises.data.gouv.fr
 *
 * CAUE = Conseil d'Architecture, d'Urbanisme et de l'Environnement (1 par département)
 * ALEC = Agence Locale de l'Énergie et du Climat
 *
 * Ces structures sont des associations (loi 1901) ou SPL, pas des groupements de collectivités.
 * Elles sont importées avec leurs géométries départementales (CAUE) ou à partir du centroïde (ALEC).
 *
 * Usage:
 *   npx tsx scripts/import-caue-alec.ts [--caue] [--alec] [--all]
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const API_BASE = 'https://recherche-entreprises.api.gouv.fr/search'
const PAUSE_MS = parseInt(process.env.PAUSE_MS || '500')

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface ApiResult {
  siren: string
  nom_complet: string
  nom_raison_sociale: string
  sigle?: string
  siege: {
    code_postal: string
    libelle_commune: string
    departement: string
    region: string
    latitude?: string
    longitude?: string
    adresse?: string
  }
  nature_juridique: string
  etat_administratif: string
}

interface ApiResponse {
  results: ApiResult[]
  total_results: number
  page: number
  per_page: number
  total_pages: number
}

async function fetchApi(query: string, page: number = 1): Promise<ApiResponse> {
  const url = `${API_BASE}?q=${encodeURIComponent(query)}&page=${page}&per_page=25`
  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text()
    console.error(`   Response: ${text.substring(0, 200)}`)
    throw new Error(`API error: ${response.status}`)
  }
  return response.json()
}

// Extraire le code département du code postal ou du champ departement
function extractDept(result: ApiResult): string | null {
  if (result.siege.departement) {
    return result.siege.departement.padStart(2, '0')
  }
  if (result.siege.code_postal) {
    const cp = result.siege.code_postal
    if (cp.startsWith('97') || cp.startsWith('98')) {
      return cp.substring(0, 3)
    }
    return cp.substring(0, 2)
  }
  return null
}

// ============================================
// IMPORT CAUE (via SQL brut)
// ============================================
async function importCAUE(): Promise<void> {
  console.log('\n=== Import des CAUE ===')

  const queries = ['CAUE architecture urbanisme', 'conseil architecture urbanisme environnement']

  const allResults = new Map<string, ApiResult>()

  for (const query of queries) {
    let page = 1
    let totalPages = 1

    do {
      console.log(`   Recherche "${query}" - page ${page}...`)
      const response = await fetchApi(query, page)
      totalPages = response.total_pages

      for (const result of response.results) {
        // Filtrer: doit contenir CAUE dans le nom ou sigle
        const nom = result.nom_complet.toUpperCase()
        const sigle = (result.sigle || '').toUpperCase()

        if ((nom.includes('CAUE') || sigle === 'CAUE') && result.etat_administratif === 'A') {
          // Exclure les unions régionales (URCAUE)
          if (!nom.includes('UNION REGIONALE') && !nom.includes('UR CAUE')) {
            allResults.set(result.siren, result)
          }
        }
      }

      page++
      await sleep(PAUSE_MS)
    } while (page <= totalPages && page <= 10) // Max 10 pages
  }

  console.log(`   ${allResults.size} CAUE trouvés`)

  let created = 0
  let updated = 0
  let errors = 0

  for (const result of allResults.values()) {
    const dept = extractDept(result)

    if (!dept) {
      console.warn(`   ⚠️ Pas de département pour ${result.nom_complet}`)
      errors++
      continue
    }

    try {
      // Vérifier si existe déjà
      const existing = await prisma.$queryRaw<Array<{ siren: string; type: string }>>`
        SELECT siren, type::text FROM groupement WHERE siren = ${result.siren}
      `

      if (existing.length > 0) {
        // Mettre à jour le type si nécessaire
        if (existing[0].type !== 'CAUE') {
          await prisma.$executeRaw`
            UPDATE groupement SET type = 'CAUE'::type_groupement WHERE siren = ${result.siren}
          `
          updated++
        }
        continue
      }

      // Créer le CAUE via SQL brut
      await prisma.$executeRaw`
        INSERT INTO groupement (siren, nom, type, nature, code_region, created_at, updated_at)
        VALUES (
          ${result.siren},
          ${result.nom_complet},
          'CAUE'::type_groupement,
          ${'CAUE ' + dept},
          ${result.siege.region || null},
          NOW(),
          NOW()
        )
        ON CONFLICT (siren) DO NOTHING
      `

      // Associer la géométrie du département
      await prisma.$executeRaw`
        UPDATE groupement SET
          geometry = (SELECT geometry FROM departement WHERE code = ${dept}),
          centroid = (SELECT centroid FROM departement WHERE code = ${dept})
        WHERE siren = ${result.siren}
      `

      created++
      console.log(`   ✓ ${result.siren} CAUE ${dept} - ${result.nom_complet.substring(0, 50)}`)
    } catch (e: any) {
      errors++
      console.error(`   ✗ ${result.siren}: ${e.message?.substring(0, 80)}`)
    }
  }

  console.log(`\n   Résultat CAUE: ${created} créés, ${updated} mis à jour, ${errors} erreurs`)
}

// ============================================
// IMPORT ALEC (via SQL brut)
// ============================================

// SIREN des ALEC connues (liste FLAME) à ajouter explicitement
const ALEC_SIRENS_CONNUS = [
  '528007321', // Agence Parisienne du Climat
  '909383911', // ALTERN Rouen Normandie
  '899818827', // Agence du Climat Strasbourg
  '451192579', // ALE du Pays de Fougères
  '409059821', // ADUHME Puy-de-Dôme
  '504861667', // GPSO Energie (Grand Paris Seine Ouest)
  '523804045', // ALEN Nièvre
  '393478300', // Quercy Energies (Lot)
  '882826704', // ALEC Grande Région Grenobloise
  '437521719', // HEOL Morlaix
]

async function importALEC(): Promise<void> {
  console.log('\n=== Import des ALEC ===')

  // Requêtes de recherche élargies
  const queries = [
    'ALEC energie climat',
    'agence locale energie climat',
    'agence locale energie',
    'agence energie climat',
    'ADUHME',
    'agence parisienne climat',
    'ALTERN transition energetique',
    'agence climat strasbourg',
    'ALE pays fougeres',
    'GPSO energie',
    'ALEN nievre',
    'quercy energies',
    'HEOL morlaix',
    'agence energie grenoble',
  ]

  const allResults = new Map<string, ApiResult>()

  for (const query of queries) {
    let page = 1
    let totalPages = 1

    do {
      console.log(`   Recherche "${query}" - page ${page}...`)
      const response = await fetchApi(query, page)
      totalPages = response.total_pages

      for (const result of response.results) {
        const nom = result.nom_complet.toUpperCase()
        const sigle = (result.sigle || '').toUpperCase()

        // Critères élargis pour identifier les ALEC
        const isALEC =
          nom.includes('ALEC') ||
          sigle.includes('ALEC') ||
          (nom.includes('AGENCE') && nom.includes('ENERGIE') && nom.includes('CLIMAT')) ||
          (nom.includes('AGENCE LOCALE') && nom.includes('ENERGIE')) ||
          nom.includes('ADUHME') ||
          nom.includes('ALEN ') ||
          nom.includes('ALOEN') ||
          nom.includes('HEOL') ||
          (nom.includes('QUERCY') && nom.includes('ENERGIE')) ||
          (nom.includes('GPSO') && nom.includes('ENERGIE')) ||
          nom.includes('TRANSITION ENERGETIQUE ROUEN') ||
          nom.includes('GUICHET DES SOLUTIONS') ||
          // Ajouter explicitement par SIREN connu
          ALEC_SIRENS_CONNUS.includes(result.siren)

        if (isALEC && result.etat_administratif === 'A') {
          // Exclure les réseaux/fédérations et faux positifs
          const exclude =
            nom.includes('RESEAU') ||
            nom.includes('FEDERATION') ||
            nom.includes('BREIZH ALEC') ||
            nom.includes('ENERCOOP') ||
            nom.includes('EIFFAGE') ||
            nom.includes('ENGIE') ||
            nom.includes('EDF ')

          if (!exclude) {
            allResults.set(result.siren, result)
          }
        }
      }

      page++
      await sleep(PAUSE_MS)
    } while (page <= totalPages && page <= 5) // Limiter à 5 pages par requête
  }

  // Ajouter les ALEC connues par SIREN direct si pas déjà trouvées
  console.log('\n   Vérification des ALEC connues par SIREN...')
  for (const siren of ALEC_SIRENS_CONNUS) {
    if (!allResults.has(siren)) {
      try {
        const response = await fetchApi(siren, 1)
        if (response.results.length > 0 && response.results[0].etat_administratif === 'A') {
          allResults.set(siren, response.results[0])
          console.log(`   + Ajout ${siren}: ${response.results[0].nom_complet.substring(0, 50)}`)
        }
        await sleep(PAUSE_MS)
      } catch (e) {
        console.warn(`   ⚠️ SIREN ${siren} non trouvé`)
      }
    }
  }

  console.log(`\n   ${allResults.size} ALEC trouvés au total`)

  let created = 0
  let updated = 0
  let errors = 0

  for (const result of allResults.values()) {
    const dept = extractDept(result)
    const lat = result.siege.latitude ? parseFloat(result.siege.latitude) : null
    const lon = result.siege.longitude ? parseFloat(result.siege.longitude) : null

    try {
      // Vérifier si existe déjà
      const existing = await prisma.$queryRaw<Array<{ siren: string; type: string }>>`
        SELECT siren, type::text FROM groupement WHERE siren = ${result.siren}
      `

      if (existing.length > 0) {
        if (existing[0].type !== 'ALEC') {
          await prisma.$executeRaw`
            UPDATE groupement SET type = 'ALEC'::type_groupement WHERE siren = ${result.siren}
          `
          updated++
        }
        continue
      }

      // Créer l'ALEC via SQL brut
      await prisma.$executeRaw`
        INSERT INTO groupement (siren, nom, type, nature, code_region, created_at, updated_at)
        VALUES (
          ${result.siren},
          ${result.nom_complet},
          'ALEC'::type_groupement,
          ${'ALEC ' + (dept || '')},
          ${result.siege.region || null},
          NOW(),
          NOW()
        )
        ON CONFLICT (siren) DO NOTHING
      `

      // Ajouter le centroïde si coordonnées disponibles
      if (lat && lon) {
        await prisma.$executeRaw`
          UPDATE groupement SET
            centroid = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
          WHERE siren = ${result.siren}
        `
      }

      created++
      console.log(`   ✓ ${result.siren} ALEC ${dept || '??'} - ${result.nom_complet.substring(0, 50)}`)
    } catch (e: any) {
      errors++
      console.error(`   ✗ ${result.siren}: ${e.message?.substring(0, 80)}`)
    }
  }

  console.log(`\n   Résultat ALEC: ${created} créés, ${updated} mis à jour, ${errors} erreurs`)
}

// ============================================
// STATS FINALES
// ============================================
async function showStats(): Promise<void> {
  console.log('\n=== Statistiques finales ===')

  const stats = await prisma.$queryRaw<Array<{ type: string; total: bigint; with_geom: bigint }>>`
    SELECT
      type::text,
      COUNT(*) as total,
      COUNT(geometry) as with_geom
    FROM groupement
    WHERE type::text IN ('CAUE', 'ALEC')
    GROUP BY type
    ORDER BY type
  `

  for (const s of stats) {
    console.log(`   ${s.type}: ${s.total} total, ${s.with_geom} avec géométrie`)
  }

  // Stats globales
  const global = await prisma.$queryRaw<Array<{ type: string; total: bigint; with_geom: bigint }>>`
    SELECT
      type::text,
      COUNT(*) as total,
      COUNT(geometry) as with_geom
    FROM groupement
    GROUP BY type
    ORDER BY total DESC
  `

  console.log('\n   === Tous les groupements ===')
  for (const s of global) {
    const pct = s.total > 0 ? ((Number(s.with_geom) / Number(s.total)) * 100).toFixed(0) : 0
    console.log(
      `   ${s.type.padEnd(15)}: ${String(s.total).padStart(5)} total, ${String(s.with_geom).padStart(5)} geom (${pct}%)`
    )
  }
}

// ============================================
// MAIN
// ============================================
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const runAll = args.includes('--all') || args.length === 0

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║   Import CAUE & ALEC depuis recherche-entreprises  ║')
  console.log('╚════════════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    if (runAll || args.includes('--caue')) {
      await importCAUE()
    }

    if (runAll || args.includes('--alec')) {
      await importALEC()
    }

    await showStats()

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\n✅ Terminé en ${duration}s`)
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
