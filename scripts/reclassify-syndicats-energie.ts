/**
 * Reclassification des syndicats d'énergie depuis le fichier ACTEE+
 *
 * Ce script lit le fichier vue_detaillee_acteeplus.xlsx pour identifier
 * les syndicats d'énergie et les reclassifie dans la base de données.
 *
 * Améliorations v2:
 * - Détection obligatoire de mots-clés "énergie"
 * - Exclusion des syndicats eau/déchets
 * - Gestion des noms abrégés (SDE07, SDEHG, etc.)
 * - Matching par département
 *
 * Usage:
 *   npx tsx scripts/reclassify-syndicats-energie.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client'
import * as ExcelJS from 'exceljs'

const prisma = new PrismaClient()

// Chemin vers le fichier ACTEE+
const ACTEE_FILE = process.env.ACTEE_FILE || '/app/vue_detaillee_acteeplus.xlsx'

// Mots-clés indiquant un syndicat d'énergie
const ENERGY_KEYWORDS = [
  'ENERGIE',
  'ENERGIES',
  'ENERGETIQUE',
  'ENERGETIQUES',
  'ELECTRICITE',
  'ELECTRIQUE',
  'ELECTRIQUES',
  'GAZ',
  'GAZIER',
  'GAZIERES',
  'ENR',
  'RENOUVELABLE',
  'RENOUVELABLES',
  'CLIMAT',
  'CLIMATIQUE',
  'TRANSITION',
]

// Mots-clés à exclure (eau, déchets, assainissement)
const EXCLUDE_KEYWORDS = [
  'EAU',
  'EAUX',
  'ASSAINISSEMENT',
  'DECHETS',
  'ORDURES',
  'POTABLE',
  'PLUVIALE',
  'PLUVIALES',
  'USEES',
  'HYDRAULIQUE',
  'IRRIGATION',
  'FLUVIAL',
]

// Mapping des codes départements et leurs variantes
const DEPT_NAMES: Record<string, string[]> = {
  '01': ['AIN'],
  '02': ['AISNE'],
  '03': ['ALLIER'],
  '04': ['ALPES HAUTE PROVENCE', 'AHP'],
  '05': ['HAUTES ALPES', 'HA'],
  '06': ['ALPES MARITIMES', 'AM'],
  '07': ['ARDECHE'],
  '08': ['ARDENNES'],
  '09': ['ARIEGE'],
  '10': ['AUBE'],
  '11': ['AUDE'],
  '12': ['AVEYRON'],
  '13': ['BOUCHES RHONE', 'BDR'],
  '14': ['CALVADOS'],
  '15': ['CANTAL'],
  '16': ['CHARENTE'],
  '17': ['CHARENTE MARITIME', 'CM'],
  '18': ['CHER'],
  '19': ['CORREZE'],
  '21': ['COTE OR', 'COTE D OR'],
  '22': ['COTES ARMOR', 'CDA'],
  '23': ['CREUSE'],
  '24': ['DORDOGNE'],
  '25': ['DOUBS'],
  '26': ['DROME'],
  '27': ['EURE'],
  '28': ['EURE LOIR', 'EL'],
  '29': ['FINISTERE'],
  '30': ['GARD'],
  '31': ['HAUTE GARONNE', 'HG'],
  '32': ['GERS'],
  '33': ['GIRONDE'],
  '34': ['HERAULT'],
  '35': ['ILLE VILAINE', 'IV'],
  '36': ['INDRE'],
  '37': ['INDRE LOIRE', 'IL'],
  '38': ['ISERE'],
  '39': ['JURA'],
  '40': ['LANDES'],
  '41': ['LOIR CHER', 'LC'],
  '42': ['LOIRE'],
  '43': ['HAUTE LOIRE', 'HL'],
  '44': ['LOIRE ATLANTIQUE', 'LA'],
  '45': ['LOIRET'],
  '46': ['LOT'],
  '47': ['LOT GARONNE', 'LG'],
  '48': ['LOZERE'],
  '49': ['MAINE LOIRE', 'ML'],
  '50': ['MANCHE'],
  '51': ['MARNE'],
  '52': ['HAUTE MARNE', 'HM'],
  '53': ['MAYENNE'],
  '54': ['MEURTHE MOSELLE', 'MM'],
  '55': ['MEUSE'],
  '56': ['MORBIHAN'],
  '57': ['MOSELLE'],
  '58': ['NIEVRE'],
  '59': ['NORD'],
  '60': ['OISE'],
  '61': ['ORNE'],
  '62': ['PAS CALAIS', 'PDC'],
  '63': ['PUY DOME', 'PDD'],
  '64': ['PYRENEES ATLANTIQUES', 'PA'],
  '65': ['HAUTES PYRENEES', 'HP'],
  '66': ['PYRENEES ORIENTALES', 'PO'],
  '67': ['BAS RHIN', 'BR'],
  '68': ['HAUT RHIN', 'HR'],
  '69': ['RHONE'],
  '70': ['HAUTE SAONE', 'HS'],
  '71': ['SAONE LOIRE', 'SL'],
  '72': ['SARTHE'],
  '73': ['SAVOIE'],
  '74': ['HAUTE SAVOIE'],
  '75': ['PARIS'],
  '76': ['SEINE MARITIME', 'SM'],
  '77': ['SEINE MARNE'],
  '78': ['YVELINES'],
  '79': ['DEUX SEVRES', 'DS'],
  '80': ['SOMME'],
  '81': ['TARN'],
  '82': ['TARN GARONNE', 'TG'],
  '83': ['VAR'],
  '84': ['VAUCLUSE'],
  '85': ['VENDEE'],
  '86': ['VIENNE'],
  '87': ['HAUTE VIENNE', 'HV'],
  '88': ['VOSGES'],
  '89': ['YONNE'],
  '90': ['BELFORT', 'TERRITOIRE BELFORT'],
  '91': ['ESSONNE'],
  '92': ['HAUTS SEINE', 'HDS'],
  '93': ['SEINE SAINT DENIS', 'SSD'],
  '94': ['VAL MARNE', 'VM'],
  '95': ['VAL OISE', 'VO'],
  '971': ['GUADELOUPE'],
  '972': ['MARTINIQUE'],
  '973': ['GUYANE'],
  '974': ['REUNION'],
  '976': ['MAYOTTE'],
  '2A': ['CORSE SUD'],
  '2B': ['HAUTE CORSE'],
}

// Normaliser un nom pour la comparaison
function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Enlever accents
    .replace(/[^A-Z0-9]/g, ' ') // Garder que alphanum
    .replace(/\s+/g, ' ') // Espaces multiples -> simple
    .trim()
}

// Vérifier si un nom contient des mots-clés énergie
function hasEnergyKeywords(normalized: string): boolean {
  return ENERGY_KEYWORDS.some((kw) => normalized.includes(kw))
}

// Vérifier si un nom contient des mots-clés à exclure
function hasExcludeKeywords(normalized: string): boolean {
  return EXCLUDE_KEYWORDS.some((kw) => normalized.includes(kw))
}

// Extraire le code département d'un nom abrégé (SDE07, SDEHG, etc.)
function extractDeptFromAbbrev(name: string): string | null {
  const normalized = normalizeName(name)

  // Pattern: SDE + numéro (SDE07, SDE03, SDE77)
  const numMatch = normalized.match(/\bSDE[ED]?\s*(\d{2,3})\b/)
  if (numMatch) return numMatch[1]

  // Pattern: SDED/SDEE/SDE + nom département (SDEHG, SDEEG)
  // Chercher dans les variantes de département
  for (const [code, variants] of Object.entries(DEPT_NAMES)) {
    for (const variant of variants) {
      // SDEHG → HG = Haute-Garonne
      const abbrevPattern = new RegExp(`\\bSDE[ED]?\\s*(${variant.replace(/\s+/g, '')})\\b`, 'i')
      if (abbrevPattern.test(normalized)) return code

      // Vérifier aussi les initiales (HG, AHP, etc.)
      if (variant.length <= 3) {
        const shortPattern = new RegExp(`\\bSDE[ED]?${variant}\\b`, 'i')
        if (shortPattern.test(normalized)) return code
      }
    }
  }

  return null
}

// Extraire le département d'un nom complet
function extractDeptFromFullName(name: string): string | null {
  const normalized = normalizeName(name)

  for (const [code, variants] of Object.entries(DEPT_NAMES)) {
    for (const variant of variants) {
      if (normalized.includes(variant)) return code
    }
  }

  // Chercher aussi le code numérique
  const numMatch = normalized.match(/\b(\d{2,3})\b/)
  if (numMatch && DEPT_NAMES[numMatch[1]]) return numMatch[1]

  return null
}

// Extraire les mots-clés significatifs d'un nom
function extractKeywords(name: string): string[] {
  const normalized = normalizeName(name)
  const words = normalized.split(' ')

  // Filtrer les mots trop courts ou génériques
  const stopWords = [
    'DE',
    'DU',
    'DES',
    'LA',
    'LE',
    'LES',
    'ET',
    'D',
    'L',
    'EN',
    'A',
    'AU',
    'AUX',
    'POUR',
    'SYNDICAT',
    'DEPARTEMENTAL',
    'INTERCOMMUNAL',
    'MIXTE',
  ]
  return words.filter((w) => w.length > 2 && !stopWords.includes(w))
}

// Calculer un score de similarité entre deux noms
function similarityScore(name1: string, name2: string): number {
  const kw1 = extractKeywords(name1)
  const kw2 = extractKeywords(name2)

  if (kw1.length === 0 || kw2.length === 0) return 0

  let matches = 0
  for (const w1 of kw1) {
    for (const w2 of kw2) {
      if (w1 === w2 || (w1.length > 3 && w2.length > 3 && (w1.includes(w2) || w2.includes(w1)))) {
        matches++
        break
      }
    }
  }

  return matches / Math.max(kw1.length, kw2.length)
}

interface ActeeSyndicat {
  nom: string
  departement: string
  normalized: string
}

interface DbSyndicat {
  siren: string
  nom: string
  type: string
  nature: string | null
  code_departement: string | null
}

interface MatchResult {
  actee: string
  db: string
  siren: string
  score: number
  method: 'exact' | 'dept+energy' | 'similarity'
}

async function loadActeeData(): Promise<ActeeSyndicat[]> {
  console.log(`   Lecture du fichier ${ACTEE_FILE}...`)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(ACTEE_FILE)
  const worksheet = workbook.worksheets[0]

  // Convertir en objets JSON
  const data: Array<Record<string, unknown>> = []
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
      data.push(rowData)
    }
  })

  // Extraire les syndicats d'énergie uniques
  const syndicatsMap = new Map<string, ActeeSyndicat>()

  for (const row of data) {
    const type = row['Type de structure'] as string
    if (type !== "Syndicat d'Energie") continue

    const nom = row['Membres'] as string
    const dept = row['Département'] as string

    if (!nom) continue

    const normalized = normalizeName(nom)
    if (!syndicatsMap.has(normalized)) {
      syndicatsMap.set(normalized, {
        nom,
        departement: dept || '',
        normalized,
      })
    }
  }

  return Array.from(syndicatsMap.values())
}

// Trouver la meilleure correspondance pour un syndicat ACTEE+
function findBestMatch(
  actee: ActeeSyndicat,
  dbSyndicats: DbSyndicat[],
  dbByDept: Map<string, DbSyndicat[]>
): MatchResult | null {
  const acteeNorm = normalizeName(actee.nom)

  // 1. Matching exact par nom normalisé
  for (const db of dbSyndicats) {
    const dbNorm = normalizeName(db.nom)
    if (acteeNorm === dbNorm) {
      return {
        actee: actee.nom,
        db: db.nom,
        siren: db.siren,
        score: 1.0,
        method: 'exact',
      }
    }
  }

  // 1b. Si le nom ACTEE+ est court (abréviation), chercher s'il est contenu dans un nom DB
  // Ex: "SIEA" dans "SI d'énergie et de e-communication ou SIEA"
  if (acteeNorm.length <= 15 && !acteeNorm.includes(' ')) {
    // C'est probablement une abréviation (SIEA, SDE04, SYDEV, etc.)
    // Priorité 1: syndicats déjà SYNDICAT_ENERGIE avec l'abréviation
    for (const db of dbSyndicats) {
      if (db.type !== 'SYNDICAT_ENERGIE') continue
      const dbNorm = normalizeName(db.nom)
      if (dbNorm.endsWith(acteeNorm) || dbNorm.includes(` ${acteeNorm}`) || dbNorm.includes(` OU ${acteeNorm}`)) {
        return {
          actee: actee.nom,
          db: db.nom,
          siren: db.siren,
          score: 0.95,
          method: 'exact',
        }
      }
    }
    // Priorité 2: syndicats avec mots-clés énergie et l'abréviation
    for (const db of dbSyndicats) {
      const dbNorm = normalizeName(db.nom)
      // Exclure les faux positifs (déchets, eau, ingénierie, etc.)
      if (hasExcludeKeywords(dbNorm)) continue
      if (dbNorm.includes('ORDURES') || dbNorm.includes('MENAGERES') || dbNorm.includes('INGENIERIE')) continue
      // Doit avoir des mots-clés énergie
      if (!hasEnergyKeywords(dbNorm)) continue
      if (dbNorm.endsWith(acteeNorm) || dbNorm.includes(` ${acteeNorm}`) || dbNorm.includes(` OU ${acteeNorm}`)) {
        return {
          actee: actee.nom,
          db: db.nom,
          siren: db.siren,
          score: 0.9,
          method: 'exact',
        }
      }
    }
  }

  // 2. Extraire le département du nom ACTEE+ (SDE07, SDEHG, etc.)
  let acteeDept = extractDeptFromAbbrev(actee.nom) || extractDeptFromFullName(actee.nom)

  // Si pas trouvé dans le nom, utiliser la colonne département
  if (!acteeDept && actee.departement) {
    // Normaliser le nom du département pour trouver le code
    const deptNorm = normalizeName(actee.departement)
    for (const [code, variants] of Object.entries(DEPT_NAMES)) {
      for (const variant of variants) {
        if (deptNorm.includes(variant) || variant.includes(deptNorm)) {
          acteeDept = code
          break
        }
      }
      if (acteeDept) break
    }
    // Chercher aussi le code numérique
    if (!acteeDept) {
      const numMatch = deptNorm.match(/\b(\d{2,3})\b/)
      if (numMatch && DEPT_NAMES[numMatch[1]]) acteeDept = numMatch[1]
    }
  }

  // 3. Si on a un département, chercher parmi les syndicats de ce département
  //    qui ont des mots-clés énergie
  if (acteeDept) {
    const deptSyndicats = dbByDept.get(acteeDept) || []

    // Chercher un syndicat énergie dans le département
    for (const db of deptSyndicats) {
      const dbNorm = normalizeName(db.nom)

      // Vérifier qu'il a des mots-clés énergie et pas d'exclusion
      if (hasEnergyKeywords(dbNorm) && !hasExcludeKeywords(dbNorm)) {
        const score = similarityScore(actee.nom, db.nom)
        if (score >= 0.3) {
          // Score plus bas car on a déjà validé le département + énergie
          return {
            actee: actee.nom,
            db: db.nom,
            siren: db.siren,
            score: Math.max(score, 0.7), // Bonus car match département + énergie
            method: 'dept+energy',
          }
        }
      }
    }
  }

  // 4. Fallback: similarité globale avec validation énergie
  let bestMatch: MatchResult | null = null

  for (const db of dbSyndicats) {
    const dbNorm = normalizeName(db.nom)

    // Exclure les syndicats eau/déchets
    if (hasExcludeKeywords(dbNorm)) continue

    // Préférer ceux qui ont des mots-clés énergie
    const dbHasEnergy = hasEnergyKeywords(dbNorm)

    const score = similarityScore(actee.nom, db.nom)

    // Score minimum plus élevé sans validation département
    const minScore = dbHasEnergy ? 0.6 : 0.75

    if (score >= minScore) {
      const adjustedScore = dbHasEnergy ? score : score * 0.9 // Pénalité si pas de mot-clé énergie

      if (!bestMatch || adjustedScore > bestMatch.score) {
        bestMatch = {
          actee: actee.nom,
          db: db.nom,
          siren: db.siren,
          score: adjustedScore,
          method: 'similarity',
        }
      }
    }
  }

  return bestMatch
}

async function reclassifySyndicats(dryRun: boolean): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════╗')
  console.log("║   Reclassification des Syndicats d'Énergie v2          ║")
  console.log('║   Source: vue_detaillee_acteeplus.xlsx                 ║')
  console.log('╚════════════════════════════════════════════════════════╝\n')

  if (dryRun) {
    console.log('Mode --dry-run: affichage sans modification\n')
  }

  // Charger les données ACTEE+
  const acteeSyndicats = await loadActeeData()
  console.log(`   ${acteeSyndicats.length} syndicats d'énergie dans ACTEE+\n`)

  // Charger les syndicats d'énergie EXISTANTS
  const existingEnergySyndicats = await prisma.$queryRaw<DbSyndicat[]>`
    SELECT g.siren, g.nom, g.type::text, g.nature,
           (SELECT c.code_departement FROM commune_groupement cg
            JOIN commune c ON c.code = cg.commune_code
            WHERE cg.groupement_siren = g.siren LIMIT 1) as code_departement
    FROM groupement g
    WHERE g.type = 'SYNDICAT_ENERGIE'
  `
  console.log(`   ${existingEnergySyndicats.length} syndicats d'énergie DÉJÀ en base\n`)

  // Charger les syndicats génériques (SYNDICAT et SYNDICAT_MIXTE)
  const dbSyndicats = await prisma.$queryRaw<DbSyndicat[]>`
    SELECT g.siren, g.nom, g.type::text, g.nature,
           (SELECT c.code_departement FROM commune_groupement cg
            JOIN commune c ON c.code = cg.commune_code
            WHERE cg.groupement_siren = g.siren LIMIT 1) as code_departement
    FROM groupement g
    WHERE g.type IN ('SYNDICAT', 'SYNDICAT_MIXTE')
  `
  console.log(`   ${dbSyndicats.length} syndicats génériques en base\n`)

  // Combiner les deux listes pour la recherche
  const allSyndicats = [...existingEnergySyndicats, ...dbSyndicats]

  // Indexer par département pour recherche rapide
  const dbByDept = new Map<string, DbSyndicat[]>()
  for (const db of allSyndicats) {
    const dept = db.code_departement || extractDeptFromFullName(db.nom)
    if (dept) {
      if (!dbByDept.has(dept)) dbByDept.set(dept, [])
      dbByDept.get(dept)!.push(db)
    }
  }
  console.log(`   ${dbByDept.size} départements indexés\n`)

  // Statistiques
  let reclassified = 0
  let alreadyEnergy = 0
  const matches: MatchResult[] = []
  const notFoundList: string[] = []
  const methodStats = { exact: 0, 'dept+energy': 0, similarity: 0 }

  // Pour chaque syndicat ACTEE+, chercher une correspondance
  for (const actee of acteeSyndicats) {
    const match = findBestMatch(actee, allSyndicats, dbByDept)

    if (match) {
      matches.push(match)
      methodStats[match.method]++
    } else {
      notFoundList.push(`${actee.departement}: ${actee.nom}`)
    }
  }

  // Dédupliquer (éviter de reclassifier le même syndicat plusieurs fois)
  const uniqueMatches = new Map<string, MatchResult>()
  for (const match of matches.sort((a, b) => b.score - a.score)) {
    if (!uniqueMatches.has(match.siren)) {
      uniqueMatches.set(match.siren, match)
    }
  }

  // Afficher et reclassifier les correspondances
  console.log('=== Correspondances trouvées ===\n')

  for (const match of Array.from(uniqueMatches.values()).sort((a, b) => b.score - a.score)) {
    // Vérifier si déjà SYNDICAT_ENERGIE
    const current = await prisma.$queryRaw<[{ type: string }]>`
      SELECT type::text FROM groupement WHERE siren = ${match.siren}
    `

    if (current[0]?.type === 'SYNDICAT_ENERGIE') {
      alreadyEnergy++
      continue
    }

    if (dryRun) {
      const methodLabel = match.method === 'exact' ? '=' : match.method === 'dept+energy' ? 'D' : '~'
      console.log(`   [${methodLabel}] ${match.siren} (${(match.score * 100).toFixed(0)}%)`)
      console.log(`       ACTEE: ${match.actee.substring(0, 55)}`)
      console.log(`       DB:    ${match.db.substring(0, 55)}`)
      console.log('')
    } else {
      await prisma.$executeRaw`
        UPDATE groupement
        SET type = 'SYNDICAT_ENERGIE'::type_groupement,
            updated_at = NOW()
        WHERE siren = ${match.siren}
      `
      console.log(`   ✓ ${match.siren} → SYNDICAT_ENERGIE`)
    }
    reclassified++
  }

  // Syndicats non trouvés
  if (notFoundList.length > 0) {
    console.log('\n=== Syndicats ACTEE+ non trouvés en base ===\n')
    for (const s of notFoundList.sort().slice(0, 25)) {
      console.log(`   ⚠️ ${s}`)
    }
    if (notFoundList.length > 25) {
      console.log(`   ... et ${notFoundList.length - 25} autres`)
    }
  }

  // Résumé
  console.log('\n=== Résumé ===')
  console.log(`   Syndicats ACTEE+: ${acteeSyndicats.length}`)
  console.log(`   Correspondances: ${uniqueMatches.size} (uniques)`)
  console.log(`     - Exact: ${methodStats.exact}`)
  console.log(`     - Dept+Énergie: ${methodStats['dept+energy']}`)
  console.log(`     - Similarité: ${methodStats.similarity}`)
  console.log(`   Déjà SYNDICAT_ENERGIE: ${alreadyEnergy}`)
  console.log(`   À reclassifier: ${reclassified}`)
  console.log(`   Non trouvés: ${notFoundList.length}`)

  // Stats finales
  if (!dryRun) {
    const stats = await prisma.$queryRaw<Array<{ type: string; count: bigint }>>`
      SELECT type::text, COUNT(*) as count
      FROM groupement
      WHERE type IN ('SYNDICAT_ENERGIE', 'SYNDICAT', 'SYNDICAT_MIXTE')
      GROUP BY type
      ORDER BY count DESC
    `
    console.log('\n=== Statistiques après reclassification ===')
    for (const s of stats) {
      console.log(`   ${s.type}: ${s.count}`)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  try {
    await reclassifySyndicats(dryRun)
    console.log('\n✅ Terminé')
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
