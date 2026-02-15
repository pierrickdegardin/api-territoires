import { PrismaClient, TypeStructure, SourceDonnees, StatutLaureat, GeoMode } from '@prisma/client'
import * as ExcelJS from 'exceljs'

const prisma = new PrismaClient()

// Mapping des régions
const regionMapping: Record<string, string> = {
  'Île-de-France': '11',
  'Ile-de-France': '11',
  'Centre-Val de Loire': '24',
  'Bourgogne-Franche-Comté': '27',
  Normandie: '28',
  'Hauts-de-France': '32',
  'Grand Est': '44',
  'Grand-Est': '44',
  'Pays de la Loire': '52',
  Bretagne: '53',
  'Nouvelle-Aquitaine': '75',
  Occitanie: '76',
  'Auvergne-Rhône-Alpes': '84',
  "Provence-Alpes-Côte d'Azur": '93',
  PACA: '93',
  Corse: '94',
  Guadeloupe: '01',
  Martinique: '02',
  Guyane: '03',
  'La Réunion': '04',
  Mayotte: '06',
  DROM: '01', // Guadeloupe par défaut pour DROM générique
  'Outre-mer': '00', // Marqueur spécial, on utilisera le département pour déterminer la région
}

// Mapping des types de structure vers l'enum TypeStructure
const typeStructureMapping: Record<string, TypeStructure> = {
  // EPCI
  EPCI: 'COMMUNAUTE_COMMUNES',
  CC: 'COMMUNAUTE_COMMUNES',
  'Communauté de communes': 'COMMUNAUTE_COMMUNES',
  CA: 'COMMUNAUTE_AGGLOMERATION',
  "Communauté d'agglomération": 'COMMUNAUTE_AGGLOMERATION',
  "Communauté d'Agglomération": 'COMMUNAUTE_AGGLOMERATION',
  CU: 'COMMUNAUTE_URBAINE',
  'Communauté urbaine': 'COMMUNAUTE_URBAINE',
  Métropole: 'METROPOLE',

  // Syndicats
  "Syndicat d'énergie": 'SYNDICAT_ENERGIE',
  "Syndicat d'Energie": 'SYNDICAT_ENERGIE',
  'Syndicat énergie': 'SYNDICAT_ENERGIE',
  SDE: 'SYNDICAT_ENERGIE',
  'Syndicat mixte': 'SYNDICAT_MIXTE',
  'Syndicat Mixte': 'SYNDICAT_MIXTE',
  Syndicat: 'SYNDICAT_INTERCOMMUNAL',
  'Syndicat des eaux': 'SYNDICAT_INTERCOMMUNAL',
  'Syndicat déchets': 'SYNDICAT_INTERCOMMUNAL',
  SIVOM: 'SYNDICAT_INTERCOMMUNAL',
  SIVU: 'SYNDICAT_INTERCOMMUNAL',
  SDIS: 'SDIS',

  // Collectivités territoriales
  Commune: 'COMMUNE',
  Département: 'CONSEIL_DEPARTEMENTAL',
  'Conseil départemental': 'CONSEIL_DEPARTEMENTAL',
  Région: 'CONSEIL_REGIONAL',
  'Conseil régional': 'CONSEIL_REGIONAL',

  // Énergie-Climat
  ALEC: 'ALEC',
  "Agence locale de l'énergie": 'ALEC',
  AREC: 'AREC',

  // Territoires
  PETR: 'PETR',
  "Pôle d'équilibre territorial": 'PETR',
  PNR: 'PNR',
  'Parc naturel régional': 'PNR',

  // Santé
  ARS: 'ARS',
  'Etablissements de santé': 'ETABLISSEMENT_SANITAIRE',
  'Etablissement de santé': 'ETABLISSEMENT_SANITAIRE',
  GHT: 'ETABLISSEMENT_SANITAIRE',
  'Groupement Hospitalier de Territoire': 'ETABLISSEMENT_SANITAIRE',
  'Etablissements médico-sociaux': 'ETABLISSEMENT_SANITAIRE',
  'Etablissement médico-social': 'ETABLISSEMENT_SANITAIRE',
  'Etablissements pour personnes âgées dépendantes': 'ETABLISSEMENT_SANITAIRE',
  EHPAD: 'ETABLISSEMENT_SANITAIRE',

  // Autres
  'Logement social': 'SPL',
  'Logements sociaux': 'SPL',
  'Office public habitat': 'SPL',
  OPH: 'SPL',
  'Etablissements scolaires': 'SPL',
  SPL: 'SPL',
  CCI: 'CCI',
  CCAS: 'CCAS',
  CIAS: 'CIAS',
  ATD: 'ATD',
}

