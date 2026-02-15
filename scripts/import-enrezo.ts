/**
 * Import EnRezo data from CEREMA WFS services
 *
 * Data sources:
 * - Gisements chaleur: incinération, industrie, STEP, datacenter
 * - Installations production: chaufferies bois, solaire thermique, électrogène
 * - Plateformes stockage bois
 * - Réseaux chaleur/froid
 * - Zones d'opportunités
 *
 * Usage:
 *   npx tsx scripts/import-enrezo.ts --all
 *   npx tsx scripts/import-enrezo.ts --gisements
 *   npx tsx scripts/import-enrezo.ts --installations
 *   npx tsx scripts/import-enrezo.ts --reseaux
 *   npx tsx scripts/import-enrezo.ts --zones
 */

import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// WFS Configuration
const WFS_BASE = 'https://cartagene.cerema.fr/server/services'

interface WfsConfig {
  url: string
  typeName: string
  crs: string
}

const WFS_SERVICES: Record<string, WfsConfig> = {
  // Gisements chaleur
  chaleur_incineration: {
    url: `${WFS_BASE}/Hosted/enrezo_chaleur_fatale_incineration/MapServer/WFSServer`,
    typeName: 'enrezo_chaleur_fatale_incineration:EnRezo_chaleur_fatale_incineration',
    crs: 'EPSG:4326',
  },
  gisement_industrie: {
    url: `${WFS_BASE}/Hosted/enrezo_gisement_industrie/MapServer/WFSServer`,
    typeName: 'enrezo_gisement_industrie:referentiels.c_2025_enrezo_prod.gisement_industrie_2025',
    crs: 'EPSG:4326',
  },
  gisement_step: {
    url: `${WFS_BASE}/Hosted/enrezo_gisement_step/MapServer/WFSServer`,
    typeName: 'enrezo_gisement_step:gisement_step_20250902',
    crs: 'EPSG:4326',
  },
  gisement_datacenter: {
    url: `${WFS_BASE}/Hosted/enrezo_gisement_datacenter/MapServer/WFSServer`,
    typeName: 'enrezo_gisement_datacenter:referentiels.c_2025_enrezo_prod.gisement_datacenter_2025',
    crs: 'EPSG:4326',
  },

  // Installations production
  chaufferies_bois: {
    url: `${WFS_BASE}/Hosted/EnRezo_chaufferies_bois/MapServer/WFSServer`,
    typeName: 'EnRezo_chaufferies_bois:EnRezo_BDD_CHAU-BOIS',
    crs: 'EPSG:4326',
  },
  solaire_thermique: {
    url: `${WFS_BASE}/Hosted/enrezo_solaire_thermique_instal/MapServer/WFSServer`,
    typeName: 'enrezo_solaire_thermique_instal:solaire_thermique_instal',
    crs: 'EPSG:4326',
  },
  install_electrogene: {
    url: `${WFS_BASE}/Hosted/EnRezo_install_electrogene/MapServer/WFSServer`,
    typeName: 'EnRezo_install_electrogene:EnRezo_install_electogene',
    crs: 'EPSG:4326',
  },

  // Plateformes stockage
  plateformes_bois: {
    url: `${WFS_BASE}/Hosted/EnRezo_plateformes_stockage_bois/MapServer/WFSServer`,
    typeName: 'EnRezo_plateformes_stockage_bois:EnRezo_BDD_PF-BOIS',
    crs: 'EPSG:4326',
  },

  // Réseaux chaleur/froid
  reseaux_chaleur: {
    url: `${WFS_BASE}/Hosted/Recensement_des_réseaux_de_chaleur_et_de_froid/MapServer/WFSServer`,
    typeName: 'Recensement_des_réseaux_de_chaleur_et_de_froid:Réseaux_de_chaleur',
    crs: 'EPSG:4326',
  },
  reseaux_froid: {
    url: `${WFS_BASE}/Hosted/Recensement_des_réseaux_de_chaleur_et_de_froid/MapServer/WFSServer`,
    typeName: 'Recensement_des_réseaux_de_chaleur_et_de_froid:Réseaux_de_froid',
    crs: 'EPSG:4326',
  },
  reseaux_construction: {
    url: `${WFS_BASE}/Hosted/Recensement_des_réseaux_de_chaleur_et_de_froid/MapServer/WFSServer`,
    typeName: 'Recensement_des_réseaux_de_chaleur_et_de_froid:Réseaux_en_construction',
    crs: 'EPSG:4326',
  },
  perimetres_prioritaires: {
    url: `${WFS_BASE}/Hosted/Recensement_des_réseaux_de_chaleur_et_de_froid/MapServer/WFSServer`,
    typeName: 'Recensement_des_réseaux_de_chaleur_et_de_froid:Périmètres_de_développement_prioritaires__PDP_',
    crs: 'EPSG:4326',
  },

  // Zones d'opportunités
  zone_chaleur_fort: {
    url: `${WFS_BASE}/Hosted/Zones_d_opportunités/MapServer/WFSServer`,
    typeName: 'Zones_d_opportunités:Chaleur_-__fort_potentiel_',
    crs: 'EPSG:4326',
  },
  zone_chaleur: {
    url: `${WFS_BASE}/Hosted/Zones_d_opportunités/MapServer/WFSServer`,
    typeName: 'Zones_d_opportunités:Chaleur_-__potentiel_',
    crs: 'EPSG:4326',
  },
  zone_froid_fort: {
    url: `${WFS_BASE}/Hosted/Zones_d_opportunités/MapServer/WFSServer`,
    typeName: 'Zones_d_opportunités:Froid_-__fort_potentiel_',
    crs: 'EPSG:4326',
  },
  zone_froid: {
    url: `${WFS_BASE}/Hosted/Zones_d_opportunités/MapServer/WFSServer`,
    typeName: 'Zones_d_opportunités:Froid_-__potentiel_',
    crs: 'EPSG:4326',
  },
}

