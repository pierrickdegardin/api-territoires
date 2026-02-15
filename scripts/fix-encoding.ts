/**
 * Fix encoding issues in groupement names
 *
 * Re-downloads BANATIC CSV with proper Latin-1 → UTF-8 conversion
 * and updates only the corrupted names.
 *
 * Usage: npx tsx scripts/fix-encoding.ts
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()
const DATA_DIR = '/tmp/banatic-fix'

async function downloadAndConvert(url: string, dest: string): Promise<void> {
  console.log(`   Téléchargement: ${path.basename(dest)}...`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const buffer = await response.arrayBuffer()

  // Convert Latin-1 → UTF-8
  const latin1Content = new TextDecoder('iso-8859-1').decode(buffer)
  fs.writeFileSync(dest, latin1Content, 'utf-8')
  console.log(`   ✓ ${(buffer.byteLength / 1024).toFixed(0)} Ko - converti Latin-1 → UTF-8`)
}

function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(';').map((h) =>
    h
      .replace(/"/g, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
  )

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

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║   Fix encoding - Groupement names (Latin-1→UTF-8)  ║')
  console.log('╚════════════════════════════════════════════════════╝')

  // Count corrupted records
  const corrupted = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM groupement WHERE nom LIKE '%�%'
  `
  console.log(`\n   ${corrupted[0].count} groupements avec encodage corrompu`)

  if (Number(corrupted[0].count) === 0) {
    console.log('   ✅ Aucune correction nécessaire')
    return
  }

  // Download BANATIC CSV with proper encoding
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  const url =
    'https://static.data.gouv.fr/resources/base-nationale-sur-les-intercommunalites/20250203-143929/liste-des-groupements-france-entiere-20250127.csv'
  const csvPath = path.join(DATA_DIR, 'groupements.csv')

  await downloadAndConvert(url, csvPath)

  // Parse CSV
  const content = fs.readFileSync(csvPath, 'utf-8')
  const rows = parseCSV(content)
  console.log(`   ${rows.length} groupements dans le CSV`)

  // Build lookup map SIREN → nom
  const sirenToNom = new Map<string, string>()
  for (const row of rows) {
    const siren = row['N SIREN'] || row['N° SIREN'] || row['siren'] || row['SIREN'] || ''
    const nom = row['Nom du groupement'] || row['nom'] || row['NOM'] || ''
    if (siren && siren.length === 9 && nom) {
      sirenToNom.set(siren, nom)
    }
  }
  console.log(`   ${sirenToNom.size} noms dans le mapping`)

  // Get all corrupted groupements
  const corruptedGroups = await prisma.$queryRaw<Array<{ siren: string; nom: string }>>`
    SELECT siren, nom FROM groupement WHERE nom LIKE '%�%'
  `

  console.log(`\n   Mise à jour de ${corruptedGroups.length} groupements...`)

  let fixed = 0
  let notFound = 0

  for (const grp of corruptedGroups) {
    const correctNom = sirenToNom.get(grp.siren)
    if (correctNom) {
      await prisma.$executeRaw`
        UPDATE groupement SET nom = ${correctNom}, updated_at = NOW()
        WHERE siren = ${grp.siren}
      `
      fixed++
    } else {
      notFound++
    }

    if (fixed % 500 === 0) {
      console.log(`   ... ${fixed} corrigés`)
    }
  }

  console.log(`\n   ✅ ${fixed} noms corrigés, ${notFound} non trouvés dans BANATIC`)

  // Verify
  const remaining = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM groupement WHERE nom LIKE '%�%'
  `
  console.log(`   ${remaining[0].count} groupements encore corrompus`)

  await prisma.$disconnect()
}

main().catch(console.error)
