/**
 * Import des CAUE depuis l'API Annuaire Service Public
 *
 * Source: https://lannuaire.service-public.gouv.fr/navigation/caue
 * API: https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records
 *
 * Cette source officielle contient les 93 CAUE de France avec leurs contacts complets.
 * Beaucoup plus fiable que l'API recherche-entreprises utilisée précédemment.
 *
 * Usage:
 *   npx tsx scripts/import-caue-annuaire.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const API_BASE =
  'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records'
const PAUSE_MS = parseInt(process.env.PAUSE_MS || '300')

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Structure d'un enregistrement de l'API Annuaire (champs JSON)
interface AnnuaireRecord {
  id: string
  siren?: string
  siret?: string
  nom: string
  adresse?: string // JSON string: [{type_adresse, numero_voie, code_postal, nom_commune, latitude, longitude}]
  code_postal?: string
  code_insee_commune?: string
  telephone?: string // JSON string: [{valeur, description}]
  adresse_courriel?: string // email direct
  site_internet?: string // JSON string: [{libelle, valeur}]
  latitude?: number
  longitude?: number
}

// Helper pour parser JSON string en sécurité
function safeJsonParse<T>(str: string | undefined | null): T | null {
  if (!str) return null
  try {
    return JSON.parse(str) as T
  } catch {
    return null
  }
}

// Extraire le premier téléphone du JSON
function extractTelephone(jsonStr: string | undefined): string | null {
  const arr = safeJsonParse<Array<{ valeur?: string }>>(jsonStr)
  if (arr && arr.length > 0 && arr[0].valeur) {
    return arr[0].valeur.replace(/\s/g, '').substring(0, 20)
  }
  return null
}

// Extraire le premier site web du JSON
function extractSiteWeb(jsonStr: string | undefined): string | null {
  const arr = safeJsonParse<Array<{ valeur?: string }>>(jsonStr)
  if (arr && arr.length > 0 && arr[0].valeur) {
    return arr[0].valeur.substring(0, 200)
  }
  return null
}

// Extraire l'adresse du JSON
function extractAdresse(jsonStr: string | undefined): {
  adresse: string | null
  codePostal: string | null
  ville: string | null
  lat: number | null
  lon: number | null
} {
  const arr = safeJsonParse<
    Array<{
      type_adresse?: string
      numero_voie?: string
      complement1?: string
      complement2?: string
      code_postal?: string
      nom_commune?: string
      latitude?: string
      longitude?: string
    }>
  >(jsonStr)

  if (!arr || arr.length === 0) {
    return { adresse: null, codePostal: null, ville: null, lat: null, lon: null }
  }

  // Préférer l'adresse physique, pas postale
  const addr = arr.find((a) => a.type_adresse === 'Adresse') || arr[0]

  const parts: string[] = []
  if (addr.numero_voie) parts.push(addr.numero_voie)
  if (addr.complement1) parts.push(addr.complement1)
  if (addr.complement2) parts.push(addr.complement2)

  return {
    adresse: parts.join(', ').substring(0, 200) || null,
    codePostal: addr.code_postal?.substring(0, 10) || null,
    ville: addr.nom_commune?.substring(0, 100) || null,
    lat: addr.latitude ? parseFloat(addr.latitude) : null,
    lon: addr.longitude ? parseFloat(addr.longitude) : null,
  }
}

interface ApiResponse {
  total_count: number
  results: AnnuaireRecord[]
}

// Mapping département -> code département
const DEPT_NAMES_TO_CODE: Record<string, string> = {
  // 01-09
  ain: '01',
  aisne: '02',
  allier: '03',
  'alpes-de-haute-provence': '04',
  'hautes-alpes': '05',
  'alpes-maritimes': '06',
  ardèche: '07',
  ardeche: '07',
  ardennes: '08',
  ariège: '09',
  ariege: '09',
  // 10-19
  aube: '10',
  aude: '11',
  aveyron: '12',
  'bouches-du-rhône': '13',
  'bouches-du-rhone': '13',
  calvados: '14',
  cantal: '15',
  charente: '16',
  'charente-maritime': '17',
  cher: '18',
  corrèze: '19',
  correze: '19',
  // Corse
  'corse-du-sud': '2A',
  'corse du sud': '2A',
  'haute-corse': '2B',
  'haute corse': '2B',
  // 21-29
  "côte-d'or": '21',
  "cote-d'or": '21',
  "cote d'or": '21',
  "côtes-d'armor": '22',
  "cotes-d'armor": '22',
  "cotes d'armor": '22',
  creuse: '23',
  dordogne: '24',
  doubs: '25',
  drôme: '26',
  drome: '26',
  eure: '27',
  'eure-et-loir': '28',
  'eure et loir': '28',
  finistère: '29',
  finistere: '29',
  // 30-39
  gard: '30',
  'haute-garonne': '31',
  'haute garonne': '31',
  gers: '32',
  gironde: '33',
  hérault: '34',
  herault: '34',
  'ille-et-vilaine': '35',
  'ille et vilaine': '35',
  indre: '36',
  'indre-et-loire': '37',
  'indre et loire': '37',
  isère: '38',
  isere: '38',
  jura: '39',
  // 40-49
  landes: '40',
  'loir-et-cher': '41',
  'loir et cher': '41',
  loire: '42',
  'haute-loire': '43',
  'haute loire': '43',
  'loire-atlantique': '44',
  'loire atlantique': '44',
  loiret: '45',
  lot: '46',
  'lot-et-garonne': '47',
  'lot et garonne': '47',
  lozère: '48',
  lozere: '48',
  'maine-et-loire': '49',
  'maine et loire': '49',
  // 50-59
  manche: '50',
  marne: '51',
  'haute-marne': '52',
  'haute marne': '52',
  mayenne: '53',
  'meurthe-et-moselle': '54',
  'meurthe et moselle': '54',
  meuse: '55',
  morbihan: '56',
  moselle: '57',
  nièvre: '58',
  nievre: '58',
  nord: '59',
  // 60-69
  oise: '60',
  orne: '61',
  'pas-de-calais': '62',
  'pas de calais': '62',
  'puy-de-dôme': '63',
  'puy-de-dome': '63',
  'puy de dome': '63',
  'pyrénées-atlantiques': '64',
  'pyrenees-atlantiques': '64',
  'pyrenees atlantiques': '64',
  'hautes-pyrénées': '65',
  'hautes-pyrenees': '65',
  'hautes pyrenees': '65',
  'pyrénées-orientales': '66',
  'pyrenees-orientales': '66',
  'pyrenees orientales': '66',
  'bas-rhin': '67',
  'bas rhin': '67',
  'haut-rhin': '68',
  'haut rhin': '68',
  alsace: '67', // Alsace = fusion 67+68, utilise 67 comme référence
  rhône: '69',
  rhone: '69',
  // 70-79
  'haute-saône': '70',
  'haute-saone': '70',
  'haute saone': '70',
  'saône-et-loire': '71',
  'saone-et-loire': '71',
  'saone et loire': '71',
  sarthe: '72',
  savoie: '73',
  'haute-savoie': '74',
  'haute savoie': '74',
  paris: '75',
  'seine-maritime': '76',
  'seine maritime': '76',
  'seine-et-marne': '77',
  'seine et marne': '77',
  yvelines: '78',
  'deux-sèvres': '79',
  'deux-sevres': '79',
  'deux sevres': '79',
  // 80-89
  somme: '80',
  tarn: '81',
  'tarn-et-garonne': '82',
  'tarn et garonne': '82',
  var: '83',
  vaucluse: '84',
  vendée: '85',
  vendee: '85',
  vienne: '86',
  'haute-vienne': '87',
  'haute vienne': '87',
  vosges: '88',
  yonne: '89',
  // 90-95
  'territoire de belfort': '90',
  belfort: '90',
  essonne: '91',
  'hauts-de-seine': '92',
  'hauts de seine': '92',
  'seine-saint-denis': '93',
  'seine saint denis': '93',
  'val-de-marne': '94',
  'val de marne': '94',
  "val-d'oise": '95',
  "val d'oise": '95',
  // DOM-TOM
  guadeloupe: '971',
  martinique: '972',
  guyane: '973',
  'la réunion': '974',
  'la reunion': '974',
  réunion: '974',
  reunion: '974',
  mayotte: '976',
}

/**
 * Extrait le code département du nom du CAUE
 * Format typique: "CAUE - Département - Ville" ou "CAUE du Département"
 */