// Fetch GeoJSON from WFS
async function fetchWfsGeoJson(config: WfsConfig, maxFeatures = 50000): Promise<any> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName: config.typeName,
    outputFormat: 'GEOJSON',
    srsName: config.crs,
    count: maxFeatures.toString(),
  })

  const url = `${config.url}?${params.toString()}`
  console.log(`  Fetching: ${config.typeName}...`)

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`WFS error: ${response.status} ${response.statusText}`)
  }

  // Get text and clean invalid JSON (nan values)
  let text = await response.text()
  text = text.replace(/:\s*nan\b/gi, ':null')
  text = text.replace(/\[nan,nan\]/gi, '[null,null]')

  const data = JSON.parse(text)
  console.log(`  → ${data.features?.length || 0} features`)
  return data
}

// Extract coordinates from GeoJSON geometry (centroid for polygons/lines)
function extractCoordinates(geometry: any): { latitude: number | null; longitude: number | null } {
  if (!geometry) return { latitude: null, longitude: null }

  if (geometry.type === 'Point') {
    return {
      longitude: geometry.coordinates[0],
      latitude: geometry.coordinates[1],
    }
  }

  // For LineString, compute centroid of all points
  if (geometry.type === 'LineString') {
    const coords = geometry.coordinates
    if (coords && coords.length > 0) {
      const sumLon = coords.reduce((acc: number, c: number[]) => acc + c[0], 0)
      const sumLat = coords.reduce((acc: number, c: number[]) => acc + c[1], 0)
      return {
        longitude: sumLon / coords.length,
        latitude: sumLat / coords.length,
      }
    }
  }

  // For MultiLineString, compute centroid of first line
  if (geometry.type === 'MultiLineString') {
    const coords = geometry.coordinates[0]
    if (coords && coords.length > 0) {
      const sumLon = coords.reduce((acc: number, c: number[]) => acc + c[0], 0)
      const sumLat = coords.reduce((acc: number, c: number[]) => acc + c[1], 0)
      return {
        longitude: sumLon / coords.length,
        latitude: sumLat / coords.length,
      }
    }
  }

  // For Polygon, compute centroid of outer ring
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates[0]
    if (coords && coords.length > 0) {
      const sumLon = coords.reduce((acc: number, c: number[]) => acc + c[0], 0)
      const sumLat = coords.reduce((acc: number, c: number[]) => acc + c[1], 0)
      return {
        longitude: sumLon / coords.length,
        latitude: sumLat / coords.length,
      }
    }
  }

  // For MultiPolygon, compute centroid of first polygon's outer ring
  if (geometry.type === 'MultiPolygon') {
    const coords = geometry.coordinates[0]?.[0]
    if (coords && coords.length > 0) {
      const sumLon = coords.reduce((acc: number, c: number[]) => acc + c[0], 0)
      const sumLat = coords.reduce((acc: number, c: number[]) => acc + c[1], 0)
      return {
        longitude: sumLon / coords.length,
        latitude: sumLat / coords.length,
      }
    }
  }

  return { latitude: null, longitude: null }
}