// Mapping département vers région (pour les DOM-TOM notamment)
const deptToRegionMapping: Record<string, string> = {
  '971': '01', // Guadeloupe
  '972': '02', // Martinique
  '973': '03', // Guyane
  '974': '04', // La Réunion
  '976': '06', // Mayotte
}

function getRegionCode(regionName: string | undefined, deptCode?: string | null): string | null {
  if (!regionName) return null
  const normalized = regionName.trim()

  // Si c'est "Outre-mer", déduire la région du département
  if (normalized === 'Outre-mer' && deptCode) {
    return deptToRegionMapping[deptCode] || null
  }

  return regionMapping[normalized] || null
}

// Mapping des noms de départements vers les codes INSEE
const departementMapping: Record<string, string> = {
  // Auvergne-Rhône-Alpes (84)
  Ain: '01',
  Allier: '03',
  Ardèche: '07',
  Cantal: '15',
  Drôme: '26',
  Isère: '38',
  Loire: '42',
  'Haute-Loire': '43',
  'Puy-de-Dôme': '63',
  Rhône: '69',
  Savoie: '73',
  'Haute-Savoie': '74',
  // Bourgogne-Franche-Comté (27)
  "Côte-d'Or": '21',
  Doubs: '25',
  Jura: '39',
  Nièvre: '58',
  'Haute-Saône': '70',
  'Saône-et-Loire': '71',
  Yonne: '89',
  'Territoire de Belfort': '90',
  // Bretagne (53)
  "Côtes-d'Armor": '22',
  "Côtes d'Armor": '22',
  Finistère: '29',
  'Ille-et-Vilaine': '35',
  Morbihan: '56',
  // Centre-Val de Loire (24)
  Cher: '18',
  'Eure-et-Loir': '28',
  Indre: '36',
  'Indre-et-Loire': '37',
  'Loir-et-Cher': '41',
  Loiret: '45',
  // Corse (94)
  'Corse-du-Sud': '2A',
  'Haute-Corse': '2B',
  // Grand Est (44)
  Ardennes: '08',
  Aube: '10',
  Marne: '51',
  'Haute-Marne': '52',
  'Meurthe-et-Moselle': '54',
  Meuse: '55',
  Moselle: '57',
  'Bas-Rhin': '67',
  'Haut-Rhin': '68',
  Vosges: '88',
  // Hauts-de-France (32)
  Aisne: '02',
  Nord: '59',
  Oise: '60',
  'Pas-de-Calais': '62',
  Somme: '80',
  // Île-de-France (11)
  Paris: '75',
  'Seine-et-Marne': '77',
  Yvelines: '78',
  Essonne: '91',
  'Hauts-de-Seine': '92',
  'Seine-Saint-Denis': '93',
  'Val-de-Marne': '94',
  "Val-d'Oise": '95',
  "Val d'Oise": '95',
  "Val-D'Oise": '95',
  'Seine-St-Denis': '93',
  // Normandie (28)
  Calvados: '14',
  Eure: '27',
  Manche: '50',
  Orne: '61',
  'Seine-Maritime': '76',
  // Nouvelle-Aquitaine (75)
  Charente: '16',
  'Charente-Maritime': '17',
  Corrèze: '19',
  Creuse: '23',
  Dordogne: '24',
  Gironde: '33',
  Landes: '40',
  'Lot-et-Garonne': '47',
  'Pyrénées-Atlantiques': '64',
  'Deux-Sèvres': '79',
  Vienne: '86',
  'Haute-Vienne': '87',
  // Occitanie (76)
  Ariège: '09',
  Aude: '11',
  Aveyron: '12',
  Gard: '30',
  'Haute-Garonne': '31',
  Gers: '32',
  Hérault: '34',
  Lot: '46',
  Lozère: '48',
  'Hautes-Pyrénées': '65',
  'Pyrénées-Orientales': '66',
  Tarn: '81',
  'Tarn-et-Garonne': '82',
  // Pays de la Loire (52)
  'Loire-Atlantique': '44',
  'Maine-et-Loire': '49',
  Mayenne: '53',
  Sarthe: '72',
  Vendée: '85',
  // Provence-Alpes-Côte d'Azur (93)
  'Alpes-de-Haute-Provence': '04',
  'Hautes-Alpes': '05',
  'Alpes-Maritimes': '06',
  'Bouches-du-Rhône': '13',
  Var: '83',
  Vaucluse: '84',
  // DOM-TOM
  Guadeloupe: '971',
  Martinique: '972',
  Guyane: '973',
  'La Réunion': '974',
  Mayotte: '976',
  Réunion: '974',
}

