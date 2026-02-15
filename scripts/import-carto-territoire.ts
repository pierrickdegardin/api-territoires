/**
 * Script d'import des données territoire CARTO vers CARTE
 *
 * Usage:
 *   npx tsx scripts/import-carto-territoire.ts [--elus] [--epci] [--services] [--all]
 */

import {
  PrismaClient,
  CartoTypeMandatElu,
  CartoNatureEpci,
  CartoTypeServiceEtat,
  CartoDelegationElu,
} from '@prisma/client'

const prisma = new PrismaClient()

// URL de connexion PostgreSQL CARTO
const CARTO_DB_URL = process.env.CARTO_DATABASE_URL
if (!CARTO_DB_URL) {
  throw new Error('CARTO_DATABASE_URL environment variable is required')
}

// Mapping type élu (CARTO → Prisma)
const TYPE_ELU_MAP: Record<string, CartoTypeMandatElu> = {
  MAIRE: 'MAIRE',
  ADJOINT: 'ADJOINT_MAIRE',
  ADJOINT_MAIRE: 'ADJOINT_MAIRE',
  CONSEILLER_MUNICIPAL: 'CONSEILLER_MUNICIPAL',
  PRESIDENT_EPCI: 'CONSEILLER_COMMUNAUTAIRE', // Mapping vers enum existant
  VP_EPCI: 'CONSEILLER_COMMUNAUTAIRE', // Mapping vers enum existant
  CONSEILLER_COMMUNAUTAIRE: 'CONSEILLER_COMMUNAUTAIRE',
  CONSEILLER_DEPARTEMENTAL: 'CONSEILLER_DEPARTEMENTAL',
  CONSEILLER_REGIONAL: 'CONSEILLER_REGIONAL',
  DEPUTE: 'DEPUTE',
  SENATEUR: 'SENATEUR',
}

// Mapping délégation élu
const DELEGATION_MAP: Record<string, CartoDelegationElu> = {
  energie: 'ENERGIE',
  ENERGIE: 'ENERGIE',
  batiments: 'BATIMENTS',
  BATIMENTS: 'BATIMENTS',
  urbanisme: 'URBANISME',
  URBANISME: 'URBANISME',
  transports: 'TRANSPORTS',
  TRANSPORTS: 'TRANSPORTS',
  finances: 'FINANCES',
  FINANCES: 'FINANCES',
  travaux: 'TRAVAUX',
  TRAVAUX: 'TRAVAUX',
  environnement: 'ENVIRONNEMENT',
  ENVIRONNEMENT: 'ENVIRONNEMENT',
  education: 'EDUCATION',
  EDUCATION: 'EDUCATION',
}

// Mapping nature EPCI (CARTO → Prisma)
const NATURE_EPCI_MAP: Record<string, CartoNatureEpci> = {
  METROPOLE: 'METROPOLE',
  MET69: 'METROPOLE',
  CU: 'CU',
  CA: 'CA',
  CC: 'CC',
  SAN: 'SAN',
  SMF: 'SMF',
  SMO: 'SMO',
  SIVU: 'SIVU',
  SIVOM: 'SIVOM',
  PETR: 'PETR',
}

// Mapping type service État
const TYPE_SERVICE_MAP: Record<string, CartoTypeServiceEtat> = {
  PREFECTURE: 'PREFECTURE',
  SOUS_PREFECTURE: 'SOUS_PREFECTURE',
  DDT: 'DDT',
  DREAL: 'DREAL',
  DEAL: 'DEAL',
  DREETS: 'DREETS',
  ARS: 'ARS',
  ADEME_DR: 'ADEME_DR',
  ANAH_DR: 'ANAH_DR',
}