// Get code département from code INSEE
function getCodeDept(codeInsee: string | null): string | null {
  if (!codeInsee) return null
  if (codeInsee.startsWith('97')) return codeInsee.substring(0, 3)
  return codeInsee.substring(0, 2)
}

// ============================================
// IMPORT GISEMENTS CHALEUR
// ============================================
async function importGisementIncineration() {
  console.log('\n📥 Importing gisements chaleur incinération...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.chaleur_incineration)

  // Clear existing
  await prisma.gisementChaleur.deleteMany({ where: { type: 'INCINERATION' } })

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)
    const codeInsee = props.INSEE_COM?.toString().padStart(5, '0')

    await prisma.gisementChaleur.create({
      data: {
        type: 'INCINERATION',
        nom: props.NOM_INST || 'Installation sans nom',
        codeInsee,
        commune: props.NOM_COMM,
        codeDepartement: props.CODE_DEP?.toString().padStart(2, '0') || getCodeDept(codeInsee),
        typeInstallation: props.TYPE_INST,
        potentielChaleurBtMin: props.MIN_PRD_CR,
        potentielChaleurBtMax: props.MAX_PRD_CR,
        potentielAnnuel: props.MAX_PRD_CR,
        latitude: coords.latitude,
        longitude: coords.longitude,
        commentaire: props.COMT,
        source: 'CEREMA EnRezo',
      },
    })
    count++
  }

  console.log(`  ✅ ${count} gisements incinération importés`)
}

async function importGisementIndustrie() {
  console.log('\n📥 Importing gisements industrie...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.gisement_industrie)

  await prisma.gisementChaleur.deleteMany({ where: { type: 'INDUSTRIE' } })

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)
    const codeInsee = props.Code_commune?.toString().padStart(5, '0')

    await prisma.gisementChaleur.create({
      data: {
        type: 'INDUSTRIE',
        identifiant: props.Identifiant_ICPE,
        nom: props.Nom_de_l_établissemen || props['Nom_de_l_établissement'] || 'Établissement sans nom',
        codeInsee,
        commune: props.Nom_commune,
        codeDepartement: props.Code_département?.toString().padStart(2, '0') || getCodeDept(codeInsee),
        adresse: props.Adresse,
        siret: props.Siret,
        rubriquesIcpe: props.Rubrique_ICPE?.toString(),
        activitePrincipale: props.Activité_principale_de_l_entreprise,
        potentielChaleurBtMin: props['Potentiel_de_chaleur_récupérable_en_Basse_Température_...fourchette_basse'],
        potentielChaleurBtMax: props['Potentiel_de_chaleur_récupérable_en_Basse_Température_...fourchette_haute'],
        potentielChaleurHtMin: props['Potentiel_de_chaleur_récupérable_en_Haute_Température_...fourchette_basse'],
        potentielChaleurHtMax: props['Potentiel_de_chaleur_récupérable_en_Haute_Température_...fourchette_haute'],
        qualiteLocalisation: props.Précision_de_la_localisation,
        latitude: coords.latitude,
        longitude: coords.longitude,
        source: 'CEREMA EnRezo - ICPE',
      },
    })
    count++
  }

  console.log(`  ✅ ${count} gisements industrie importés`)
}

