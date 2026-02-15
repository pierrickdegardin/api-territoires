/**
 * Script d'import des établissements FINESS (sanitaires et médico-sociaux)
 * Source: data.gouv.fr - Référentiel FINESS (t_finess) avec géolocalisation
 *
 * Usage:
 *   npx tsx scripts/import-finess.ts              # Import complet
 *   npx tsx scripts/import-finess.ts --dry-run    # Affiche stats sans importer
 *   npx tsx scripts/import-finess.ts --filter=CHU # Filtre par catégorie
 *
 * Types d'établissements importés:
 * - CHU/CHR (Centres Hospitaliers Régionaux/Universitaires)
 * - CH (Centres Hospitaliers)
 * - Cliniques
 * - Établissements médico-sociaux (EHPAD, IME, etc.)
 * - Centres de santé
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'

const prisma = new PrismaClient()

// URL du fichier t-finess.csv avec géolocalisation (AtlaSanté/DataSanté)
const FINESS_URL = 'https://www.data.gouv.fr/fr/datasets/r/796dfff7-cf54-493a-a0a7-ba3c2024c6f3'

// Catégories d'établissements sanitaires à importer
// Code catégorie FINESS (categ_code) -> Type de structure
const CATEGORIES_IMPORT: Record<string, string> = {
  // CHU/CHR
  '101': 'CHU', // Centre Hospitalier Régional (CHR)

  // Centres Hospitaliers
  '106': 'CH', // Centre Hospitalier (CH)
  '109': 'PSYCHIATRIE', // Centre Hospitalier Spécialisé (CHS)
  '114': 'CH', // Hôpital Local
  '122': 'CH', // Établissement de soins pluridisciplinaires
  '128': 'CLINIQUE', // Établissement de soins chirurgicaux
  '129': 'CLINIQUE', // Établissement de soins médicaux
  '141': 'CLINIQUE', // Centre Hospitalier Privé

  // Lutte contre le cancer
  '131': 'CANCER', // Centre de Lutte Contre le Cancer

  // Soins de suite et réadaptation
  '252': 'CLINIQUE', // SSR
  '253': 'CLINIQUE', // Centre de réadaptation fonctionnelle
  '255': 'CLINIQUE', // Maison de convalescence

  // HAD
  '246': 'HAD', // Hospitalisation À Domicile

  // Dialyse
  '238': 'DIALYSE', // Établissement de Dialyse

  // Imagerie médicale
  '289': 'IMAGERIE', // Centre de radiothérapie
  '292': 'IMAGERIE', // Laboratoire d'analyses médicales
  '295': 'IMAGERIE', // Centre d'imagerie médicale

  // Centres de santé
  '201': 'CENTRE_SANTE', // Maison de Santé
  '202': 'CENTRE_SANTE', // Centre de Santé
  '354': 'CENTRE_SANTE', // Maison de santé pluri-professionnelle
  '362': 'CENTRE_SANTE', // Centre de santé polyvalent
  '365': 'CENTRE_SANTE', // Centre de santé dentaire
  '366': 'CENTRE_SANTE', // Centre de santé médical
  '368': 'CENTRE_SANTE', // Centre de santé infirmier

  // Psychiatrie
  '370': 'PSYCHIATRIE', // CMPP
  '377': 'PSYCHIATRIE', // CMP
  '378': 'PSYCHIATRIE', // CATTP
  '379': 'PSYCHIATRIE', // Hôpital de jour psychiatrique
  '381': 'PSYCHIATRIE', // Unité d'hospitalisation à temps plein
  '382': 'PSYCHIATRIE', // Appartement thérapeutique
  '390': 'PSYCHIATRIE', // Établissement de post-cure psychiatrique
  '395': 'PSYCHIATRIE', // Centre de crise psychiatrique

  // Addictologie
  '219': 'ADDICTION', // CSAPA
  '221': 'ADDICTION', // CAARUD

  // EHPAD
  '411': 'EHPAD', // EHPAD
  '418': 'EHPAD', // Établissement pour personnes âgées autonomes
  '437': 'EHPAD', // Maison de retraite

  // Thermal
  '228': 'THERMAL', // Établissement Thermal

  // Médico-social
  '500': 'MEDICO_SOCIAL', // Hébergement adultes/familles en difficultés
  '501': 'MEDICO_SOCIAL', // Accueil mère-enfant
  '502': 'MEDICO_SOCIAL', // CHRS
}

// Types à importer (les plus prioritaires)
const TYPES_PRIORITAIRES = ['CHU', 'CH', 'CLINIQUE', 'CANCER', 'PSYCHIATRIE', 'HAD', 'EHPAD']

type FinessRecord = {
  source: string
  date_maj: string
  finess: string
  finess8: string
  etat: string
  date_extract_finess: string
  rs: string
  type: string
  ej_finess: string
  ej_rs: string
  et_finess: string
  et_rs: string
  siren: string
  siret: string
  date_autorisation: string
  date_ouverture: string
  date_maj_finess: string
  adresse_num_voie: string
  adresse_comp_voie: string
  adresse_type_voie: string
  adresse_nom_voie: string
  adresse_lieuditbp: string
  adresse_code_postal: string
  adresse_lib_routage: string
  telephone: string
  telecopie: string
  com_code: string
  categ_code: string
  categ_lib: string
  categ_lib_court: string
  geoloc_4326_long: string
  geoloc_4326_lat: string
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`Téléchargement de ${url}...`)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const buffer = await response.arrayBuffer()
  fs.writeFileSync(destPath, Buffer.from(buffer))
  console.log(`✓ Fichier téléchargé: ${destPath} (${(buffer.byteLength / 1024 / 1024).toFixed(1)} Mo)`)
}

function parseCSV(content: string): FinessRecord[] {
  const lines = content.split('\n')
  // Skip BOM if present and get headers
  let headerLine = lines[0]
  if (headerLine.startsWith('\ufeff')) {
    headerLine = headerLine.substring(1)
  }

  // Parse header
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''))

  const results: FinessRecord[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    // Parse CSV avec gestion des guillemets
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''))
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''))

    const obj: Record<string, string> = {}
    headers.forEach((header, idx) => {
      obj[header] = values[idx] || ''
    })

    results.push(obj as unknown as FinessRecord)
  }

  return results
}

function getDepartementCode(codePostal: string, comCode: string): string | null {
  // Utiliser le code commune INSEE
  if (comCode && comCode.length >= 2) {
    const dept = comCode.substring(0, 2)
    // DOM-TOM
    if (['97', '98'].includes(dept)) {
      return comCode.substring(0, 3)
    }
    return dept
  }

  // Fallback sur code postal
  if (codePostal && codePostal.length >= 2) {
    const cp = codePostal.substring(0, 2)
    if (cp === '97' || cp === '98') {
      return codePostal.substring(0, 3)
    }
    return cp
  }

  return null
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const filterArg = args.find((a) => a.startsWith('--filter='))
  const filter = filterArg?.split('=')[1]?.toUpperCase()
  const priorityOnly = args.includes('--priority')

  console.log('=== Import FINESS (Référentiel t_finess) ===')
  console.log(`Mode: ${dryRun ? "DRY RUN (pas d'import)" : 'IMPORT'}`)
  if (filter) console.log(`Filtre type: ${filter}`)
  if (priorityOnly) console.log(`Types prioritaires uniquement: ${TYPES_PRIORITAIRES.join(', ')}`)

  // Télécharger le fichier CSV
  const csvPath = '/tmp/t-finess.csv'

  if (!fs.existsSync(csvPath) || args.includes('--force-download')) {
    await downloadFile(FINESS_URL, csvPath)
  } else {
    const stats = fs.statSync(csvPath)
    console.log(`✓ Fichier CSV existant: ${csvPath} (${(stats.size / 1024 / 1024).toFixed(1)} Mo)`)
  }

  // Lire et parser le CSV
  console.log('\nParsing CSV...')
  const content = fs.readFileSync(csvPath, 'utf-8')
  const records = parseCSV(content)
  console.log(`✓ ${records.length} enregistrements dans le fichier`)

  // Filtrer les établissements actifs avec les catégories souhaitées
  const filtered = records.filter((r) => {
    // Exclure les établissements obsolètes
    if (r.etat === 'OBSOLETE') return false

    // Vérifier la catégorie
    const categCode = r.categ_code?.trim()
    if (!CATEGORIES_IMPORT[categCode]) return false

    const typeStructure = CATEGORIES_IMPORT[categCode]

    // Filtre par type si spécifié
    if (filter && typeStructure !== filter) return false

    // Filtre prioritaire si spécifié
    if (priorityOnly && !TYPES_PRIORITAIRES.includes(typeStructure)) return false

    return true
  })

  console.log(`✓ ${filtered.length} établissements après filtrage`)

  // Statistiques par type
  const stats: Record<string, number> = {}
  const statsGeo: Record<string, number> = {}
  for (const r of filtered) {
    const type = CATEGORIES_IMPORT[r.categ_code?.trim()] || 'AUTRE'
    stats[type] = (stats[type] || 0) + 1
    if (r.geoloc_4326_lat && r.geoloc_4326_long) {
      statsGeo[type] = (statsGeo[type] || 0) + 1
    }
  }

  console.log('\nStatistiques par type:')
  for (const [type, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    const geoCount = statsGeo[type] || 0
    console.log(`  ${type}: ${count} (${geoCount} géolocalisés)`)
  }

  if (dryRun) {
    console.log("\n=== DRY RUN - Pas d'import ===")

    // Afficher quelques exemples
    console.log('\nExemples (10 premiers CHU/CH):')
    const exemples = filtered
      .filter((r) => ['CHU', 'CH'].includes(CATEGORIES_IMPORT[r.categ_code?.trim()]))
      .slice(0, 10)

    for (const r of exemples) {
      const lat = r.geoloc_4326_lat ? parseFloat(r.geoloc_4326_lat).toFixed(4) : 'N/A'
      const lon = r.geoloc_4326_long ? parseFloat(r.geoloc_4326_long).toFixed(4) : 'N/A'
      console.log(
        `  - ${r.rs || r.et_rs} (${r.adresse_lib_routage}) - FINESS: ${r.finess}, SIREN: ${r.siren || 'N/A'}, GPS: ${lat},${lon}`
      )
    }

    await prisma.$disconnect()
    return
  }

  // Import dans la base de données
  console.log('\nImport dans la base de données...')

  let imported = 0
  let updated = 0
  let errors = 0

  for (const r of filtered) {
    try {
      const finess = r.finess?.trim()
      if (!finess || finess.length < 9) continue

      const type = CATEGORIES_IMPORT[r.categ_code?.trim()] as any
      const siren = r.siren?.trim() || null
      const nom = r.rs || r.et_rs || r.ej_rs || 'Établissement FINESS'

      // Construire l'adresse
      const adresseParts = [
        r.adresse_num_voie,
        r.adresse_type_voie,
        r.adresse_nom_voie,
        r.adresse_comp_voie,
        r.adresse_lieuditbp,
      ].filter(Boolean)
      const adresse = adresseParts.join(' ').trim() || null

      // Coordonnées
      const latitude = r.geoloc_4326_lat ? parseFloat(r.geoloc_4326_lat) : null
      const longitude = r.geoloc_4326_long ? parseFloat(r.geoloc_4326_long) : null

      // Département
      const deptCode = getDepartementCode(r.adresse_code_postal, r.com_code)

      // Upsert dans la table structure
      await prisma.structure.upsert({
        where: { finess },
        update: {
          nom,
          type,
          siren: siren && siren.length === 9 ? siren : null,
          departementCode: deptCode,
          adresse,
          codePostal: r.adresse_code_postal || null,
          ville: r.adresse_lib_routage || null,
          telephone: r.telephone || null,
          finessEj: r.ej_finess || null,
          categorieFiness: r.categ_lib || null,
          latitude: latitude && !isNaN(latitude) ? latitude : null,
          longitude: longitude && !isNaN(longitude) ? longitude : null,
          geoMode: latitude && longitude ? 'ADRESSE' : 'TERRITOIRE',
        },
        create: {
          nom,
          type,
          siren: siren && siren.length === 9 ? siren : null,
          departementCode: deptCode,
          adresse,
          codePostal: r.adresse_code_postal || null,
          ville: r.adresse_lib_routage || null,
          telephone: r.telephone || null,
          finess,
          finessEj: r.ej_finess || null,
          categorieFiness: r.categ_lib || null,
          latitude: latitude && !isNaN(latitude) ? latitude : null,
          longitude: longitude && !isNaN(longitude) ? longitude : null,
          geoMode: latitude && longitude ? 'ADRESSE' : 'TERRITOIRE',
        },
      })

      imported++
      if (imported % 1000 === 0) {
        console.log(`  ${imported} établissements traités...`)
      }
    } catch (error: any) {
      if (error.code === 'P2002') {
        updated++
      } else {
        errors++
        if (errors <= 5) {
          console.error(`  Erreur pour ${r.rs}: ${error.message}`)
        }
      }
    }
  }

  console.log('\n=== Résultat ===')
  console.log(`Traités: ${imported}`)
  console.log(`Erreurs: ${errors}`)

  // Statistiques finales
  const totalStructures = await prisma.structure.count()
  const finessStructures = await prisma.structure.count({
    where: { finess: { not: null } },
  })
  const geoStructures = await prisma.structure.count({
    where: {
      finess: { not: null },
      latitude: { not: null },
      longitude: { not: null },
    },
  })

  console.log(`\nTotal structures dans la base: ${totalStructures}`)
  console.log(`Structures avec FINESS: ${finessStructures}`)
  console.log(`Structures FINESS géolocalisées: ${geoStructures}`)

  await prisma.$disconnect()
}

main().catch(console.error)