async function importElus() {
  console.log('\n👥 Import des élus depuis CARTO DB...')

  try {
    const { Client } = await import('pg')
    const cartoDB = new Client({ connectionString: CARTO_DB_URL })
    await cartoDB.connect()

    // Compter les élus
    const countResult = await cartoDB.query('SELECT COUNT(*) FROM elus')
    const total = parseInt(countResult.rows[0].count)
    console.log(`   📊 ${total} élus trouvés dans CARTO`)

    // Supprimer les élus existants
    await prisma.cartoElu.deleteMany({})
    console.log('   ✓ Élus existants supprimés')

    // Import par batch de 5000
    const batchSize = 5000
    let imported = 0
    let offset = 0

    while (offset < total) {
      const result = await cartoDB.query(
        `
        SELECT
          civilite, prenom, nom, type_elu, fonction, delegation,
          code_insee, commune, siren_epci, code_departement, code_region,
          email, telephone, date_naissance, nuance_politique
        FROM elus
        WHERE actif = true
        ORDER BY id
        LIMIT $1 OFFSET $2
      `,
        [batchSize, offset]
      )

      // Créer les élus par batch
      const elusToCreate = result.rows.map((elu) => {
        // Convertir délégation en tableau JSON
        const delegations = elu.delegation ? [DELEGATION_MAP[elu.delegation] || elu.delegation] : null

        return {
          civilite: elu.civilite || null,
          prenom: elu.prenom || '',
          nom: elu.nom || '',
          typeMandat: TYPE_ELU_MAP[elu.type_elu] || 'MAIRE',
          fonction: elu.fonction || null,
          delegations: delegations,
          codeInsee: elu.code_insee || null,
          commune: elu.commune || null,
          sirenEpci: elu.siren_epci || null,
          codeDepartement: elu.code_departement || null,
          codeRegion: elu.code_region || null,
          email: elu.email || null,
          telephone: elu.telephone || null,
          dateNaissance: elu.date_naissance ? new Date(elu.date_naissance) : null,
          nuancePolitique: elu.nuance_politique || null,
          importedAt: new Date(),
        }
      })

      await prisma.cartoElu.createMany({ data: elusToCreate })
      imported += result.rows.length
      offset += batchSize
      console.log(`   → ${imported}/${total} élus importés...`)
    }

    await cartoDB.end()
    console.log(`   ✓ ${imported} élus importés`)
    return true
  } catch (error) {
    console.error("   ❌ Erreur lors de l'import des élus:", error)
    return false
  }
}

async function importEpci() {
  console.log('\n🏛️ Import des EPCI depuis CARTO DB...')

  try {
    const { Client } = await import('pg')
    const cartoDB = new Client({ connectionString: CARTO_DB_URL })
    await cartoDB.connect()

    // Récupérer les EPCI
    const epciResult = await cartoDB.query(`
      SELECT siren, nom, nature, code_departement, code_region, population_totale, nombre_communes
      FROM epci
      ORDER BY nom
    `)
    console.log(`   📊 ${epciResult.rows.length} EPCI trouvés dans CARTO`)

    // Supprimer les EPCI existants
    await prisma.cartoEpciCommune.deleteMany({})
    await prisma.cartoEpci.deleteMany({})
    console.log('   ✓ EPCI existants supprimés')

    // Insérer les EPCI
    let epciCount = 0
    for (const epci of epciResult.rows) {
      const nature = NATURE_EPCI_MAP[epci.nature] || 'CC'
      await prisma.cartoEpci.create({
        data: {
          siren: epci.siren,
          nom: epci.nom || 'Sans nom',
          nature,
          codeDepartement: epci.code_departement || null,
          codeRegion: epci.code_region || null,
          population: epci.population_totale || null,
          nbCommunes: epci.nombre_communes || null,
        },
      })
      epciCount++
      if (epciCount % 1000 === 0) {
        console.log(`   → ${epciCount} EPCI importés...`)
      }
    }
    console.log(`   ✓ ${epciCount} EPCI importés`)

    // Récupérer les communes EPCI
    const communesResult = await cartoDB.query(`
      SELECT siren_epci, code_insee, nom_commune
      FROM commune_epci
      ORDER BY siren_epci
    `)
    console.log(`   📊 ${communesResult.rows.length} liens commune-EPCI trouvés`)

    // Créer un map des EPCI par siren pour optimiser
    const epciMap = await prisma.cartoEpci.findMany({ select: { id: true, siren: true } })
    const epciIdBySiren = new Map(epciMap.map((e) => [e.siren, e.id]))

    // Import par batch
    let communeCount = 0
    const batchSize = 10000
    for (let i = 0; i < communesResult.rows.length; i += batchSize) {
      const batch = communesResult.rows.slice(i, i + batchSize)
      const communesToCreate = batch
        .filter((c) => epciIdBySiren.has(c.siren_epci))
        .map((c) => ({
          epciId: epciIdBySiren.get(c.siren_epci)!,
          codeInsee: c.code_insee,
          nomCommune: c.nom_commune || null,
        }))

      if (communesToCreate.length > 0) {
        await prisma.cartoEpciCommune.createMany({ data: communesToCreate })
        communeCount += communesToCreate.length
      }
      console.log(`   → ${communeCount}/${communesResult.rows.length} liens commune-EPCI importés...`)
    }

    await cartoDB.end()
    console.log(`   ✓ ${communeCount} liens commune-EPCI importés`)
    return true
  } catch (error) {
    console.error("   ❌ Erreur lors de l'import des EPCI:", error)
    return false
  }
}

