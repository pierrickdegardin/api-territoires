/**
 * Import des contacts AREC depuis les données RARE (rare.fr)
 *
 * Ce script met à jour les contacts des AREC existantes dans la base de données
 * avec les informations collectées depuis le site du RARE.
 *
 * Usage:
 *   npx tsx scripts/import-arec-contacts.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Données des AREC collectées depuis rare.fr
const AREC_CONTACTS: Array<{
  nom: string
  nomCourt: string
  siren?: string
  region: string
  codeRegion: string
  adresse: string
  codePostal: string
  ville: string
  telephone: string
  email: string
  siteWeb: string
}> = [
  {
    nom: 'Auvergne-Rhône-Alpes Energie Environnement',
    nomCourt: 'AURA-EE',
    siren: '314538513',
    region: 'Auvergne-Rhône-Alpes',
    codeRegion: '84',
    adresse: '18 rue Gabriel Péri',
    codePostal: '69100',
    ville: 'Villeurbanne',
    telephone: '04 78 37 29 14',
    email: 'info@auvergnerhonealpes-ee.fr',
    siteWeb: 'https://www.auvergnerhonealpes-ee.fr',
  },
  {
    nom: 'Alterre Bourgogne-Franche-Comté',
    nomCourt: 'Alterre BFC',
    siren: '393708870',
    region: 'Bourgogne-Franche-Comté',
    codeRegion: '27',
    adresse: 'La Bourdonnerie, 2 allée Pierre Lacroute',
    codePostal: '21000',
    ville: 'Dijon',
    telephone: '03 80 68 44 30',
    email: 'contact@alterrebfc.org',
    siteWeb: 'https://www.alterrebourgognefranchecomte.org/',
  },
  {
    nom: "Observatoire de l'environnement en Bretagne",
    nomCourt: 'OEB',
    siren: '130003254',
    region: 'Bretagne',
    codeRegion: '53',
    adresse: '47 avenue des Pays-Bas',
    codePostal: '35000',
    ville: 'Rennes',
    telephone: '02 99 35 45 80',
    email: 'contact@bretagne-environnement.fr',
    siteWeb: 'https://bretagne-environnement.fr',
  },
  {
    nom: 'AREC Centre-Val de Loire',
    nomCourt: 'AREC CVL',
    siren: '939974812',
    region: 'Centre-Val de Loire',
    codeRegion: '24',
    adresse: '37 avenue de Paris',
    codePostal: '45000',
    ville: 'Orléans',
    telephone: '02 38 53 56 20',
    email: 'contact@arec-cvl.fr',
    siteWeb: 'https://www.arec-cvl.fr/',
  },
  {
    nom: 'Centre Ressource du Développement Durable',
    nomCourt: 'CERDD',
    siren: '130002249',
    region: 'Hauts-de-France',
    codeRegion: '32',
    adresse: '11/19 rue de Bourgogne',
    codePostal: '62750',
    ville: 'Loos-en-Gohelle',
    telephone: '03 21 08 52 40',
    email: 'contact@cerdd.org',
    siteWeb: 'https://cerdd.org',
  },
  {
    nom: "Agence régionale énergie climat d'Île-de-France",
    nomCourt: 'AREC IdF',
    region: 'Île-de-France',
    codeRegion: '11',
    adresse: '15 rue Falguière',
    codePostal: '75740',
    ville: 'Paris Cedex 15',
    telephone: '01 77 49 79 89',
    email: 'info.arec@institutparisregion.fr',
    siteWeb: 'https://www.arec-idf.fr/',
  },
  {
    nom: 'Biomasse Normandie',
    nomCourt: 'Biomasse Normandie',
    siren: '383743317',
    region: 'Normandie',
    codeRegion: '28',
    adresse: "18 rue d'Armor",
    codePostal: '14000',
    ville: 'Caen',
    telephone: '02 31 34 24 88',
    email: 'info@biomasse-normandie.org',
    siteWeb: 'https://www.biomasse-normandie.fr/',
  },
  {
    nom: 'AREC Nouvelle-Aquitaine',
    nomCourt: 'AREC NA',
    region: 'Nouvelle-Aquitaine',
    codeRegion: '75',
    adresse: '60 rue Jean Jaurès, CS 90452',
    codePostal: '86011',
    ville: 'Poitiers Cedex',
    telephone: '05 49 30 31 57',
    email: 'info@arec-na.com',
    siteWeb: 'https://www.arec-nouvelleaquitaine.com/',
  },
  {
    nom: 'Agence Régionale Énergie Climat Occitanie',
    nomCourt: 'AREC Occitanie',
    siren: '352158828',
    region: 'Occitanie',
    codeRegion: '76',
    adresse: '25 avenue Louis Bréguet, CS24020',
    codePostal: '31028',
    ville: 'Toulouse Cedex 4',
    telephone: '05 34 31 97 00',
    email: 'arec@arec-occitanie.fr',
    siteWeb: 'https://www.arec-occitanie.fr',
  },
  {
    nom: 'TEO - Observatoire ligérien de la transition énergétique et écologique',
    nomCourt: 'TEO',
    region: 'Pays de la Loire',
    codeRegion: '52',
    adresse: '5 rue Edouard Nignon',
    codePostal: '44307',
    ville: 'Nantes Cedex 3',
    telephone: '06 75 14 79 43',
    email: 'contact@teo-paysdelaloire.fr',
    siteWeb: 'https://teo-paysdelaloire.fr/',
  },
  {
    nom: "Agence Régionale de la Biodiversité et de l'Environnement Région Sud",
    nomCourt: 'ARBE Région Sud',
    region: "Provence-Alpes-Côte d'Azur",
    codeRegion: '93',
    adresse: '22 rue Sainte-Barbe, CS 80573',
    codePostal: '13205',
    ville: 'Marseille Cedex 01',
    telephone: '04 42 90 90 90',
    email: 'contact@arbe-regionsud.org',
    siteWeb: 'https://www.arbe-regionsud.org/',
  },
  {
    nom: "Énergies Réunion - Agence Régionale de l'Energie et du Climat",
    nomCourt: 'Énergies Réunion',
    siren: '795064658',
    region: 'La Réunion',
    codeRegion: '04',
    adresse: "02 rue Galabé, BAT E1, Quartier d'Affaires Tamarins",
    codePostal: '97424',
    ville: 'Piton Saint-Leu',
    telephone: '02 62 25 72 57',
    email: 'contact@energies-reunion.com',
    siteWeb: 'https://www.energies-reunion.com',
  },
  {
    nom: 'Synergîles',
    nomCourt: 'Synergîles',
    siren: '503687592',
    region: 'Guadeloupe',
    codeRegion: '01',
    adresse: 'Immeuble France-Antilles, ZAC de Moudong Sud',
    codePostal: '97122',
    ville: 'Baie-Mahault',
    telephone: '05 90 57 02 38',
    email: 'secretariat@synergile.fr',
    siteWeb: 'https://www.synergile.fr/',
  },
  {
    nom: 'Agence Régionale de la Transition Énergétique Grand Est',
    nomCourt: 'ARTE Grand Est',
    siren: '884822982',
    region: 'Grand Est',
    codeRegion: '44',
    adresse: '6 rue André Pingat',
    codePostal: '51100',
    ville: 'Reims',
    telephone: '03 26 69 75 75',
    email: 'contact@arte-grandest.fr',
    siteWeb: 'https://www.arte-grandest.fr/',
  },
]

async function importARECContacts(dryRun: boolean): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════╗')
  console.log('║   Import des contacts AREC depuis RARE                  ║')
  console.log('║   Source: rare.fr                                       ║')
  console.log('╚════════════════════════════════════════════════════════╝\n')

  if (dryRun) {
    console.log('Mode --dry-run: affichage sans modification\n')
  }

  let updated = 0
  let created = 0
  let skipped = 0
  let errors = 0

  for (const arec of AREC_CONTACTS) {
    try {
      // Chercher l'AREC par SIREN ou par nom
      let existing: Array<{ siren: string; nom: string }> = []

      if (arec.siren) {
        existing = await prisma.$queryRaw<Array<{ siren: string; nom: string }>>`
          SELECT siren, nom FROM groupement
          WHERE siren = ${arec.siren} AND type = 'AREC'
        `
      }

      // Si pas trouvé par SIREN, chercher par région
      if (existing.length === 0) {
        existing = await prisma.$queryRaw<Array<{ siren: string; nom: string }>>`
          SELECT siren, nom FROM groupement
          WHERE type = 'AREC' AND code_region = ${arec.codeRegion}
          LIMIT 1
        `
      }

      // Si pas trouvé par région, chercher par nom similaire
      if (existing.length === 0) {
        const searchTerms = arec.nomCourt.split(' ')[0].toUpperCase()
        existing = await prisma.$queryRaw<Array<{ siren: string; nom: string }>>`
          SELECT siren, nom FROM groupement
          WHERE type = 'AREC' AND UPPER(nom) LIKE ${`%${searchTerms}%`}
          LIMIT 1
        `
      }

      const telephone = arec.telephone.replace(/\s/g, '').substring(0, 20)
      const email = arec.email.substring(0, 100)
      const siteWeb = arec.siteWeb.substring(0, 200)
      const adresse = arec.adresse.substring(0, 200)
      const codePostal = arec.codePostal.substring(0, 10)
      const ville = arec.ville.substring(0, 100)

      if (existing.length > 0) {
        // Mettre à jour l'AREC existante
        if (dryRun) {
          console.log(`   ↻ ${existing[0].siren} | ${arec.nomCourt} → mise à jour`)
          console.log(`     Tél: ${telephone} | Email: ${email}`)
          updated++
        } else {
          await prisma.$executeRaw`
            UPDATE groupement SET
              telephone = ${telephone},
              email = ${email},
              site_web = ${siteWeb},
              adresse = ${adresse},
              code_postal = ${codePostal},
              ville = ${ville},
              updated_at = NOW()
            WHERE siren = ${existing[0].siren}
          `
          console.log(`   ✓ ${existing[0].siren} | ${arec.nomCourt} mis à jour`)
          updated++
        }
      } else {
        // AREC non trouvée, afficher un warning
        console.log(`   ⚠️ ${arec.nomCourt} (${arec.region}) - non trouvée en base`)
        skipped++
      }
    } catch (error) {
      console.error(`   ✗ Erreur pour ${arec.nomCourt}:`, error)
      errors++
    }
  }

  console.log(`\n   Résultat: ${created} créés, ${updated} mis à jour, ${skipped} non trouvés, ${errors} erreurs`)

  // Statistiques
  if (!dryRun) {
    const stats = await prisma.$queryRaw<
      Array<{
        total: bigint
        avec_contact: bigint
      }>
    >`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN telephone IS NOT NULL OR email IS NOT NULL THEN 1 END) as avec_contact
      FROM groupement WHERE type = 'AREC'
    `
    console.log(`\n=== Statistiques AREC ===`)
    console.log(`   Total AREC: ${stats[0].total}`)
    console.log(`   Avec contacts: ${stats[0].avec_contact}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  try {
    await importARECContacts(dryRun)
    console.log('\n✅ Terminé')
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