function extractDeptFromName(nom: string): string | null {
  const nomLower = nom.toLowerCase()

  // Pattern: "CAUE - Département" ou "(CAUE) - Département"
  // Note: on capture tout après "CAUE) - " jusqu'à la fin ou le dernier tiret avant une ville
  const match = nom.match(/CAUE\)?\s*-\s*(.+?)(?:\s+-\s+[A-Z]|$)/i)
  if (match) {
    const deptPart = match[1]
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Enlever accents

    // Trier les noms de département par longueur décroissante pour matcher les composés d'abord
    const sortedDepts = Object.entries(DEPT_NAMES_TO_CODE).sort((a, b) => b[0].length - a[0].length)

    // Chercher une correspondance exacte d'abord
    for (const [deptName, code] of sortedDepts) {
      const deptNameNorm = deptName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      // Vérifier que c'est le bon département
      if (deptPart === deptNameNorm || deptPart === deptNameNorm.replace(/-/g, ' ')) {
        return code
      }
    }

    // Deuxième passe: chercher le département au début ou avec un espace après
    for (const [deptName, code] of sortedDepts) {
      const deptNameNorm = deptName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (deptPart.startsWith(deptNameNorm + ' ') || deptPart.startsWith(deptNameNorm.replace(/-/g, ' ') + ' ')) {
        return code
      }
    }

    // Troisième passe: chercher le département comme mot entier dans la partie extraite
    for (const [deptName, code] of sortedDepts) {
      const deptNameNorm = deptName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      // Éviter les faux positifs: "loiret" ne doit pas matcher "loire"
      const wordBoundary = new RegExp(`\\b${deptNameNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (wordBoundary.test(deptPart)) {
        return code
      }
    }
  }

  return null
}

/**
 * Extrait le code département du code INSEE commune
 */
function extractDeptFromInsee(codeInsee: string | undefined): string | null {
  if (!codeInsee) return null

  // Corse
  if (codeInsee.startsWith('2A') || codeInsee.startsWith('2B')) {
    return codeInsee.substring(0, 2)
  }

  // DOM-TOM (971, 972, 973, 974, 976)
  if (codeInsee.startsWith('97')) {
    return codeInsee.substring(0, 3)
  }

  // Métropole
  return codeInsee.substring(0, 2)
}

/**
 * Récupère tous les CAUE depuis l'API
 */
async function fetchAllCAUE(): Promise<AnnuaireRecord[]> {
  const allRecords: AnnuaireRecord[] = []
  let offset = 0
  const limit = 100
  let totalCount = 0

  console.log("   Récupération des CAUE depuis l'API annuaire...")

  do {
    const url = `${API_BASE}?limit=${limit}&offset=${offset}&where=nom%20like%20%22CAUE%22%20or%20nom%20like%20%22architecture%20urbanisme%22`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    const data: ApiResponse = await response.json()
    totalCount = data.total_count

    // Filtrer pour ne garder que les CAUE départementaux (pas les URCAUE)
    for (const record of data.results) {
      const nomUpper = record.nom.toUpperCase()

      // Exclure les unions régionales et autres non-CAUE
      if (
        nomUpper.includes('URCAUE') ||
        nomUpper.includes('UNION REGIONALE') ||
        nomUpper.includes('FEDERATION') ||
        !nomUpper.includes('CAUE')
      ) {
        continue
      }

      allRecords.push(record)
    }

    console.log(`   ... ${offset + data.results.length}/${totalCount} enregistrements traités`)

    offset += limit
    await sleep(PAUSE_MS)
  } while (offset < totalCount)

  return allRecords
}

/**
 * Import principal des CAUE
 */
async function importCAUE(dryRun: boolean): Promise<void> {
  console.log('\n=== Import des CAUE depuis Annuaire Service Public ===')

  const records = await fetchAllCAUE()
  console.log(`\n   ${records.length} CAUE trouvés`)

  // Dédupliquer par SIREN
  const uniqueByDept = new Map<string, AnnuaireRecord>()

  for (const record of records) {
    // Extraire le département
    const dept = extractDeptFromName(record.nom) || extractDeptFromInsee(record.code_insee_commune)

    if (!dept) {
      console.warn(`   ⚠️ Département non trouvé pour: ${record.nom}`)
      continue
    }

    // Ne garder qu'un CAUE par département (le premier trouvé)
    if (!uniqueByDept.has(dept)) {
      uniqueByDept.set(dept, { ...record, code_insee_commune: dept })
    }
  }

  console.log(`   ${uniqueByDept.size} CAUE uniques par département`)

  if (dryRun) {
    console.log('\n   Mode --dry-run: affichage sans modification\n')
    const depts = Array.from(uniqueByDept.keys()).sort((a, b) => {
      const numA = parseInt(a) || 999
      const numB = parseInt(b) || 999
      return numA - numB
    })
    for (const dept of depts) {
      const r = uniqueByDept.get(dept)!
      const siren = r.siren || r.siret?.substring(0, 9) || 'NO_SIREN'
      console.log(`   ${dept.padStart(3)}: ${siren} | ${r.nom.substring(0, 60)}`)
    }
    return
  }

  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const [dept, record] of uniqueByDept) {
    // Extraire SIREN (9 premiers chiffres du SIRET si pas de SIREN direct)
    let siren = record.siren
    if (!siren && record.siret) {
      siren = record.siret.substring(0, 9)
    }

    if (!siren) {
      // Générer un SIREN fictif basé sur le département pour les CAUE sans SIREN
      // Format: 9XXDDDDD0 où XXX = padding, DDD = département
      siren = `9${dept.padStart(5, '0')}000`.substring(0, 9)
      console.warn(`   ⚠️ SIREN généré pour CAUE ${dept}: ${siren}`)
    }

    try {
      // Vérifier si existe déjà
      const existing = await prisma.$queryRaw<Array<{ siren: string; type: string; nom: string }>>`
        SELECT siren, type::text, nom FROM groupement WHERE siren = ${siren}
      `

      // Nettoyer le nom
      const nomClean = record.nom.replace(/\s+/g, ' ').trim()

      // Préparer les données de contact (parser les champs JSON)
      const telephone = extractTelephone(record.telephone)
      const email = record.adresse_courriel?.substring(0, 100) || null
      const siteWeb = extractSiteWeb(record.site_internet)
      const adresseData = extractAdresse(record.adresse)
      const adresse = adresseData.adresse
      const codePostal = adresseData.codePostal
      const ville = adresseData.ville
      const lat = adresseData.lat ?? record.latitude ?? null
      const lon = adresseData.lon ?? record.longitude ?? null

      if (existing.length > 0) {
        // Mettre à jour si le type n'est pas déjà CAUE ou si des infos manquent
        if (existing[0].type !== 'CAUE') {
          await prisma.$executeRaw`
            UPDATE groupement SET
              type = 'CAUE'::type_groupement,
              nom = ${nomClean.substring(0, 300)},
              telephone = COALESCE(${telephone}, telephone),
              email = COALESCE(${email}, email),
              site_web = COALESCE(${siteWeb}, site_web),
              adresse = COALESCE(${adresse}, adresse),
              code_postal = COALESCE(${codePostal}, code_postal),
              ville = COALESCE(${ville}, ville),
              updated_at = NOW()
            WHERE siren = ${siren}
          `
          updated++
          console.log(`   ↻ ${siren} CAUE ${dept} mis à jour`)
        } else {
          // Mettre à jour les contacts si vides
          await prisma.$executeRaw`
            UPDATE groupement SET
              telephone = COALESCE(telephone, ${telephone}),
              email = COALESCE(email, ${email}),
              site_web = COALESCE(site_web, ${siteWeb}),
              adresse = COALESCE(adresse, ${adresse}),
              code_postal = COALESCE(code_postal, ${codePostal}),
              ville = COALESCE(ville, ${ville}),
              updated_at = NOW()
            WHERE siren = ${siren}
          `
          skipped++
        }
        continue
      }

      // Trouver le code région depuis le département
      const regionResult = await prisma.$queryRaw<Array<{ code_region: string }>>`
        SELECT code_region FROM departement WHERE code = ${dept.substring(0, 2)} OR code = ${dept}
      `
      const codeRegion = regionResult[0]?.code_region || null

      // Créer le CAUE
      await prisma.$executeRaw`
        INSERT INTO groupement (
          siren, nom, type, nature, code_region,
          telephone, email, site_web, adresse, code_postal, ville,
          latitude, longitude,
          created_at, updated_at
        )
        VALUES (
          ${siren},
          ${nomClean.substring(0, 300)},
          'CAUE'::type_groupement,
          ${'CAUE ' + dept},
          ${codeRegion},
          ${telephone},
          ${email},
          ${siteWeb},
          ${adresse},
          ${codePostal},
          ${ville},
          ${lat},
          ${lon},
          NOW(),
          NOW()
        )
        ON CONFLICT (siren) DO NOTHING
      `

      // Associer la géométrie du département
      await prisma.$executeRaw`
        UPDATE groupement SET
          geometry = (SELECT geometry FROM departement WHERE code = ${dept.length === 3 ? dept : dept.padStart(2, '0')}),
          centroid = COALESCE(
            CASE WHEN ${lon} IS NOT NULL AND ${lat} IS NOT NULL
              THEN ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
              ELSE NULL
            END,
            (SELECT centroid FROM departement WHERE code = ${dept.length === 3 ? dept : dept.padStart(2, '0')})
          )
        WHERE siren = ${siren}
      `

      // Créer un alias pour le matching
      const aliasNorm = nomClean
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      await prisma.$executeRaw`
        INSERT INTO alias (alias, alias_norm, code_officiel, type, source, created_at)
        VALUES (${nomClean}, ${aliasNorm}, ${siren}, 'groupement', 'annuaire-sp', NOW())
        ON CONFLICT DO NOTHING
      `

      created++
      console.log(`   ✓ ${siren} CAUE ${dept} - ${nomClean.substring(0, 50)}`)
    } catch (e: any) {
      errors++
      console.error(`   ✗ ${dept}: ${e.message?.substring(0, 80)}`)
    }
  }

  console.log(`\n   Résultat: ${created} créés, ${updated} mis à jour, ${skipped} inchangés, ${errors} erreurs`)
}

/**
 * Affiche les statistiques finales
 */
async function showStats(): Promise<void> {
  console.log('\n=== Statistiques CAUE ===')

  // Compter les CAUE
  const caueCount = await prisma.$queryRaw<Array<{ total: bigint; with_geom: bigint; with_contact: bigint }>>`
    SELECT
      COUNT(*) as total,
      COUNT(geometry) as with_geom,
      COUNT(NULLIF(telephone, '')) + COUNT(NULLIF(email, '')) as with_contact
    FROM groupement
    WHERE type = 'CAUE'
  `

  console.log(`   Total CAUE: ${caueCount[0].total}`)
  console.log(`   Avec géométrie: ${caueCount[0].with_geom}`)
  console.log(`   Avec contact: ${caueCount[0].with_contact}`)

  // Liste des départements couverts
  const covered = await prisma.$queryRaw<Array<{ nature: string }>>`
    SELECT nature FROM groupement WHERE type = 'CAUE' ORDER BY nature
  `

  const depts = covered
    .map((c) => c.nature?.replace('CAUE ', ''))
    .filter(Boolean)
    .sort((a, b) => {
      const numA = parseInt(a!) || 999
      const numB = parseInt(b!) || 999
      return numA - numB
    })

  console.log(`\n   Départements couverts (${depts.length}):`)
  console.log(`   ${depts.join(', ')}`)

  // Départements manquants
  const allDepts = [
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
    '10',
    '11',
    '12',
    '13',
    '14',
    '15',
    '16',
    '17',
    '18',
    '19',
    '2A',
    '2B',
    '21',
    '22',
    '23',
    '24',
    '25',
    '26',
    '27',
    '28',
    '29',
    '30',
    '31',
    '32',
    '33',
    '34',
    '35',
    '36',
    '37',
    '38',
    '39',
    '40',
    '41',
    '42',
    '43',
    '44',
    '45',
    '46',
    '47',
    '48',
    '49',
    '50',
    '51',
    '52',
    '53',
    '54',
    '55',
    '56',
    '57',
    '58',
    '59',
    '60',
    '61',
    '62',
    '63',
    '64',
    '65',
    '66',
    '67',
    '68',
    '69',
    '70',
    '71',
    '72',
    '73',
    '74',
    '75',
    '76',
    '77',
    '78',
    '79',
    '80',
    '81',
    '82',
    '83',
    '84',
    '85',
    '86',
    '87',
    '88',
    '89',
    '90',
    '91',
    '92',
    '93',
    '94',
    '95',
    '971',
    '972',
    '973',
    '974',
    '976',
  ]

  const missing = allDepts.filter((d) => !depts.includes(d) && d !== '68') // 68 fusionné avec 67 (Alsace)

  if (missing.length > 0) {
    console.log(`\n   Départements sans CAUE (${missing.length}):`)
    console.log(`   ${missing.join(', ')}`)
  }
}

/**
 * Point d'entrée principal
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║   Import CAUE depuis Annuaire Service Public           ║')
  console.log('║   Source: lannuaire.service-public.gouv.fr             ║')
  console.log('╚════════════════════════════════════════════════════════╝')

  if (dryRun) {
    console.log('\n⚠️  Mode simulation (--dry-run): aucune modification\n')
  }

  const startTime = Date.now()

  try {
    await importCAUE(dryRun)

    if (!dryRun) {
      await showStats()
    }

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
