/**
 * Assigne les géométries aux ALEC en fonction de leur périmètre géographique
 *
 * Les ALEC ont un périmètre souvent indiqué dans leur nom:
 * - Département: "ALEC de l'Ain", "ALEC du Cher"
 * - Métropole: "ALEC Grand Lyon", "ALEC Marseille Métropole"
 * - EPCI: "ALEC Plaine Commune", "ALEC Pays de Brest"
 *
 * Usage:
 *   npx tsx scripts/assign-alec-geometry.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Mapping manuel ALEC -> entité géographique
// Format: siren ALEC -> { type: 'dept'|'epci'|'syndicat'|'region', code: string }
const ALEC_MAPPING: Record<string, { type: 'dept' | 'epci' | 'syndicat' | 'region'; code: string; nom: string }> = {
  // ============================================
  // ALEC DÉPARTEMENTALES (périmètre = département entier)
  // ============================================
  '334625845': { type: 'dept', code: '01', nom: 'Ain' },
  '904650181': { type: 'dept', code: '01', nom: 'Ain (SPL)' },
  '401232061': { type: 'dept', code: '07', nom: 'Ardèche' },
  '440519999': { type: 'dept', code: '08', nom: 'Ardennes' },
  '518538699': { type: 'dept', code: '09', nom: 'Ariège' },
  '799345210': { type: 'dept', code: '18', nom: 'Cher' },
  '844264424': { type: 'dept', code: '26', nom: 'Drôme' },
  '442973475': { type: 'dept', code: '27', nom: 'Eure' },
  '480536028': { type: 'dept', code: '42', nom: 'Loire' },
  '393478300': { type: 'dept', code: '46', nom: 'Lot (Quercy Energies)' },
  '538140583': { type: 'dept', code: '48', nom: 'Lozère' },
  '523804045': { type: 'dept', code: '58', nom: 'Nièvre' },
  '409059821': { type: 'dept', code: '63', nom: 'Puy-de-Dôme (ADUHME)' },
  '434702783': { type: 'dept', code: '78', nom: 'Yvelines' },
  '403376114': { type: 'dept', code: '06', nom: 'Alpes-Maritimes (ALEPCA)' },
  '835040940': { type: 'dept', code: '82', nom: 'Tarn-et-Garonne (Midi Quercy)' },
  '795064658': { type: 'dept', code: '974', nom: 'La Réunion' },

  // ============================================
  // ALEC RÉGIONALES (AREC - périmètre = région)
  // ============================================
  '809415243': { type: 'region', code: '76', nom: 'Occitanie (SPL AREC)' },
  '352158828': { type: 'region', code: '76', nom: 'Occitanie (SEM AREC)' },
  '939974812': { type: 'region', code: '24', nom: 'Centre-Val de Loire (SEM AREC)' },
  '924429996': { type: 'region', code: '24', nom: 'Centre-Val de Loire (AREC)' },

  // ============================================
  // MÉTROPOLES / GRANDES AGGLOS (EPCI)
  // ============================================
  '429626237': { type: 'epci', code: '200046977', nom: 'Métropole de Lyon' },
  '789376548': { type: 'epci', code: '200054807', nom: 'Métropole Aix-Marseille-Provence' },
  '502085426': { type: 'epci', code: '243400017', nom: 'Montpellier Méditerranée Métropole' },
  '794996710': { type: 'epci', code: '244900015', nom: 'CU Angers Loire Métropole' },
  '500313374': { type: 'epci', code: '245400676', nom: 'Métropole du Grand Nancy' },
  '533732392': { type: 'epci', code: '200039865', nom: 'Metz Métropole' },
  '899818827': { type: 'epci', code: '246700488', nom: 'Eurométropole de Strasbourg' },
  '909383911': { type: 'epci', code: '200023414', nom: 'Métropole Rouen Normandie' },
  '882826704': { type: 'epci', code: '200040715', nom: 'Grenoble-Alpes-Métropole' },
  '411429574': { type: 'epci', code: '243500139', nom: 'Rennes Métropole' },

  // ============================================
  // EPT ÎLE-DE-FRANCE
  // ============================================
  '753180363': { type: 'epci', code: '200057867', nom: 'EPT Plaine Commune' },
  '842617011': { type: 'epci', code: '200057982', nom: 'EPT Paris Ouest La Défense' },
  '751534199': { type: 'epci', code: '200058014', nom: 'EPT Grand-Orly Seine Bièvre' },
  '808750095': { type: 'epci', code: '200058097', nom: "EPT Paris Terres d'Envol" },
  '504861667': { type: 'epci', code: '200057974', nom: 'EPT Grand Paris Seine Ouest' },
  '528007321': { type: 'dept', code: '75', nom: 'Paris (Agence Parisienne du Climat)' },

  // ============================================
  // PAYS / EPCI MOYENS
  // ============================================
  '523191393': { type: 'epci', code: '200069409', nom: 'CA Saint-Brieuc Armor Agglomération' },
  '418485231': { type: 'epci', code: '242900314', nom: 'Brest Métropole' },
  '422916213': { type: 'epci', code: '242900744', nom: 'CC Poher Communauté (Centre Ouest Bretagne)' },
  '484384318': { type: 'epci', code: '200042174', nom: 'CA Lorient Agglomération (Bretagne Sud)' },
  '437521719': { type: 'epci', code: '242900835', nom: 'CA Morlaix Communauté' },
  '920873957': { type: 'epci', code: '242900835', nom: 'CA Morlaix Communauté (Ker Heol)' },
  '451192579': { type: 'epci', code: '200070688', nom: 'CC Couesnon Marches de Bretagne (Fougères)' },
  '497914713': { type: 'epci', code: '243100633', nom: 'CA du Sicoval (Sud-Est Toulousain)' },

  // ============================================
  // GIRONDE / ESSONNE / AISNE
  // ============================================
  '495009441': { type: 'epci', code: '243300316', nom: 'Bordeaux Métropole' },
  '527977888': { type: 'epci', code: '200057859', nom: "CA Coeur d'Essonne Agglomération" },
  '838110922': { type: 'epci', code: '200072031', nom: 'CA de la Région de Château-Thierry' },

  // ============================================
  // SYNDICATS MIXTES
  // ============================================
  '434748521': { type: 'syndicat', code: '253514707', nom: 'SM des Vallons de Vilaine' },
}

async function assignAlecGeometries(dryRun: boolean): Promise<void> {
  console.log('\n=== Attribution des géométries aux ALEC ===')

  // Récupérer toutes les ALEC
  const alecs = await prisma.$queryRaw<
    Array<{
      siren: string
      nom: string
      has_geom: boolean
    }>
  >`
    SELECT siren, nom, geometry IS NOT NULL as has_geom
    FROM groupement
    WHERE type = 'ALEC'
    ORDER BY nom
  `

  console.log(`   ${alecs.length} ALEC trouvées`)

  let updated = 0
  let skipped = 0
  let notMapped = 0
  const unmapped: string[] = []

  for (const alec of alecs) {
    const mapping = ALEC_MAPPING[alec.siren]

    if (!mapping) {
      notMapped++
      unmapped.push(`${alec.siren}: ${alec.nom}`)
      continue
    }

    if (alec.has_geom) {
      skipped++
      continue
    }

    console.log(`\n   ${alec.nom.substring(0, 60)}`)
    console.log(`   → ${mapping.type.toUpperCase()} ${mapping.code}: ${mapping.nom}`)

    if (dryRun) {
      updated++
      continue
    }

    try {
      if (mapping.type === 'dept') {
        // Géométrie du département
        await prisma.$executeRaw`
          UPDATE groupement SET
            geometry = (SELECT geometry FROM departement WHERE code = ${mapping.code}),
            centroid = (SELECT centroid FROM departement WHERE code = ${mapping.code}),
            updated_at = NOW()
          WHERE siren = ${alec.siren}
        `
      } else if (mapping.type === 'region') {
        // Géométrie de la région
        await prisma.$executeRaw`
          UPDATE groupement SET
            geometry = (SELECT geometry FROM region WHERE code = ${mapping.code}),
            centroid = (SELECT centroid FROM region WHERE code = ${mapping.code}),
            updated_at = NOW()
          WHERE siren = ${alec.siren}
        `
      } else if (mapping.type === 'epci' || mapping.type === 'syndicat') {
        // Géométrie de l'EPCI ou du syndicat
        await prisma.$executeRaw`
          UPDATE groupement SET
            geometry = (SELECT geometry FROM groupement WHERE siren = ${mapping.code}),
            centroid = (SELECT centroid FROM groupement WHERE siren = ${mapping.code}),
            updated_at = NOW()
          WHERE siren = ${alec.siren}
        `
      }

      updated++
      console.log(`   ✅ Géométrie assignée`)
    } catch (e: any) {
      console.error(`   ❌ Erreur: ${e.message?.substring(0, 60)}`)
    }
  }

  console.log(`\n=== Résultat ===`)
  console.log(`   ${updated} géométries ${dryRun ? 'à assigner' : 'assignées'}`)
  console.log(`   ${skipped} déjà avec géométrie`)
  console.log(`   ${notMapped} non mappées`)

  if (unmapped.length > 0) {
    console.log(`\n   ALEC non mappées (à ajouter manuellement):`)
    for (const u of unmapped) {
      console.log(`     ${u}`)
    }
  }
}

async function showStats(): Promise<void> {
  console.log('\n=== Statistiques ALEC ===')

  const stats = await prisma.$queryRaw<
    Array<{
      total: bigint
      with_geom: bigint
      with_centroid: bigint
    }>
  >`
    SELECT
      COUNT(*) as total,
      COUNT(geometry) as with_geom,
      COUNT(centroid) as with_centroid
    FROM groupement
    WHERE type = 'ALEC'
  `

  const s = stats[0]
  console.log(`   Total: ${s.total}`)
  console.log(`   Avec géométrie: ${s.with_geom} (${((Number(s.with_geom) / Number(s.total)) * 100).toFixed(0)}%)`)
  console.log(
    `   Avec centroïde: ${s.with_centroid} (${((Number(s.with_centroid) / Number(s.total)) * 100).toFixed(0)}%)`
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║   Attribution géométries ALEC                      ║')
  console.log('╚════════════════════════════════════════════════════╝')

  if (dryRun) {
    console.log('\n   🔍 Mode --dry-run: simulation uniquement')
  }

  try {
    await assignAlecGeometries(dryRun)
    await showStats()

    console.log('\n✅ Terminé')
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
