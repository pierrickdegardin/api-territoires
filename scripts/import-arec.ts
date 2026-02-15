/**
 * Import et migration des AREC (Agences Régionales de l'Énergie et du Climat)
 *
 * Les AREC sont distinctes des ALEC par leur périmètre régional.
 * Réseau RARE (Réseau des Agences Régionales de l'Énergie et de l'Environnement)
 *
 * Ce script:
 * 1. Migre les ALEC à périmètre régional vers le type AREC
 * 2. Importe les AREC manquantes depuis l'API recherche-entreprises
 * 3. Assigne les géométries régionales
 *
 * Usage:
 *   npx tsx scripts/import-arec.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const API_BASE = 'https://recherche-entreprises.api.gouv.fr/search'
const PAUSE_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// AREC connues avec leur région
// Source: Réseau RARE (rare.fr)
const AREC_CONNUES: Array<{
  siren: string
  nom: string
  region: string // Code région INSEE
  regionNom: string
}> = [
  // AREC principales
  {
    siren: '314538513',
    nom: 'AURA-EE (Auvergne-Rhône-Alpes Énergie Environnement)',
    region: '84',
    regionNom: 'Auvergne-Rhône-Alpes',
  },
  {
    siren: '884822982',
    nom: 'ARTE (Agence Régionale de la Transition Énergétique)',
    region: '44',
    regionNom: 'Grand Est',
  },
  { siren: '809415243', nom: 'AREC Occitanie (SPL)', region: '76', regionNom: 'Occitanie' },
  { siren: '352158828', nom: 'AREC Occitanie (SEM)', region: '76', regionNom: 'Occitanie' },
  { siren: '939974812', nom: 'AREC Centre-Val de Loire (SEM)', region: '24', regionNom: 'Centre-Val de Loire' },
  { siren: '924429996', nom: 'AREC Centre-Val de Loire', region: '24', regionNom: 'Centre-Val de Loire' },
  { siren: '795064658', nom: 'Énergies Réunion (SPL Horizon Réunion)', region: '04', regionNom: 'La Réunion' },

  // Autres agences régionales membres du RARE
  { siren: '393708870', nom: 'ALTERRE Bourgogne-Franche-Comté', region: '27', regionNom: 'Bourgogne-Franche-Comté' },
  { siren: '383743317', nom: 'Biomasse Normandie', region: '28', regionNom: 'Normandie' },
  {
    siren: '130002249',
    nom: 'CERDD (Centre Ressource du Développement Durable)',
    region: '32',
    regionNom: 'Hauts-de-France',
  },
  { siren: '503687592', nom: 'Synergîle', region: '01', regionNom: 'Guadeloupe' },
  { siren: '130003254', nom: "OEB (Observatoire de l'Environnement en Bretagne)", region: '53', regionNom: 'Bretagne' },
]

// SIREN des ALEC actuelles qui sont en fait des AREC (périmètre régional)
const ALEC_TO_MIGRATE_TO_AREC = [
  '809415243', // AREC Occitanie SPL
  '352158828', // AREC Occitanie SEM
  '939974812', // AREC Centre-Val de Loire SEM
  '924429996', // AREC Centre-Val de Loire
  '795064658', // Énergies Réunion
]

interface ApiResult {
  siren: string
  nom_complet: string
  siege: {
    region: string
    latitude?: string
    longitude?: string
  }
  etat_administratif: string
}

async function fetchBySiren(siren: string): Promise<ApiResult | null> {
  const url = `${API_BASE}?q=${siren}&per_page=5`
  const response = await fetch(url)
  if (!response.ok) return null

  const data = await response.json()
  const result = data.results?.find((r: ApiResult) => r.siren === siren && r.etat_administratif === 'A')
  return result || null
}

async function migrateAlecToArec(dryRun: boolean): Promise<void> {
  console.log('\n=== Migration ALEC → AREC ===')

  let migrated = 0

  for (const siren of ALEC_TO_MIGRATE_TO_AREC) {
    const existing = await prisma.$queryRaw<Array<{ siren: string; nom: string; type: string }>>`
      SELECT siren, nom, type::text FROM groupement WHERE siren = ${siren}
    `

    if (existing.length === 0) {
      console.log(`   ⚠️ ${siren} non trouvé en base`)
      continue
    }

    if (existing[0].type === 'AREC') {
      console.log(`   ✓ ${siren} déjà AREC`)
      continue
    }

    console.log(`   ${siren}: ${existing[0].nom.substring(0, 50)}`)
    console.log(`     ${existing[0].type} → AREC`)

    if (!dryRun) {
      await prisma.$executeRaw`
        UPDATE groupement
        SET type = 'AREC'::type_groupement, updated_at = NOW()
        WHERE siren = ${siren}
      `
      migrated++
    }
  }

  console.log(`\n   ${dryRun ? 'À migrer' : 'Migrés'}: ${migrated}`)
}

async function importArec(dryRun: boolean): Promise<void> {
  console.log('\n=== Import des AREC ===')

  let created = 0
  let updated = 0
  let errors = 0

  for (const arec of AREC_CONNUES) {
    // Vérifier si déjà en base
    const existing = await prisma.$queryRaw<Array<{ siren: string; type: string }>>`
      SELECT siren, type::text FROM groupement WHERE siren = ${arec.siren}
    `

    if (existing.length > 0) {
      if (existing[0].type !== 'AREC') {
        console.log(`   ${arec.siren}: ${arec.nom.substring(0, 45)}`)
        console.log(`     Type actuel: ${existing[0].type} → AREC`)

        if (!dryRun) {
          await prisma.$executeRaw`
            UPDATE groupement
            SET type = 'AREC'::type_groupement, updated_at = NOW()
            WHERE siren = ${arec.siren}
          `
          updated++
        }
      } else {
        console.log(`   ✓ ${arec.siren} déjà AREC: ${arec.nom.substring(0, 40)}`)
      }
      continue
    }

    // Récupérer les infos depuis l'API
    console.log(`   Recherche ${arec.siren}...`)
    const apiResult = await fetchBySiren(arec.siren)
    await sleep(PAUSE_MS)

    if (!apiResult) {
      console.warn(`   ⚠️ ${arec.siren} non trouvé dans l'API`)
      errors++
      continue
    }

    console.log(`   + ${arec.siren}: ${apiResult.nom_complet.substring(0, 50)}`)

    if (dryRun) {
      created++
      continue
    }

    try {
      // Créer l'AREC
      await prisma.$executeRaw`
        INSERT INTO groupement (siren, nom, type, nature, code_region, created_at, updated_at)
        VALUES (
          ${arec.siren},
          ${apiResult.nom_complet},
          'AREC'::type_groupement,
          ${'AREC ' + arec.regionNom},
          ${arec.region},
          NOW(),
          NOW()
        )
        ON CONFLICT (siren) DO UPDATE SET
          type = 'AREC'::type_groupement,
          updated_at = NOW()
      `
      created++
    } catch (e: any) {
      console.error(`   ✗ Erreur: ${e.message?.substring(0, 60)}`)
      errors++
    }
  }

  console.log(`\n   Résultat: ${created} créés, ${updated} mis à jour, ${errors} erreurs`)
}

async function assignRegionGeometries(dryRun: boolean): Promise<void> {
  console.log('\n=== Attribution des géométries régionales ===')

  // Récupérer toutes les AREC sans géométrie
  const arecs = await prisma.$queryRaw<
    Array<{
      siren: string
      nom: string
      code_region: string | null
      has_geom: boolean
    }>
  >`
    SELECT siren, nom, code_region, geometry IS NOT NULL as has_geom
    FROM groupement
    WHERE type = 'AREC'
    ORDER BY nom
  `

  console.log(`   ${arecs.length} AREC trouvées`)

  let updated = 0

  for (const arec of arecs) {
    if (arec.has_geom) {
      console.log(`   ✓ ${arec.nom.substring(0, 50)} - déjà avec géométrie`)
      continue
    }

    if (!arec.code_region) {
      // Chercher le code région dans notre mapping
      const mapping = AREC_CONNUES.find((a) => a.siren === arec.siren)
      if (mapping) {
        arec.code_region = mapping.region
      } else {
        console.log(`   ⚠️ ${arec.nom.substring(0, 50)} - pas de code région`)
        continue
      }
    }

    console.log(`   ${arec.nom.substring(0, 50)}`)
    console.log(`     → Région ${arec.code_region}`)

    if (dryRun) {
      updated++
      continue
    }

    try {
      await prisma.$executeRaw`
        UPDATE groupement SET
          geometry = (SELECT geometry FROM region WHERE code = ${arec.code_region}),
          centroid = (SELECT centroid FROM region WHERE code = ${arec.code_region}),
          code_region = ${arec.code_region},
          updated_at = NOW()
        WHERE siren = ${arec.siren}
      `
      updated++
      console.log(`     ✅ Géométrie assignée`)
    } catch (e: any) {
      console.error(`     ✗ Erreur: ${e.message?.substring(0, 60)}`)
    }
  }

  console.log(`\n   ${updated} géométries ${dryRun ? 'à assigner' : 'assignées'}`)
}

async function showStats(): Promise<void> {
  console.log('\n=== Statistiques ===')

  const stats = await prisma.$queryRaw<
    Array<{
      type: string
      total: bigint
      with_geom: bigint
    }>
  >`
    SELECT
      type::text,
      COUNT(*) as total,
      COUNT(geometry) as with_geom
    FROM groupement
    WHERE type::text IN ('ALEC', 'AREC')
    GROUP BY type
    ORDER BY type
  `

  for (const s of stats) {
    const pct = s.total > 0 ? ((Number(s.with_geom) / Number(s.total)) * 100).toFixed(0) : 0
    console.log(`   ${s.type}: ${s.total} total, ${s.with_geom} avec géométrie (${pct}%)`)
  }

  // Détail AREC par région
  const arecByRegion = await prisma.$queryRaw<
    Array<{
      code_region: string
      region_nom: string
      count: bigint
    }>
  >`
    SELECT
      g.code_region,
      COALESCE(r.nom, 'Sans région') as region_nom,
      COUNT(*) as count
    FROM groupement g
    LEFT JOIN region r ON g.code_region = r.code
    WHERE g.type = 'AREC'
    GROUP BY g.code_region, r.nom
    ORDER BY count DESC
  `

  console.log('\n   AREC par région:')
  for (const r of arecByRegion) {
    console.log(`     ${r.region_nom}: ${r.count}`)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║   Import AREC (Agences Régionales Énergie Climat)  ║')
  console.log('║   Source: Réseau RARE                              ║')
  console.log('╚════════════════════════════════════════════════════╝')

  if (dryRun) {
    console.log('\n   🔍 Mode --dry-run: simulation uniquement')
  }

  const startTime = Date.now()

  try {
    await migrateAlecToArec(dryRun)
    await importArec(dryRun)
    await assignRegionGeometries(dryRun)
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