async function importGisementStep() {
  console.log('\n📥 Importing gisements STEP...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.gisement_step)

  await prisma.gisementChaleur.deleteMany({ where: { type: 'STEP' } })

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)
    const codeInsee = props.code_insee?.toString().padStart(5, '0')

    await prisma.gisementChaleur.create({
      data: {
        type: 'STEP',
        identifiant: props.Identifiant_de_la_STEP || props.Code_sandre,
        nom: props.Nom_de_la_STEP || 'STEP sans nom',
        codeInsee,
        commune: props.commune,
        codeDepartement: props.dept?.toString().padStart(2, '0') || getCodeDept(codeInsee),
        // codeRegion omitted - props.reg is region name, not code
        operateur: props.exploitant?.substring(0, 300),
        moa: props.MOA?.substring(0, 300),
        capaciteEh: props['Capacité_nominale_en_équivalent_habitant__EH_'],
        debitMoyenM3j: props['Débit_sortant_moyen_estimé_m3_j'],
        tempMoyAnnuelle: props.temp_moy_annuel,
        potentielAnnuel: props['Chaleur_fatale_annuelle__MWh_an__valorisable_en_sortie_de_STEP'],
        anneeReference: props.Année_de_la_donnée,
        latitude: coords.latitude,
        longitude: coords.longitude,
        source: 'CEREMA EnRezo - SANDRE',
      },
    })
    count++
  }

  console.log(`  ✅ ${count} gisements STEP importés`)
}

async function importGisementDatacenter() {
  console.log('\n📥 Importing gisements datacenter...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.gisement_datacenter)

  await prisma.gisementChaleur.deleteMany({ where: { type: 'DATACENTER' } })

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)

    // Potentiel en GWh/an → convertir en MWh/an
    const potentielGwh = props['Potentiel_estimé__Tier_III___GWh_an_']

    await prisma.gisementChaleur.create({
      data: {
        type: 'DATACENTER',
        identifiant: props.Identifiant,
        nom: props.Nom_ || props['Nom'] || 'Datacenter sans nom',
        commune: props.Commune,
        operateur: props.Opérateur,
        typeInstallation: props.Usage_du_bâtiment,
        potentielAnnuel: potentielGwh ? potentielGwh * 1000 : null,
        niveauConfiance: props.Confiance,
        latitude: coords.latitude,
        longitude: coords.longitude,
        source: props.Source || 'CEREMA EnRezo',
      },
    })
    count++
  }

  console.log(`  ✅ ${count} gisements datacenter importés`)
}

// ============================================
// IMPORT INSTALLATIONS PRODUCTION
// ============================================
// Helper to safely parse numbers
function parseNum(val: any): number | null {
  if (val === null || val === undefined || val === '') return null
  const num = parseFloat(val)
  return isNaN(num) ? null : num
}

function parseInt_(val: any): number | null {
  if (val === null || val === undefined || val === '') return null
  const num = parseInt(val, 10)
  return isNaN(num) ? null : num
}

async function importChaufferiesBois() {
  console.log('\n📥 Importing chaufferies bois...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.chaufferies_bois)

  await prisma.installationProduction.deleteMany({ where: { type: 'CHAUFFERIE_BOIS' } })

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)
    const codeInsee = props.CODE_INSEE?.toString().padStart(5, '0')

    await prisma.installationProduction.create({
      data: {
        type: 'CHAUFFERIE_BOIS',
        identifiant: props.ID_CIBE || null,
        nom: props.NOM_INST || 'Chaufferie sans nom',
        codeInsee,
        commune: props.NOM_COM,
        codeDepartement: props.CODE_DEP?.toString().padStart(2, '0') || getCodeDept(codeInsee),
        // codeRegion omitted - props.NOM_REG is region name, not code

        moa: props.MOA?.substring(0, 300) || null,
        typeMoa: props.TYPE_MOA || null,
        gestionnaire: props.GEST?.substring(0, 300) || null,
        exploitant: props.EXPL?.substring(0, 300) || null,
        modeGestion: props.MODE_GEST || null,

        anneeMiseService: parseInt_(props.ANNEE_MES),
        statut: props.STATUT || null,
        secteur: props.SECTEUR || null,
        sousSecteur: props.SOUS_SECT || null,
        combustible: props.NRJ_PRINC || null,

        puissanceTotaleKw: parseNum(props.PUISTOTKWT),
        puissanceBoisKw: parseNum(props.PUI_B_KW),
        nbChaudieres: parseInt_(props.NB_CHD),

        productionMwhAn: parseNum(props.PROD_MWH),
        productionEnrMwh: parseNum(props.PR_MWH_ENR),
        consoBoisTonnes: parseNum(props.CONSOBOIST),
        consoTotale: parseNum(props.CONS_TOT),
        tauxCouvertureBois: parseNum(props.TX_COUV_BS),
        tauxEnr: parseNum(props.TAUX_ENRR),

        reseauChaleur: props.R_O_N === 'O' || props.RC_TYPE != null,
        longueurReseauM: parseNum(props.LONG_RC),
        nbSousStations: parseInt_(props.NB_SS),

        latitude: coords.latitude,
        longitude: coords.longitude,
        qualiteXy: props.QUAL_XY?.toString() || null,
        source: props.SOURCE || 'CEREMA EnRezo - CIBE',
      },
    })
    count++
  }

  console.log(`  ✅ ${count} chaufferies bois importées`)
}

