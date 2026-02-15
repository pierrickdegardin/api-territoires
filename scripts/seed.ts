/**
 * Seed minimal data for development
 * Données minimales pour tester l'API Territoires en développement
 */

import { PrismaClient, TypeGroupement } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Démarrage du seed...\n')

  // ====== RÉGIONS ======
  console.log('📍 Régions...')
  await prisma.region.upsert({
    where: { code: '11' },
    update: {},
    create: {
      code: '11',
      nom: 'Île-de-France',
      population: 12278210,
      superficie: 12012,
      chefLieu: '75056',
    },
  })

  await prisma.region.upsert({
    where: { code: '84' },
    update: {},
    create: {
      code: '84',
      nom: 'Auvergne-Rhône-Alpes',
      population: 8032377,
      superficie: 69711,
      chefLieu: '69123',
    },
  })

  await prisma.region.upsert({
    where: { code: '53' },
    update: {},
    create: {
      code: '53',
      nom: 'Bretagne',
      population: 3340379,
      superficie: 27208,
      chefLieu: '35238',
    },
  })

  // ====== DÉPARTEMENTS ======
  console.log('📍 Départements...')
  await prisma.departement.upsert({
    where: { code: '75' },
    update: {},
    create: {
      code: '75',
      nom: 'Paris',
      codeRegion: '11',
      population: 2165423,
      superficie: 105,
      chefLieu: '75056',
    },
  })

  await prisma.departement.upsert({
    where: { code: '69' },
    update: {},
    create: {
      code: '69',
      nom: 'Rhône',
      codeRegion: '84',
      population: 1879601,
      superficie: 3249,
      chefLieu: '69123',
    },
  })

  await prisma.departement.upsert({
    where: { code: '38' },
    update: {},
    create: {
      code: '38',
      nom: 'Isère',
      codeRegion: '84',
      population: 1271166,
      superficie: 7431,
      chefLieu: '38185',
    },
  })

  await prisma.departement.upsert({
    where: { code: '29' },
    update: {},
    create: {
      code: '29',
      nom: 'Finistère',
      codeRegion: '53',
      population: 915090,
      superficie: 6733,
      chefLieu: '29232',
    },
  })

  await prisma.departement.upsert({
    where: { code: '35' },
    update: {},
    create: {
      code: '35',
      nom: 'Ille-et-Vilaine',
      codeRegion: '53',
      population: 1079498,
      superficie: 6775,
      chefLieu: '35238',
    },
  })

  // ====== COMMUNES ======
  console.log('📍 Communes...')
  await prisma.commune.upsert({
    where: { code: '75056' },
    update: {},
    create: {
      code: '75056',
      nom: 'Paris',
      codeDepartement: '75',
      codeRegion: '11',
      codesPostaux: ['75001', '75002', '75003', '75004', '75005'],
      population: 2165423,
      superficie: 105.4,
      latitude: 48.856614,
      longitude: 2.3522219,
      siren: '217500016',
    },
  })

  await prisma.commune.upsert({
    where: { code: '69123' },
    update: {},
    create: {
      code: '69123',
      nom: 'Lyon',
      codeDepartement: '69',
      codeRegion: '84',
      codesPostaux: ['69001', '69002', '69003', '69004', '69005'],
      population: 522969,
      superficie: 47.87,
      latitude: 45.764043,
      longitude: 4.835659,
      siren: '216901231',
    },
  })

  await prisma.commune.upsert({
    where: { code: '38185' },
    update: {},
    create: {
      code: '38185',
      nom: 'Grenoble',
      codeDepartement: '38',
      codeRegion: '84',
      codesPostaux: ['38000', '38100'],
      population: 158454,
      superficie: 18.13,
      latitude: 45.188529,
      longitude: 5.724524,
      siren: '213801855',
    },
  })

  await prisma.commune.upsert({
    where: { code: '29019' },
    update: {},
    create: {
      code: '29019',
      nom: 'Brest',
      codeDepartement: '29',
      codeRegion: '53',
      codesPostaux: ['29200'],
      population: 139163,
      superficie: 49.51,
      latitude: 48.390394,
      longitude: -4.486076,
      siren: '212900199',
    },
  })

  await prisma.commune.upsert({
    where: { code: '35238' },
    update: {},
    create: {
      code: '35238',
      nom: 'Rennes',
      codeDepartement: '35',
      codeRegion: '53',
      codesPostaux: ['35000', '35200', '35700'],
      population: 221272,
      superficie: 50.39,
      latitude: 48.117266,
      longitude: -1.677793,
      siren: '213502388',
    },
  })

  await prisma.commune.upsert({
    where: { code: '69266' },
    update: {},
    create: {
      code: '69266',
      nom: 'Villeurbanne',
      codeDepartement: '69',
      codeRegion: '84',
      codesPostaux: ['69100'],
      population: 156928,
      superficie: 14.52,
      latitude: 45.766944,
      longitude: 4.879444,
      siren: '216902661',
    },
  })

  await prisma.commune.upsert({
    where: { code: '69259' },
    update: {},
    create: {
      code: '69259',
      nom: 'Vénissieux',
      codeDepartement: '69',
      codeRegion: '84',
      codesPostaux: ['69200'],
      population: 65990,
      superficie: 15.37,
      latitude: 45.697223,
      longitude: 4.887222,
      siren: '216902596',
    },
  })

  await prisma.commune.upsert({
    where: { code: '38421' },
    update: {},
    create: {
      code: '38421',
      nom: "Saint-Martin-d'Hères",
      codeDepartement: '38',
      codeRegion: '84',
      codesPostaux: ['38400'],
      population: 38364,
      superficie: 9.25,
      latitude: 45.167222,
      longitude: 5.765278,
      siren: '213804219',
    },
  })

  await prisma.commune.upsert({
    where: { code: '29232' },
    update: {},
    create: {
      code: '29232',
      nom: 'Quimper',
      codeDepartement: '29',
      codeRegion: '53',
      codesPostaux: ['29000'],
      population: 63360,
      superficie: 84.45,
      latitude: 47.995395,
      longitude: -4.097899,
      siren: '212903226',
    },
  })

  await prisma.commune.upsert({
    where: { code: '35288' },
    update: {},
    create: {
      code: '35288',
      nom: 'Saint-Malo',
      codeDepartement: '35',
      codeRegion: '53',
      codesPostaux: ['35400'],
      population: 46803,
      superficie: 36.58,
      latitude: 48.649337,
      longitude: -2.025674,
      siren: '213502883',
    },
  })

  // ====== GROUPEMENTS EPCI ======
  console.log('📍 Groupements...')
  await prisma.groupement.upsert({
    where: { siren: '200046977' },
    update: {},
    create: {
      siren: '200046977',
      nom: 'Métropole de Lyon',
      type: TypeGroupement.EPCI_METROPOLE,
      nature: 'Métropole',
      codeRegion: '84',
      population: 1411571,
      nbCommunes: 59,
      dateCreation: new Date('2015-01-01'),
      latitude: 45.764043,
      longitude: 4.835659,
      communeSiege: 'Lyon',
      email: 'contact@grandlyon.com',
      siteWeb: 'https://www.grandlyon.com',
    },
  })

  await prisma.groupement.upsert({
    where: { siren: '200040715' },
    update: {},
    create: {
      siren: '200040715',
      nom: 'Grenoble-Alpes Métropole',
      type: TypeGroupement.EPCI_METROPOLE,
      nature: 'Métropole',
      codeRegion: '84',
      population: 450501,
      nbCommunes: 49,
      dateCreation: new Date('2000-01-01'),
      latitude: 45.188529,
      longitude: 5.724524,
      communeSiege: 'Grenoble',
      email: 'contact@lametro.fr',
      siteWeb: 'https://www.grenoblealpesmetropole.fr',
    },
  })

  await prisma.groupement.upsert({
    where: { siren: '242900314' },
    update: {},
    create: {
      siren: '242900314',
      nom: 'Brest Métropole',
      type: TypeGroupement.EPCI_METROPOLE,
      nature: 'Métropole',
      codeRegion: '53',
      population: 213554,
      nbCommunes: 8,
      dateCreation: new Date('2015-01-01'),
      latitude: 48.390394,
      longitude: -4.486076,
      communeSiege: 'Brest',
      email: 'contact@brest-metropole.fr',
      siteWeb: 'https://www.brest.fr',
    },
  })

  // ====== COMMUNE-GROUPEMENT (quelques relations) ======
  console.log('🔗 Relations communes-groupements...')
  await prisma.communeGroupement.upsert({
    where: {
      communeCode_groupementSiren: {
        communeCode: '69123',
        groupementSiren: '200046977',
      },
    },
    update: {},
    create: {
      communeCode: '69123',
      groupementSiren: '200046977',
      dateAdhesion: new Date('2015-01-01'),
    },
  })

  await prisma.communeGroupement.upsert({
    where: {
      communeCode_groupementSiren: {
        communeCode: '69266',
        groupementSiren: '200046977',
      },
    },
    update: {},
    create: {
      communeCode: '69266',
      groupementSiren: '200046977',
      dateAdhesion: new Date('2015-01-01'),
    },
  })

  await prisma.communeGroupement.upsert({
    where: {
      communeCode_groupementSiren: {
        communeCode: '38185',
        groupementSiren: '200040715',
      },
    },
    update: {},
    create: {
      communeCode: '38185',
      groupementSiren: '200040715',
      dateAdhesion: new Date('2000-01-01'),
    },
  })

  await prisma.communeGroupement.upsert({
    where: {
      communeCode_groupementSiren: {
        communeCode: '38421',
        groupementSiren: '200040715',
      },
    },
    update: {},
    create: {
      communeCode: '38421',
      groupementSiren: '200040715',
      dateAdhesion: new Date('2000-01-01'),
    },
  })

  await prisma.communeGroupement.upsert({
    where: {
      communeCode_groupementSiren: {
        communeCode: '29019',
        groupementSiren: '242900314',
      },
    },
    update: {},
    create: {
      communeCode: '29019',
      groupementSiren: '242900314',
      dateAdhesion: new Date('2015-01-01'),
    },
  })

  // ====== ALIAS ======
  console.log('🏷️  Alias...')
  await prisma.alias.upsert({
    where: {
      id: 1,
    },
    update: {
      alias: 'Grand Lyon',
      aliasNorm: 'grand lyon',
      codeOfficiel: '200046977',
      type: 'groupement',
      source: 'manual',
    },
    create: {
      id: 1,
      alias: 'Grand Lyon',
      aliasNorm: 'grand lyon',
      codeOfficiel: '200046977',
      type: 'groupement',
      source: 'manual',
    },
  })

  await prisma.alias.upsert({
    where: {
      id: 2,
    },
    update: {
      alias: 'GAM',
      aliasNorm: 'gam',
      codeOfficiel: '200040715',
      type: 'groupement',
      source: 'manual',
    },
    create: {
      id: 2,
      alias: 'GAM',
      aliasNorm: 'gam',
      codeOfficiel: '200040715',
      type: 'groupement',
      source: 'manual',
    },
  })

  console.log('\n✅ Seed terminé avec succès !')
  console.log('   - 3 régions')
  console.log('   - 5 départements')
  console.log('   - 10 communes')
  console.log('   - 3 groupements EPCI')
  console.log('   - 2 alias')
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
