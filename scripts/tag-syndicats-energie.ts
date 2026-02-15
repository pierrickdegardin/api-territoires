/**
 * Identifie et tag les syndicats d'énergie (réseau Territoire d'énergie / FNCCR)
 *
 * Les syndicats d'énergie sont déjà importés comme SYNDICAT ou SYNDICAT_MIXTE.
 * Ce script les identifie et change leur type en SYNDICAT_ENERGIE.
 *
 * Usage:
 *   npx tsx scripts/tag-syndicats-energie.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function findSyndicatsEnergie(dryRun: boolean): Promise<void> {
  console.log("\n=== Recherche des syndicats d'énergie ===")

  // Requête SQL pour trouver les syndicats d'énergie
  // Patterns larges + exclusion des faux positifs (uniquement déchets/eau)
  const syndicats = await prisma.$queryRaw<
    Array<{
      siren: string
      nom: string
      type: string
      code_region: string | null
    }>
  >`
    SELECT siren, nom, type::text, code_region
    FROM groupement
    WHERE type IN ('SYNDICAT', 'SYNDICAT_MIXTE')
    AND (
      -- Patterns avec "énergie" ou "électri"
      nom ILIKE '%nergie%'
      OR nom ILIKE '%lectri%'
      -- Sigles connus des syndicats d'énergie
      OR nom ILIKE '%SIEL%'
      OR nom ILIKE '%SIEM%'
      OR nom ILIKE '%SYDER%'
      OR nom ILIKE '%SYDELA%'
      OR nom ILIKE '%SMOYS%'
      OR nom ILIKE '%SICECO%'
      OR nom ILIKE '%USEDA%'
      OR nom ILIKE '%SDEPA%'
      OR nom ILIKE '%SIEDA%'
      OR nom ILIKE '%SIEIL%'
      OR nom ILIKE '%FDEE%'
      OR nom ILIKE '%SDEF%'
      OR nom ILIKE '%SDEG%'
      OR nom ILIKE '%SDES %'
      OR nom ILIKE '%SDEY%'
      OR nom ILIKE '%SYMIELEC%'
      OR nom ILIKE '%SIDELEC%'
      OR nom ILIKE '%SYMEG%'
      OR nom ILIKE '%FDE %'
      OR nom ILIKE '%SDE 0%'
      OR nom ILIKE '%SDE0%'
      OR nom ILIKE '%TE38%'
      OR nom ILIKE '%TE44%'
      OR nom ILIKE '%TE47%'
      OR nom ILIKE '%TE53%'
      OR nom ILIKE '%TE61%'
      OR nom ILIKE '%TE80%'
      OR nom ILIKE '%TE90%'
      OR nom ILIKE '% SIEGE%'
      OR nom ILIKE '%SIGEIF%'
      OR nom ILIKE '%SIED 70%'
      OR nom ILIKE '%SIED70%'
      OR nom ILIKE '%SIEEEN%'
      OR nom ILIKE '%SIEDS%'
      OR nom ILIKE '%SYADEN%'
      OR nom ILIKE '%SYDESL%'
      OR nom ILIKE '%SDEVO%'
      OR nom ILIKE '%SYDED%'
      OR nom ILIKE '%SDEM%'
      OR nom ILIKE 'Territoire d''%nergie%'
    )
    -- Exclure les syndicats qui sont UNIQUEMENT déchets ou eau (pas mixtes énergie+déchets)
    AND NOT (
      -- Uniquement déchets sans mention d'énergie explicite
      (nom ILIKE '%ordure%' OR nom ILIKE '%d_chet%')
      AND NOT (nom ILIKE '%nergie%' OR nom ILIKE '%lectri%')
    )
    -- Exclure les syndicats d'eau pure
    AND NOT (
      nom ILIKE '%assainiss%'
      AND NOT (nom ILIKE '%nergie%' OR nom ILIKE '%lectri%')
    )
    ORDER BY nom
  `

  console.log(`   ${syndicats.length} syndicats d'énergie identifiés`)

  // Afficher les résultats
  console.log(`\n   Syndicats d'énergie:`)
  for (const s of syndicats.slice(0, 30)) {
    console.log(`     ${s.siren} | ${s.type.padEnd(14)} | ${s.nom.substring(0, 55)}`)
  }
  if (syndicats.length > 30) {
    console.log(`     ... et ${syndicats.length - 30} autres`)
  }

  if (dryRun) {
    console.log('\n   Mode --dry-run: pas de modification')

    // Compter par type actuel
    const byType = new Map<string, number>()
    for (const s of syndicats) {
      byType.set(s.type, (byType.get(s.type) || 0) + 1)
    }
    console.log('\n   Par type actuel:')
    for (const [type, count] of byType.entries()) {
      console.log(`     ${type}: ${count}`)
    }
    return
  }

  // Mise à jour du type
  console.log(`\n   Mise à jour du type vers SYNDICAT_ENERGIE...`)

  const sirens = syndicats.map((s) => s.siren)

  const updated = await prisma.$executeRaw`
    UPDATE groupement
    SET type = 'SYNDICAT_ENERGIE'::type_groupement,
        updated_at = NOW()
    WHERE siren = ANY(${sirens})
  `

  console.log(`   ✅ ${updated} syndicats mis à jour`)
}

async function showStats(): Promise<void> {
  console.log('\n=== Statistiques finales ===')

  const stats = await prisma.$queryRaw<Array<{ type: string; total: bigint; with_geom: bigint }>>`
    SELECT
      type::text,
      COUNT(*) as total,
      COUNT(geometry) as with_geom
    FROM groupement
    GROUP BY type
    ORDER BY total DESC
  `

  for (const s of stats) {
    const pct = s.total > 0 ? ((Number(s.with_geom) / Number(s.total)) * 100).toFixed(0) : 0
    console.log(
      `   ${s.type.padEnd(17)}: ${String(s.total).padStart(5)} total, ${String(s.with_geom).padStart(5)} geom (${pct}%)`
    )
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  console.log('╔════════════════════════════════════════════════════╗')
  console.log("║   Identification des syndicats d'énergie           ║")
  console.log("║   (Réseau Territoire d'énergie / FNCCR)            ║")
  console.log('╚════════════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    await findSyndicatsEnergie(dryRun)
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