async function importSolaireThermique() {
  console.log('\n📥 Importing installations solaire thermique...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.solaire_thermique)

  await prisma.installationProduction.deleteMany({ where: { type: 'SOLAIRE_THERMIQUE' } })

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)

    await prisma.installationProduction.create({
      data: {
        type: 'SOLAIRE_THERMIQUE',
        nom: props.NOM_INSTAL || 'Installation solaire',
        commune: props.COM_NOM,
        moa: props.PROPRIETAI?.substring(0, 300) || null,
        anneeMiseService: parseInt_(props.DEBUT_EXPL),
        usage: props.USAGE || null,
        typeCapteur: props.TYPE_CAPT || null,
        surfaceCapteurM2: parseNum(props.SURFCAP_M),
        stockageM3: parseNum(props.STOCK_M3),
        capaciteKwhTh: parseNum(props.CAPA_KWHTH),
        productionMwhAn: parseNum(props.PRODAN_MWH),
        latitude: coords.latitude,
        longitude: coords.longitude,
        qualiteXy: props.QUALITE_XY?.toString() || null,
        source: props.SOURCE || 'CEREMA EnRezo',
      },
    })
    count++
  }

  console.log(`  ✅ ${count} installations solaire thermique importées`)
}

async function importInstallElectrogene() {
  console.log('\n📥 Importing installations électrogènes...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.install_electrogene)

  await prisma.installationProduction.deleteMany({ where: { type: 'ELECTROGENE' } })

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)
    const codeInsee = props.INSEE_COMM?.toString().padStart(5, '0')

    const puisMax = parseNum(props.PUIS_MAX_)

    await prisma.installationProduction.create({
      data: {
        type: 'ELECTROGENE',
        nom: props.NOM_INSTAL || 'Installation électrogène',
        codeInsee,
        commune: props.NOM_COMM,
        codeDepartement: getCodeDept(codeInsee),

        filiere: props.FILIERE || null,
        combustible: props.COMBUST || null,
        combustible2: props.COMBUST2 || null,
        technologie: props.TECHNO || null,
        regime: props.REGIME || null,

        puissanceTotaleKw: puisMax ? puisMax * 1000 : null, // MW to kW
        energieInjecteeGwh: parseNum(props.ENEGL_INJ),
        energieProduiteGwh: parseNum(props.ENEGL_PROD),
        anneeMiseService: parseInt_(props.DATE_SERV),

        latitude: coords.latitude,
        longitude: coords.longitude,
        qualiteXy: props.QUAL?.toString() || null,
        source: 'CEREMA EnRezo',
      },
    })
    count++
  }

  console.log(`  ✅ ${count} installations électrogènes importées`)
}