function getDepartementCode(deptName: string | undefined): string | null {
  if (!deptName) return null
  let normalized = deptName.trim()

  // Si c'est une liste de départements (séparés par virgules), prendre le premier
  if (normalized.includes(',')) {
    normalized = normalized.split(',')[0].trim()
  }

  // D'abord essayer le mapping par nom
  if (departementMapping[normalized]) {
    return departementMapping[normalized]
  }

  // Extraire le numéro si présent (ex: "69 - Rhône" -> "69")
  const match = normalized.match(/^(\d{2,3})/)
  if (match) return match[1]

  return null
}

function getTypeStructure(typeName: string | undefined): TypeStructure {
  if (!typeName) return 'COMMUNAUTE_COMMUNES'
  const normalized = typeName.trim()
  return typeStructureMapping[normalized] || 'COMMUNAUTE_COMMUNES'
}

// Cache pour les structures créées
const structureCache = new Map<string, string>()

async function getOrCreateStructure(
  nom: string,
  type: TypeStructure,
  regionCode: string | null,
  departementCode: string | null
): Promise<string> {
  // Clé de cache basée sur le nom normalisé
  const cacheKey = `${nom.toLowerCase().trim()}-${type}`

  if (structureCache.has(cacheKey)) {
    return structureCache.get(cacheKey)!
  }

  // Chercher une structure existante par nom et type
  const existing = await prisma.structure.findFirst({
    where: {
      nom: { equals: nom, mode: 'insensitive' },
      type,
    },
  })

  if (existing) {
    structureCache.set(cacheKey, existing.id)
    return existing.id
  }

  // Créer une nouvelle structure
  const structure = await prisma.structure.create({
    data: {
      nom,
      type,
      geoMode: regionCode || departementCode ? 'TERRITOIRE' : 'ADRESSE',
      regionCode,
      departementCode,
    },
  })

  structureCache.set(cacheKey, structure.id)
  return structure.id
}

