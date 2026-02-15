/**
 * Import BANATIC depuis fichiers Excel (via conversion CSV)
 *
 * Source: /root/chene6/data/banatic/
 * - Liste des communes_*.xlsx: Relations commune-groupement (130k+ lignes)
 * - Intercommunalités_*.xlsx: Groupements avec compétences et adhésions (143k+ lignes)
 *
 * Ce script importe:
 * 1. Les relations commune-groupement depuis "Liste des communes"
 * 2. Les compétences énergie pour identifier les syndicats d'énergie
 * 3. Les adhésions groupement→groupement (EPCI → SDE)
 *
 * Prérequis: Convertir Excel en CSV avec Python openpyxl (car xlsx ne lit pas bien ces fichiers)
 *
 * Usage:
 *   npx tsx scripts/import-banatic-xlsx.ts --competences    # Compétences énergie → tag SYNDICAT_ENERGIE
 *   npx tsx scripts/import-banatic-xlsx.ts --adhesions      # Relations groupement-groupement
 *   npx tsx scripts/import-banatic-xlsx.ts --all            # Tout
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'

const prisma = new PrismaClient()
const BATCH_SIZE = 500

// Parse CSV avec séparateur ;
function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(';').map((h) => h.replace(/"/g, '').trim())

  const rows: Array<Record<string, string>> = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';').map((v) => v.replace(/"/g, '').trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] || ''
    })
    rows.push(row)
  }
  return rows
}

// ============================================
// IMPORT COMPÉTENCES ÉNERGIE → SYNDICAT_ENERGIE
// ============================================
async function importCompetencesEnergie(): Promise<void> {
  console.log('\n📍 Import des compétences énergie et tag SYNDICAT_ENERGIE...')

  const csvPath = '/tmp/intercommunalites.csv'
  if (!fs.existsSync(csvPath)) {
    console.log('   ⚠️ Fichier CSV non trouvé. Conversion Excel → CSV nécessaire.')
    console.log('   Exécutez: python3 scripts/convert-banatic-xlsx.py')
    return
  }

  console.log(`   Lecture du CSV...`)
  const content = fs.readFileSync(csvPath, 'utf-8')
  const rows = parseCSV(content)
  console.log(`   ${rows.length} lignes à traiter`)

  // Headers du fichier (vérifiés manuellement)
  // Col 52 (index 51): "Concession de la distribution publique d'électricité"
  // Col 53 (index 52): "Concession de la distribution publique de gaz"

  const energieSyndicats = new Map<
    string,
    {
      nom: string
      nature: string
      elec: boolean
      gaz: boolean
    }
  >()

  for (const row of rows) {
    const siren = row['N° SIREN'] || ''
    const nom = row['Nom du groupement'] || ''
    const nature = row['Nature juridique'] || ''

    if (!siren || siren.length !== 9) continue

    const compElec = row["Concession de la distribution publique d'électricité"] === 'OUI'
    const compGaz = row['Concession de la distribution publique de gaz'] === 'OUI'

    const isSyndicat = ['SIVU', 'SIVOM', 'SMF', 'SMO'].includes(nature)
    const hasEnergieComp = compElec || compGaz

    if (isSyndicat && hasEnergieComp && !energieSyndicats.has(siren)) {
      energieSyndicats.set(siren, { nom, nature, elec: compElec, gaz: compGaz })
    }
  }

  console.log(`   ${energieSyndicats.size} syndicats avec compétences énergie identifiés`)

  // Filtrer pour les vrais syndicats d'énergie
  const realEnergieSyndicats: string[] = []

  for (const [siren, info] of energieSyndicats) {
    const nomLower = info.nom.toLowerCase()
    const isEnergieName = [
      "syndicat d'énergie",
      "syndicat départemental d'énergie",
      "territoire d'énergie",
      "d'énergie",
      "d'énergies",
      'sde',
      'sied',
      'fdee',
      'syder',
      'siea',
      'syded',
      "d'électricité",
      'électrification',
      'énergies',
    ].some((k) => nomLower.includes(k))

    if (info.elec && isEnergieName) {
      realEnergieSyndicats.push(siren)
    }
  }

  console.log(`   ${realEnergieSyndicats.length} syndicats d'énergie à taguer`)

  // Afficher les 20 premiers
  console.log('\n   Exemples:')
  for (const siren of realEnergieSyndicats.slice(0, 20)) {
    const info = energieSyndicats.get(siren)!
    console.log(`      ${siren} | ${info.nom.substring(0, 55)}`)
  }

  // Mettre à jour le type en SYNDICAT_ENERGIE
  let updated = 0
  for (const siren of realEnergieSyndicats) {
    try {
      const result = await prisma.$executeRaw`
        UPDATE groupement
        SET type = 'SYNDICAT_ENERGIE'::type_groupement, updated_at = NOW()
        WHERE siren = ${siren}
        AND type IN ('SYNDICAT', 'SYNDICAT_MIXTE')
      `
      if (result > 0) updated++
    } catch {
      // Groupement n'existe pas
    }
  }

  console.log(`\n   ✅ ${updated} syndicats tagués SYNDICAT_ENERGIE`)

  // Stats finales
  const stats = await prisma.$queryRaw<Array<{ type: string; count: bigint }>>`
    SELECT type::text, COUNT(*) as count
    FROM groupement
    WHERE type::text LIKE 'SYNDICAT%'
    GROUP BY type
    ORDER BY count DESC
  `
  console.log('\n   Stats syndicats:')
  for (const s of stats) {
    console.log(`      ${s.type}: ${s.count}`)
  }
}

// ============================================
// IMPORT ADHÉSIONS GROUPEMENT → GROUPEMENT
// ============================================
async function importAdhesions(): Promise<void> {
  console.log('\n📍 Import des adhésions groupement → groupement...')

  const csvPath = '/tmp/intercommunalites.csv'
  if (!fs.existsSync(csvPath)) {
    console.log('   ⚠️ Fichier CSV non trouvé')
    return
  }

  console.log(`   Lecture du CSV...`)
  const content = fs.readFileSync(csvPath, 'utf-8')
  const rows = parseCSV(content)
  console.log(`   ${rows.length} lignes à traiter`)

  // Colonnes: "Adhésion siren" (col 177, index 176), "Adhésion nom" (col 178)
  const adhesions = new Map<string, Set<string>>()

  for (const row of rows) {
    const siren = row['N° SIREN'] || ''
    // Note: les headers peuvent avoir des espaces ou accents différents
    const adhesionSiren = row['Adhésion siren'] || row['Adhésion SIREN'] || ''

    if (!siren || siren.length !== 9) continue
    if (!adhesionSiren || adhesionSiren.length !== 9) continue
    if (siren === adhesionSiren) continue

    if (!adhesions.has(siren)) {
      adhesions.set(siren, new Set())
    }
    adhesions.get(siren)!.add(adhesionSiren)
  }

  console.log(`   ${adhesions.size} groupements avec des adhésions`)

  let totalAdhesions = 0
  for (const adhSet of adhesions.values()) {
    totalAdhesions += adhSet.size
  }
  console.log(`   ${totalAdhesions} relations d'adhésion uniques`)

  // Créer la table
  console.log('   Création de la table groupement_adhesion...')
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS groupement_adhesion (
      groupement_siren VARCHAR(9) NOT NULL,
      adhesion_siren VARCHAR(9) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (groupement_siren, adhesion_siren)
    )
  `

  await prisma.$executeRaw`TRUNCATE TABLE groupement_adhesion`

  let created = 0
  for (const [siren, adhSirens] of adhesions) {
    for (const adhSiren of adhSirens) {
      try {
        await prisma.$executeRaw`
          INSERT INTO groupement_adhesion (groupement_siren, adhesion_siren)
          VALUES (${siren}, ${adhSiren})
          ON CONFLICT DO NOTHING
        `
        created++
      } catch {
        // Ignore
      }
    }

    if (created % 5000 === 0 && created > 0) {
      console.log(`   ... ${created} adhésions créées`)
    }
  }

  console.log(`   ✅ ${created} adhésions importées`)

  // Stats
  const energieAdhesions = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(DISTINCT ga.groupement_siren) as count
    FROM groupement_adhesion ga
    JOIN groupement g ON g.siren = ga.adhesion_siren
    WHERE g.type = 'SYNDICAT_ENERGIE'
  `
  console.log(`   ${energieAdhesions[0].count} groupements adhèrent à un syndicat d'énergie`)
}

// ============================================
// MAIN
// ============================================
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const runAll = args.includes('--all') || args.length === 0

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║   API Territoires - Import BANATIC Excel           ║')
  console.log('║   Source: /tmp/intercommunalites.csv               ║')
  console.log('╚════════════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    if (args.includes('--competences') || runAll) {
      await importCompetencesEnergie()
    }

    if (args.includes('--adhesions') || runAll) {
      await importAdhesions()
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
    console.log(`\n✅ Terminé en ${duration} minutes`)
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