// ============================================
// IMPORT PLATEFORMES STOCKAGE BOIS
// ============================================
async function importPlateformesBois() {
  console.log('\n📥 Importing plateformes stockage bois...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.plateformes_bois)

  await prisma.plateformeStockageBois.deleteMany()

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)
    const codeInsee = props.CODE_INSEE?.toString().padStart(5, '0')

    await prisma.plateformeStockageBois.create({
      data: {
        nom: props.NM_INS_APR || 'Plateforme',
        codeInsee,
        commune: props.NOM_COM,
        codeDepartement: props.CODE_DEP?.toString().padStart(2, '0') || getCodeDept(codeInsee),
        adresse: props.ADRESSE?.substring(0, 500) || null,

        typePlateforme: props.TYPE_PT || null,
        typeMoa: props.TYPE_MOA || null,
        categorie: props.CAT || null,
        capaciteTonnes: parseInt_(props.CAPA_TON),
        categorieCapacite: props.CAT_CAPA || null,
        typeCombustible: props.TYPE_COMB || null,
        surfaceStockage: props.SURF_STOCK || null,
        certification: props.CERTIF || null,
        qualification: props.QUALIF || null,

        latitude: coords.latitude,
        longitude: coords.longitude,
        qualiteXy: props.QUAL_XY?.toString() || null,
        source: props.SOURCE || 'CEREMA EnRezo',
      },
    })
    count++
  }

  console.log(`  ✅ ${count} plateformes stockage bois importées`)
}

// ============================================
// IMPORT RESEAUX CHALEUR/FROID
// ============================================
async function importReseauxChaleur() {
  console.log('\n📥 Importing réseaux de chaleur...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.reseaux_chaleur)

  await prisma.reseauChaleurFroid.deleteMany({ where: { type: 'CHALEUR' } })

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)

    const record = await prisma.reseauChaleurFroid.create({
      data: {
        type: 'CHALEUR',
        identifiant: props.identifian,
        nom: props.nom_reseau || 'Réseau sans nom',
        gestionnaire: props.gestionnai,
        mo: props.mo,
        classement: props.classement,
        productionMwh: props.production ? parseFloat(props.production) : null,
        livraisonsMwh: props.livraisons ? parseFloat(props.livraisons) : null,
        rendement: props.rend ? parseFloat(props.rend) : null,
        tauxEnr: props.taux_enr ? parseFloat(props.taux_enr) : null,
        longueurKm: props.longueur_r ? parseFloat(props.longueur_r) : null,
        nbPointsLivraison: props.nb_pdl ? parseInt(props.nb_pdl) : null,
        vapeur: props.vapeur === 'O' || props.vapeur === 'Oui',
        eauChaude: props.eau_chaude === 'O' || props.eau_chaude === 'Oui',
        eauSurchauffee: props.eau_surcha === 'O' || props.eau_surcha === 'Oui',
        latitude: coords.latitude,
        longitude: coords.longitude,
        source: 'CEREMA EnRezo - Recensement RCF',
      },
    })
    count++

    // Store geometry via raw SQL
    if (feature.geometry && coords.latitude && coords.longitude) {
      const geomJson = JSON.stringify(feature.geometry)
      await prisma.$executeRawUnsafe(
        `
        UPDATE reseau_chaleur_froid
        SET geometry = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
        WHERE id = $2
      `,
        geomJson,
        record.id
      )
    }
  }

  console.log(`  ✅ ${count} réseaux de chaleur importés`)
}

async function importReseauxFroid() {
  console.log('\n📥 Importing réseaux de froid...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.reseaux_froid)

  await prisma.reseauChaleurFroid.deleteMany({ where: { type: 'FROID' } })

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)

    const record = await prisma.reseauChaleurFroid.create({
      data: {
        type: 'FROID',
        identifiant: props.identifian,
        nom: props.nom_reseau || 'Réseau sans nom',
        gestionnaire: props.gestionnai,
        mo: props.mo,
        productionMwh: props.production ? parseFloat(props.production) : null,
        livraisonsMwh: props.livraisons ? parseFloat(props.livraisons) : null,
        rendement: props.rend ? parseFloat(props.rend) : null,
        longueurKm: props.longueur_r ? parseFloat(props.longueur_r) : null,
        nbPointsLivraison: props.nb_pdl ? parseInt(props.nb_pdl) : null,
        latitude: coords.latitude,
        longitude: coords.longitude,
        source: 'CEREMA EnRezo - Recensement RCF',
      },
    })
    count++

    // Store geometry via raw SQL
    if (feature.geometry && coords.latitude && coords.longitude) {
      const geomJson = JSON.stringify(feature.geometry)
      await prisma.$executeRawUnsafe(
        `
        UPDATE reseau_chaleur_froid
        SET geometry = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
        WHERE id = $2
      `,
        geomJson,
        record.id
      )
    }
  }

  console.log(`  ✅ ${count} réseaux de froid importés`)
}