async function importActeePlus() {
  console.log('\n=== IMPORT ACTEE+ (Lauréats) ===')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile('/root/chene6/data/vue_detaillee_acteeplus.xlsx')
  const worksheet = workbook.worksheets[0]

  // Convertir en objets JSON
  const data: any[] = []
  const headers: string[] = []

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell) => {
        headers.push(cell.value?.toString() || '')
      })
    } else {
      const rowData: any = {}
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1]
        if (header) {
          rowData[header] = cell.value
        }
      })
      data.push(rowData)
    }
  })

  console.log(`Lignes à importer: ${data.length}`)
  if (data.length > 0) {
    console.log('Colonnes disponibles:', Object.keys(data[0]).slice(0, 15))
  }

  let created = 0,
    updated = 0,
    errors = 0,
    skipped = 0

  // Grouper par FolderID pour créer un lauréat par dossier
  const folderMap = new Map<string, any[]>()
  for (const row of data) {
    const folderId = String(row['FolderID'] || '')
    if (!folderId) continue
    if (!folderMap.has(folderId)) folderMap.set(folderId, [])
    folderMap.get(folderId)!.push(row)
  }

  console.log(`Dossiers uniques: ${folderMap.size}`)

  for (const [folderId, rows] of folderMap) {
    try {
      const first = rows[0]
      const nom = String(first['Coordinateur du groupement'] || first['Membres'] || `Dossier ${folderId}`).trim()
      const regionName = String(first['Région'] || '').trim()
      const deptName = String(first['Département'] || '').trim()
      const statut = String(first['Statut'] || '').trim()
      const aap = String(first['AAP'] || '').trim()
      const typeStruct = String(first['Type de structure'] || '').trim()

      // Calculer l'aide validée totale
      let aideValidee = 0
      for (const row of rows) {
        aideValidee += parseFloat(row['Aide validée jury'] || 0) || 0
      }

      const departementCode = getDepartementCode(deptName)
      const regionCode = getRegionCode(regionName, departementCode)

      // Vérifier que région et département existent
      if (!regionCode || !departementCode) {
        skipped++
        if (skipped <= 5) {
          console.log(`Skip ACTEE+ (pas de région/dept): ${folderId} - "${regionName}" / "${deptName}"`)
        }
        continue
      }

      // Vérifier que les codes existent en base
      const [regionExists, deptExists] = await Promise.all([
        prisma.region.findUnique({ where: { code: regionCode } }),
        prisma.departement.findUnique({ where: { code: departementCode } }),
      ])

      if (!regionExists || !deptExists) {
        skipped++
        continue
      }

      // Mapper le statut
      let statutLaureat: StatutLaureat = 'LAUREAT'
      if (statut.includes('Refusé') || statut.includes('refusé')) statutLaureat = 'NON_RETENU'
      else if (statut.includes('Abandonné') || statut.includes('abandonné')) statutLaureat = 'NON_RETENU'
      else if (statut.includes('Éligible') || statut.includes('éligible')) statutLaureat = 'ELIGIBLE'

      const laureatData = {
        nom,
        type: getTypeStructure(typeStruct),
        regionCode,
        departementCode,
        statut: statutLaureat,
        source: 'ACTEE_PLUS' as SourceDonnees,
        aap: aap || null,
        aideValidee: aideValidee > 0 ? aideValidee : null,
        commentaires: `FolderID: ${folderId}`,
      }

      // Chercher par commentaire FolderID
      const existing = await prisma.laureat.findFirst({
        where: { commentaires: { contains: `FolderID: ${folderId}` } },
      })

      if (existing) {
        await prisma.laureat.update({
          where: { id: existing.id },
          data: laureatData,
        })
        updated++
      } else {
        await prisma.laureat.create({ data: laureatData })
        created++
      }
    } catch (e: any) {
      errors++
      if (errors < 10) console.error(`Erreur ${folderId}: ${e.message}`)
    }
  }

  console.log(`Créés: ${created}, Mis à jour: ${updated}, Ignorés: ${skipped}, Erreurs: ${errors}`)
}