async function importServicesEtat() {
  console.log('\n🏢 Import des services État depuis CARTO DB...')

  try {
    const { Client } = await import('pg')
    const cartoDB = new Client({ connectionString: CARTO_DB_URL })
    await cartoDB.connect()

    // Récupérer les services État
    const result = await cartoDB.query(`
      SELECT
        nom, type, adresse, code_postal, ville,
        code_departement, code_region, email, telephone,
        latitude, longitude
      FROM services_etat
      ORDER BY type, nom
    `)
    console.log(`   📊 ${result.rows.length} services État trouvés dans CARTO`)

    // Supprimer les services existants
    await prisma.cartoServiceEtat.deleteMany({})
    console.log('   ✓ Services État existants supprimés')

    // Insérer les services
    let count = 0
    for (const svc of result.rows) {
      const type = TYPE_SERVICE_MAP[svc.type] || 'PREFECTURE'
      await prisma.cartoServiceEtat.create({
        data: {
          nom: svc.nom || 'Sans nom',
          type,
          adresse: svc.adresse || null,
          codePostal: svc.code_postal || null,
          ville: svc.ville || null,
          codeDepartement: svc.code_departement || null,
          codeRegion: svc.code_region || null,
          email: svc.email || null,
          telephone: svc.telephone || null,
          latitude: svc.latitude ? parseFloat(svc.latitude) : null,
          longitude: svc.longitude ? parseFloat(svc.longitude) : null,
        },
      })
      count++
    }

    await cartoDB.end()
    console.log(`   ✓ ${count} services État importés`)
    return true
  } catch (error) {
    console.error("   ❌ Erreur lors de l'import des services État:", error)
    return false
  }
}

async function main() {
  const args = process.argv.slice(2)
  const importAll = args.includes('--all') || args.length === 0
  const importElusFlag = args.includes('--elus') || importAll
  const importEpciFlag = args.includes('--epci') || importAll
  const importServicesFlag = args.includes('--services') || importAll

  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║       IMPORT DONNÉES TERRITOIRE CARTO → CARTE              ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log(`\nSource: PostgreSQL CARTO (carto_db)`)
  console.log(`Date: ${new Date().toISOString()}`)

  try {
    if (importElusFlag) {
      await importElus()
    }

    if (importEpciFlag) {
      await importEpci()
    }

    if (importServicesFlag) {
      await importServicesEtat()
    }

    console.log('\n✅ Import terminé avec succès!')

    // Stats finales
    const [eluCount, epciCount, communeCount, serviceCount] = await Promise.all([
      prisma.cartoElu.count(),
      prisma.cartoEpci.count(),
      prisma.cartoEpciCommune.count(),
      prisma.cartoServiceEtat.count(),
    ])
    console.log(`\n📊 Base de données CARTE:`)
    console.log(`   - ${eluCount} élus`)
    console.log(`   - ${epciCount} EPCI`)
    console.log(`   - ${communeCount} liens commune-EPCI`)
    console.log(`   - ${serviceCount} services État`)
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