async function importReseauxConstruction() {
  console.log('\n📥 Importing réseaux en construction...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.reseaux_construction)

  await prisma.reseauChaleurFroid.deleteMany({ where: { type: 'CONSTRUCTION' } })

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)

    const record = await prisma.reseauChaleurFroid.create({
      data: {
        type: 'CONSTRUCTION',
        nom: props.communes || 'Réseau en construction',
        communes: props.communes,
        gestionnaire: props.gestionnai,
        dateMiseService: props.mise_en_se,
        latitude: coords.latitude,
        longitude: coords.longitude,
        source: 'CEREMA EnRezo - Recensement RCF',
      },
    })
    count++

    if (feature.geometry && coords.latitude && coords.longitude) {
      const geomJson = JSON.stringify(feature.geometry)
      await prisma.$executeRawUnsafe(
        `
        UPDATE reseau_chaleur_froid
        SET geometry = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
        WHERE id = $2
      `,
        geomJson,
        record.id
      )
    }
  }

  console.log(`  ✅ ${count} réseaux en construction importés`)
}

async function importPerimetresPrioritaires() {
  console.log('\n📥 Importing périmètres de développement prioritaires...')

  const geojson = await fetchWfsGeoJson(WFS_SERVICES.perimetres_prioritaires)

  await prisma.reseauChaleurFroid.deleteMany({ where: { type: 'PERIMETRE_PRIORITAIRE' } })

  let count = 0
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}

    await prisma.reseauChaleurFroid.create({
      data: {
        type: 'PERIMETRE_PRIORITAIRE',
        identifiant: props.identifian,
        nom: props.communes || 'Périmètre prioritaire',
        communes: props.communes,
        source: 'CEREMA EnRezo - Recensement RCF',
      },
    })
    count++
  }

  console.log(`  ✅ ${count} périmètres prioritaires importés`)
}

// ============================================
// IMPORT ZONES D'OPPORTUNITES
// ============================================
async function importZonesOpportunite(
  serviceKey: string,
  typeName: 'CHALEUR_FORT_POTENTIEL' | 'CHALEUR_POTENTIEL' | 'FROID_FORT_POTENTIEL' | 'FROID_POTENTIEL'
) {
  console.log(`\n📥 Importing zones opportunité ${typeName}...`)

  const geojson = await fetchWfsGeoJson(WFS_SERVICES[serviceKey])

  await prisma.zoneOpportunite.deleteMany({ where: { type: typeName } })

  let count = 0

  // Insert zones one by one with geometry via raw SQL
  for (const feature of geojson.features || []) {
    const props = feature.properties || {}
    const coords = extractCoordinates(feature.geometry)
    const geomJson = feature.geometry ? JSON.stringify(feature.geometry) : null

    try {
      await prisma.$executeRaw`
        INSERT INTO zone_opportunite (
          id, type, id_zone, code_insee, code_departement,
          class_mode, class_dens_lin, class_besoin, filiere, scenario,
          besoin_chauffage, besoin_ecs, besoin_froid,
          besoin_res_chauffage, besoin_res_ecs, besoin_res_froid,
          besoin_ter_chauffage, besoin_ter_ecs, besoin_ter_froid,
          part_tertiaire, nb_constructions, surface_m2, perimetre_m,
          id_cerema, latitude, longitude, geometry, created_at, updated_at
        ) VALUES (
          gen_random_uuid()::text,
          ${typeName}::type_zone_opportunite,
          ${props.id_zone || null},
          ${props.com_insee?.toString().padStart(5, '0') || null},
          ${props.dep_insee?.toString().padStart(2, '0') || null},
          ${props.c_mode || null},
          ${props.c_denslin || null},
          ${props.c_besoin || null},
          ${props.filiere || null},
          ${props.scenario || null},
          ${props.besoin_chauf || null},
          ${props.besoin_ecs || null},
          ${props.besoin_froid || null},
          ${props.besoin_res_chauf || null},
          ${props.besoin_res_ecs || null},
          ${props.besoin_res_froid || null},
          ${props.besoin_ter_chauf || null},
          ${props.besoin_ter_ecs || null},
          ${props.besoin_ter_froid || null},
          ${props.part_ter || null},
          ${props.nb_const || null},
          ${props.st_area_geom_ || null},
          ${props.st_length_geom_ || null},
          ${props.id_cerema || null},
          ${coords.latitude},
          ${coords.longitude},
          ${geomJson ? Prisma.sql`ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)` : Prisma.sql`NULL`},
          NOW(),
          NOW()
        )
      `
      count++
      if (count % 500 === 0) {
        process.stdout.write(`\r  → ${count} zones...`)
      }
    } catch (e) {
      // Skip invalid geometries
      console.error(`  ⚠ Error inserting zone: ${e}`)
    }
  }

  console.log(`\n  ✅ ${count} zones ${typeName} importées`)
}