async function importDataExport2() {
  console.log('\n=== IMPORT DATA-EXPORT-2 (Lauréats CHENE6) ===')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile('/root/chene6/data/data-export-2.xlsx')
  const worksheet = workbook.worksheets[0]

  // Convertir en objets JSON
  const data: any[] = []
  const headers: string[] = []

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell) => {
        headers.push(cell.value?.toString() || '')
      })
    } else {
      const rowData: any = {}
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1]
        if (header) {
          rowData[header] = cell.value
        }
      })
      data.push(rowData)
    }
  })

  console.log(`Lignes à importer: ${data.length}`)
  if (data.length > 0) {
    console.log('Colonnes disponibles:', Object.keys(data[0]).slice(0, 15))
  }

  let created = 0,
    updated = 0,
    errors = 0,
    skipped = 0

  for (const row of data) {
    try {
      const folderId = String(row['FolderID'] || '')
      const nom = String(row['Nom du dossier'] || row['Membres'] || `Dossier ${folderId}`).trim()
      const regionName = String(row['Région'] || '').trim()
      const deptName = String(row['Département'] || '').trim()
      const statut = String(row['Statut'] || '').trim()
      const coutTotal = parseFloat(row['Coût total'] || 0) || null
      const aideLot1 = parseFloat(row['Aide sollicitée lot 1'] || 0) || 0
      const aideLot2 = parseFloat(row['Aide sollicitée lot 2'] || 0) || 0
      const aideLot3 = parseFloat(row['Aide sollicitée lot 3'] || 0) || 0
      const aideLot4 = parseFloat(row['Aide sollicitée lot 4'] || 0) || 0
      const aideLot5 = parseFloat(row['Aide sollicitée lot 5'] || 0) || 0
      const aideSollicitee =
        parseFloat(row['Total aide sollicitée'] || 0) || aideLot1 + aideLot2 + aideLot3 + aideLot4 + aideLot5

      const departementCode = getDepartementCode(deptName)
      const regionCode = getRegionCode(regionName, departementCode)

      // Vérifier que région et département existent
      if (!regionCode || !departementCode) {
        skipped++
        if (skipped <= 5) {
          console.log(`Skip CHENE6 (pas de région/dept): ${folderId} - "${regionName}" / "${deptName}"`)
        }
        continue
      }

      // Vérifier que les codes existent en base
      const [regionExists, deptExists] = await Promise.all([
        prisma.region.findUnique({ where: { code: regionCode } }),
        prisma.departement.findUnique({ where: { code: departementCode } }),
      ])

      if (!regionExists || !deptExists) {
        skipped++
        continue
      }

      // Mapper le statut
      let statutLaureat: StatutLaureat = 'LAUREAT'
      if (statut.includes('Refusé') || statut.includes('refusé')) statutLaureat = 'NON_RETENU'
      else if (statut.includes('Éligible') || statut.includes('éligible')) statutLaureat = 'ELIGIBLE'

      const laureatData = {
        nom,
        type: 'COMMUNAUTE_COMMUNES' as TypeStructure, // Default pour CHENE6
        regionCode,
        departementCode,
        statut: statutLaureat,
        source: 'CHENE6' as SourceDonnees,
        coutTotal,
        aideSollicitee: aideSollicitee > 0 ? aideSollicitee : null,
        lot1: aideLot1 > 0,
        lot2: aideLot2 > 0,
        lot3: aideLot3 > 0,
        lot4: aideLot4 > 0,
        lot5: aideLot5 > 0,
        commentaires: folderId ? `FolderID: ${folderId}` : null,
      }

      // Chercher par nom et région
      const existing = folderId
        ? await prisma.laureat.findFirst({
            where: { commentaires: { contains: `FolderID: ${folderId}` }, source: 'CHENE6' },
          })
        : await prisma.laureat.findFirst({ where: { nom, source: 'CHENE6' } })

      if (existing) {
        await prisma.laureat.update({
          where: { id: existing.id },
          data: laureatData,
        })
        updated++
      } else {
        await prisma.laureat.create({ data: laureatData })
        created++
      }
    } catch (e: any) {
      errors++
      if (errors < 10) console.error(`Erreur: ${e.message}`)
    }
  }

  console.log(`Créés: ${created}, Mis à jour: ${updated}, Ignorés: ${skipped}, Erreurs: ${errors}`)
}

async function main() {
  console.log('=== IMPORT DES DONNÉES ===')
  console.log('Date:', new Date().toISOString())

  // Vérifier les données de base
  const [regions, departements] = await Promise.all([prisma.region.count(), prisma.departement.count()])
  console.log(`Régions en base: ${regions}, Départements: ${departements}`)

  if (regions === 0 || departements === 0) {
    console.error('ERREUR: Les régions et départements doivent être importés en premier!')
    console.error('Exécutez: npx tsx scripts/import-territoires.ts --all')
    process.exit(1)
  }

  await importActeePlus()
  await importDataExport2()

  // Stats finales
  const [laureats, structures] = await Promise.all([prisma.laureat.count(), prisma.structure.count()])

  console.log('\n=== STATS FINALES ===')
  console.log(`Lauréats: ${laureats}`)
  console.log(`Structures: ${structures}`)
}

main()
  .catch((e) => {
    console.error('Erreur fatale:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
