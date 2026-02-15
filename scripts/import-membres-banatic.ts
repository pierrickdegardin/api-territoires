/**
 * Import des membres de groupements depuis l'export BANATIC "Liste des délégués"
 * Génère ensuite les géométries des syndicats par union des communes membres
 *
 * ATTENTION: Script CPU-intensif. Utiliser avec run-limited:
 *   run-limited -c 30 npx tsx scripts/import-membres-banatic.ts
 *
 * Usage:
 *   npx tsx scripts/import-membres-banatic.ts [--import] [--geometries] [--all]
 */

import { PrismaClient, TypeGroupement } from '@prisma/client'
import * as ExcelJS from 'exceljs'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

// Config
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100')
const PAUSE_MS = parseInt(process.env.PAUSE_MS || '1000')
const GEOMETRY_PAUSE_MS = parseInt(process.env.GEOMETRY_PAUSE_MS || '200')

const EXCEL_PATH = '/tmp/Liste des délégués_20260118.xlsx'
const PETR_PNR_PATH = '/tmp/petr-pnr-membres.json'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Normaliser un nom pour le matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Accents
    .replace(/['-]/g, ' ') // Tirets et apostrophes
    .replace(/\s+/g, ' ')
    .trim()
}

// Extraire le département depuis le SIREN d'une commune
function extractDeptFromSiren(siren: string): string | null {
  if (!siren.startsWith('21') || siren.length !== 9) return null
  // SIREN commune: 21 + dept (2-3 chars) + reste
  // Pour les depts < 10: 21 + 0X + ...
  // Pour les depts >= 10 < 96: 21 + XX + ...
  // Pour Corse: 21 + 2A ou 2B + ...
  // Pour DOM: 21 + 97X + ...

  const afterPrefix = siren.substring(2)

  // DOM-TOM (97X)
  if (afterPrefix.startsWith('97')) {
    return afterPrefix.substring(0, 3)
  }

  // Corse (2A, 2B) - rare dans SIREN
  // Standard: 2 caractères
  return afterPrefix.substring(0, 2)
}

interface GroupementMembres {
  siren: string
  nom: string
  nature: string
  departement: string
  membres: Array<{
    siren: string
    libelle: string
    type: 'commune' | 'epci'
  }>
}

// ============================================
// PARSE EXCEL FILE
// ============================================
async function parseExcelFile(): Promise<Map<string, GroupementMembres>> {
  console.log(`\n📖 Lecture du fichier Excel...`)
  console.log(`   ${EXCEL_PATH}`)

  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Fichier non trouvé: ${EXCEL_PATH}`)
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(EXCEL_PATH)
  const worksheet = workbook.worksheets[0]

  // Convertir en objets JSON
  const rows: Array<Record<string, unknown>> = []
  const headers: string[] = []

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell) => {
        headers.push(cell.value?.toString() || '')
      })
    } else {
      const rowData: Record<string, unknown> = {}
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1]
        if (header) {
          rowData[header] = cell.value
        }
      })
      rows.push(rowData)
    }
  })

  console.log(`   ${rows.length} lignes trouvées`)

  const groupements = new Map<string, GroupementMembres>()

  for (const row of rows) {
    const dept = String(row['Département'] || '')
      .split(' - ')[0]
      .trim()
    const siren = String(row['N° SIREN'] || '').trim()
    const nom = String(row['Nom du groupement'] || '').trim()
    const nature = String(row['Nature juridique'] || '').trim()
    const sirenMembre = String(row['N° SIREN Membre représenté'] || '').trim()
    const libelleMembre = String(row['Libellé Membre représenté'] || '').trim()

    if (!siren || !sirenMembre) continue

    if (!groupements.has(siren)) {
      groupements.set(siren, {
        siren,
        nom,
        nature,
        departement: dept,
        membres: [],
      })
    }

    const grp = groupements.get(siren)!

    // Éviter les doublons
    const membreExiste = grp.membres.some((m) => m.siren === sirenMembre)
    if (!membreExiste) {
      const isCommune = sirenMembre.startsWith('21') && sirenMembre.length === 9
      grp.membres.push({
        siren: sirenMembre,
        libelle: libelleMembre,
        type: isCommune ? 'commune' : 'epci',
      })
    }
  }

  console.log(`   ${groupements.size} groupements avec membres`)

  return groupements
}

// ============================================
// BUILD COMMUNE LOOKUP
// ============================================
async function buildCommuneLookup(): Promise<Map<string, string>> {
  console.log(`\n📍 Construction du cache de communes...`)

  const communes = await prisma.commune.findMany({
    select: { code: true, nom: true, codeDepartement: true },
  })

  const lookup = new Map<string, string>()

  for (const c of communes) {
    // Clé: nom normalisé + département
    const key = `${normalizeName(c.nom)}|${c.codeDepartement}`
    lookup.set(key, c.code)

    // Aussi sans département pour fallback
    const keySimple = normalizeName(c.nom)
    if (!lookup.has(keySimple)) {
      lookup.set(keySimple, c.code)
    }
  }

  console.log(`   ${communes.length} communes indexées`)

  return lookup
}

// ============================================
// MATCH COMMUNE FROM SIREN/LIBELLE
// ============================================
function matchCommune(sirenMembre: string, libelle: string, lookup: Map<string, string>): string | null {
  // Extraire le département du SIREN
  const dept = extractDeptFromSiren(sirenMembre)

  // Essayer avec département
  if (dept) {
    const key = `${normalizeName(libelle)}|${dept}`
    if (lookup.has(key)) {
      return lookup.get(key)!
    }
  }

  // Fallback: par nom seul
  const keySimple = normalizeName(libelle)
  return lookup.get(keySimple) || null
}

// ============================================
// IMPORT MEMBRES
// ============================================
async function importMembres(groupements: Map<string, GroupementMembres>): Promise<void> {
  console.log(`\n📍 Import des liens commune-groupement...`)

  const lookup = await buildCommuneLookup()

  let created = 0
  let skipped = 0
  let notFound = 0
  let processed = 0

  // Filtrer les groupements qui existent dans notre DB
  const existingSirens = new Set<string>()
  const groupementsList = Array.from(groupements.values())

  for (let i = 0; i < groupementsList.length; i += 1000) {
    const batch = groupementsList.slice(i, i + 1000).map((g) => g.siren)
    const existing = await prisma.groupement.findMany({
      where: { siren: { in: batch } },
      select: { siren: true },
    })
    existing.forEach((g) => existingSirens.add(g.siren))
  }

  console.log(`   ${existingSirens.size} groupements trouvés dans la DB`)

  // Traiter chaque groupement
  for (const grp of groupements.values()) {
    if (!existingSirens.has(grp.siren)) {
      skipped++
      continue
    }

    // Traiter les membres communes uniquement
    const communeMembres = grp.membres.filter((m) => m.type === 'commune')

    for (const membre of communeMembres) {
      const codeCommune = matchCommune(membre.siren, membre.libelle, lookup)

      if (!codeCommune) {
        notFound++
        continue
      }

      try {
        await prisma.communeGroupement.upsert({
          where: {
            communeCode_groupementSiren: {
              communeCode: codeCommune,
              groupementSiren: grp.siren,
            },
          },
          create: {
            communeCode: codeCommune,
            groupementSiren: grp.siren,
          },
          update: {},
        })
        created++
      } catch (e) {
        // Ignorer les erreurs de contrainte
      }
    }

    processed++
    if (processed % 500 === 0) {
      console.log(`   ... ${processed}/${existingSirens.size} groupements (${created} liens créés)`)
      await sleep(PAUSE_MS / 2)
    }
  }

  console.log(`   ✅ ${created} liens créés, ${notFound} communes non trouvées, ${skipped} groupements ignorés`)
}

// ============================================
// IMPORT PETR/PNR FROM JSON
// ============================================
async function importPetrPnrMembres(): Promise<void> {
  console.log(`\n📍 Import des membres PETR/PNR depuis JSON...`)

  if (!fs.existsSync(PETR_PNR_PATH)) {
    console.log(`   ⚠️ Fichier non trouvé: ${PETR_PNR_PATH}`)
    return
  }

  const data = JSON.parse(fs.readFileSync(PETR_PNR_PATH, 'utf-8'))

  let created = 0
  let errors = 0

  for (const [nom, info] of Object.entries(data) as [string, any][]) {
    const epciMembres = info.epci_membres || []

    // Trouver le groupement par nom
    const groupement = await prisma.groupement.findFirst({
      where: {
        OR: [
          { nom: { contains: nom.substring(0, 30), mode: 'insensitive' } },
          { nom: { contains: nom.split(' ').slice(-2).join(' '), mode: 'insensitive' } },
        ],
      },
      select: { siren: true, nom: true },
    })

    if (!groupement) {
      console.log(`   ⚠️ Non trouvé: ${nom}`)
      continue
    }

    console.log(`   ${nom} -> ${groupement.siren}`)

    // Ajouter les membres EPCI
    for (const epci of epciMembres) {
      if (!epci.code) continue

      // Les PETR ont des EPCI comme membres, pas des communes
      // On doit récupérer les communes des EPCI membres
      const communesEpci = await prisma.communeGroupement.findMany({
        where: { groupementSiren: epci.code },
        select: { communeCode: true },
      })

      for (const c of communesEpci) {
        try {
          await prisma.communeGroupement.upsert({
            where: {
              communeCode_groupementSiren: {
                communeCode: c.communeCode,
                groupementSiren: groupement.siren,
              },
            },
            create: {
              communeCode: c.communeCode,
              groupementSiren: groupement.siren,
            },
            update: {},
          })
          created++
        } catch (e) {
          errors++
        }
      }
    }
  }

  console.log(`   ✅ ${created} liens PETR/PNR créés, ${errors} erreurs`)
}

// ============================================
// GENERATE GEOMETRIES
// ============================================
async function generateGeometries(): Promise<void> {
  console.log(`\n📍 Génération des géométries par ST_Union...`)
  console.log(`   Pause entre géométries: ${GEOMETRY_PAUSE_MS}ms`)

  // Récupérer les groupements sans géométrie mais avec des membres
  const groupements = await prisma.$queryRaw<Array<{ siren: string; nom: string; nb_membres: bigint }>>`
    SELECT
      g.siren,
      g.nom,
      COUNT(cg.commune_code) as nb_membres
    FROM groupement g
    LEFT JOIN commune_groupement cg ON cg.groupement_siren = g.siren
    WHERE g.geometry IS NULL
    AND g.type NOT IN ('EPCI_CC', 'EPCI_CA', 'EPCI_CU', 'EPCI_METROPOLE')
    GROUP BY g.siren, g.nom
    HAVING COUNT(cg.commune_code) > 0
    ORDER BY COUNT(cg.commune_code) ASC
  `

  console.log(`   ${groupements.length} groupements à traiter`)

  let processed = 0
  let success = 0
  let errors = 0

  for (const grp of groupements) {
    try {
      await prisma.$executeRaw`
        UPDATE groupement SET
          geometry = (
            SELECT ST_Multi(ST_Buffer(ST_Union(c.geometry), 0))
            FROM commune c
            JOIN commune_groupement cg ON cg.commune_code = c.code
            WHERE cg.groupement_siren = ${grp.siren}
            AND c.geometry IS NOT NULL
          ),
          centroid = (
            SELECT ST_Centroid(ST_Union(c.geometry))
            FROM commune c
            JOIN commune_groupement cg ON cg.commune_code = c.code
            WHERE cg.groupement_siren = ${grp.siren}
            AND c.geometry IS NOT NULL
          )
        WHERE siren = ${grp.siren}
      `
      success++
    } catch (e) {
      errors++
      if (errors < 5) {
        console.warn(`   ⚠️ Erreur ${grp.siren}: ${e}`)
      }
    }

    processed++

    if (processed % 100 === 0) {
      console.log(`   ... ${processed}/${groupements.length} (${success} ok, ${errors} erreurs)`)
    }

    await sleep(GEOMETRY_PAUSE_MS)
  }

  console.log(`   ✅ ${success} géométries générées, ${errors} erreurs`)
}

// ============================================
// SHOW STATS
// ============================================
async function showStats(): Promise<void> {
  console.log(`\n📊 Statistiques:`)

  const stats = await prisma.$queryRaw<Array<{ type: string; total: bigint; with_geom: bigint; with_membres: bigint }>>`
    SELECT
      g.type::text,
      COUNT(*) as total,
      COUNT(g.geometry) as with_geom,
      (SELECT COUNT(DISTINCT cg.groupement_siren) FROM commune_groupement cg
       WHERE cg.groupement_siren IN (SELECT siren FROM groupement WHERE type::text = g.type::text)) as with_membres
    FROM groupement g
    GROUP BY g.type
    ORDER BY COUNT(*) DESC
  `

  for (const s of stats) {
    console.log(`   ${s.type}: ${s.total} total, ${s.with_geom} avec géométrie, ${s.with_membres} avec membres`)
  }

  const totalLiens = await prisma.communeGroupement.count()
  console.log(`\n   Total liens commune-groupement: ${totalLiens}`)
}

// ============================================
// MAIN
// ============================================
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const runAll = args.includes('--all') || args.length === 0

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║   API Territoires - Import Membres BANATIC         ║')
  console.log('║   ⚠️  ATTENTION: Script CPU-intensif               ║')
  console.log('║   Utiliser: run-limited -c 30 npx tsx ...          ║')
  console.log('╚════════════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    if (runAll || args.includes('--import')) {
      const groupements = await parseExcelFile()
      await importMembres(groupements)
    }

    if (runAll || args.includes('--petr-pnr')) {
      await importPetrPnrMembres()
    }

    if (runAll || args.includes('--geometries')) {
      await generateGeometries()
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1)

    await showStats()

    console.log(`\n════════════════════════════════════════════════════`)
    console.log(`✅ Terminé en ${duration} minutes`)
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