// ============================================
// MAIN
// ============================================
async function main() {
  const args = process.argv.slice(2)
  const doAll = args.includes('--all')
  const doGisements = args.includes('--gisements') || doAll
  const doInstallations = args.includes('--installations') || doAll
  const doPlateformes = args.includes('--plateformes') || doAll
  const doReseaux = args.includes('--reseaux') || doAll
  const doZones = args.includes('--zones') || doAll

  console.log('╔════════════════════════════════════════════╗')
  console.log('║  IMPORT ENREZO - CEREMA WFS DATA          ║')
  console.log('╚════════════════════════════════════════════╝')

  if (!doGisements && !doInstallations && !doPlateformes && !doReseaux && !doZones) {
    console.log('\nUsage:')
    console.log('  --all           Import all data')
    console.log('  --gisements     Import gisements chaleur')
    console.log('  --installations Import installations production')
    console.log('  --plateformes   Import plateformes stockage bois')
    console.log('  --reseaux       Import réseaux chaleur/froid')
    console.log("  --zones         Import zones d'opportunité")
    return
  }

  try {
    // Gisements chaleur
    if (doGisements) {
      console.log('\n═══ GISEMENTS CHALEUR FATALE ═══')
      await importGisementIncineration()
      await importGisementIndustrie()
      await importGisementStep()
      await importGisementDatacenter()
    }

    // Installations production
    if (doInstallations) {
      console.log('\n═══ INSTALLATIONS DE PRODUCTION ═══')
      await importChaufferiesBois()
      await importSolaireThermique()
      await importInstallElectrogene()
    }

    // Plateformes stockage
    if (doPlateformes) {
      console.log('\n═══ PLATEFORMES STOCKAGE BOIS ═══')
      await importPlateformesBois()
    }

    // Réseaux chaleur/froid
    if (doReseaux) {
      console.log('\n═══ RÉSEAUX CHALEUR/FROID ═══')
      await importReseauxChaleur()
      await importReseauxFroid()
      await importReseauxConstruction()
      await importPerimetresPrioritaires()
    }

    // Zones d'opportunité
    if (doZones) {
      console.log("\n═══ ZONES D'OPPORTUNITÉ ═══")
      await importZonesOpportunite('zone_chaleur_fort', 'CHALEUR_FORT_POTENTIEL')
      await importZonesOpportunite('zone_chaleur', 'CHALEUR_POTENTIEL')
      await importZonesOpportunite('zone_froid_fort', 'FROID_FORT_POTENTIEL')
      await importZonesOpportunite('zone_froid', 'FROID_POTENTIEL')
    }

    // Stats finales
    console.log('\n═══ STATISTIQUES FINALES ═══')
    const stats = {
      gisementsChaleur: await prisma.gisementChaleur.count(),
      installationsProduction: await prisma.installationProduction.count(),
      plateformesStockage: await prisma.plateformeStockageBois.count(),
      reseauxChaleurFroid: await prisma.reseauChaleurFroid.count(),
      zonesOpportunite: await prisma.zoneOpportunite.count(),
    }

    console.log(`  Gisements chaleur:      ${stats.gisementsChaleur}`)
    console.log(`  Installations prod:     ${stats.installationsProduction}`)
    console.log(`  Plateformes stockage:   ${stats.plateformesStockage}`)
    console.log(`  Réseaux chaleur/froid:  ${stats.reseauxChaleurFroid}`)
    console.log(`  Zones opportunité:      ${stats.zonesOpportunite}`)

    console.log('\n✅ Import terminé avec succès!')
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
