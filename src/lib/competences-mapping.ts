/**
 * Mapping des compétences BANATIC avec noms lisibles et catégories
 * Source: Fichier Excel Intercommunalités BANATIC
 */

export interface CompetenceInfo {
  nom: string
  categorie: string
  description?: string
}

export const CATEGORIES_COMPETENCES = {
  ENERGIE: 'Énergie',
  EAU_ASSAINISSEMENT: 'Eau et assainissement',
  GEMAPI: 'GEMAPI (Gestion des milieux aquatiques)',
  ENVIRONNEMENT: 'Environnement et climat',
  DECHETS: 'Déchets',
  FUNERAIRE: 'Services funéraires',
  SANTE_SOCIAL: 'Santé et social',
  PETITE_ENFANCE: 'Petite enfance',
  ACTION_SOCIALE: 'Action sociale',
  DEVELOPPEMENT_ECO: 'Développement économique',
  TOURISME: 'Tourisme',
  CULTURE_SPORT: 'Culture et sport',
  EDUCATION: 'Éducation',
  URBANISME: 'Urbanisme et aménagement',
  TRANSPORTS: 'Transports et mobilité',
  VOIRIE: 'Voirie',
  HABITAT: 'Habitat et logement',
  SERVICES_PUBLICS: 'Services publics',
  SECURITE: 'Sécurité et incendie',
  AUTRES: 'Autres',
} as const

export const COMPETENCES_MAPPING: Record<string, CompetenceInfo> = {
  // ÉNERGIE (comp_1 à comp_9)
  comp_1: { nom: "Distribution publique d'électricité", categorie: 'ENERGIE' },
  comp_2: { nom: 'Distribution publique de gaz', categorie: 'ENERGIE' },
  comp_3: { nom: 'Réseaux de chaleur ou de froid urbains', categorie: 'ENERGIE' },
  comp_4: { nom: "Maîtrise de l'énergie", categorie: 'ENERGIE' },
  comp_5: { nom: 'Bornes de recharge véhicules électriques', categorie: 'ENERGIE' },
  comp_6: { nom: 'Éclairage public', categorie: 'ENERGIE' },
  comp_7: { nom: 'Hydroélectricité et énergies renouvelables', categorie: 'ENERGIE' },
  comp_8: { nom: "Production d'électricité de proximité", categorie: 'ENERGIE' },
  comp_9: { nom: 'Transition énergétique', categorie: 'ENERGIE' },

  // EAU ET ASSAINISSEMENT (comp_10 à comp_13)
  comp_10: { nom: 'Eau potable', categorie: 'EAU_ASSAINISSEMENT' },
  comp_11: { nom: 'Assainissement collectif', categorie: 'EAU_ASSAINISSEMENT' },
  comp_12: { nom: 'Assainissement non collectif', categorie: 'EAU_ASSAINISSEMENT' },
  comp_13: { nom: 'Eaux pluviales urbaines', categorie: 'EAU_ASSAINISSEMENT' },

  // MOBILITÉ / ENVIRONNEMENT
  comp_14: { nom: 'Zone à faibles émissions (ZFE-m)', categorie: 'ENVIRONNEMENT' },

  // GEMAPI (comp_15 à comp_26)
  comp_15: { nom: 'GEMAPI - Aménagement bassin hydrographique', categorie: 'GEMAPI' },
  comp_16: { nom: "GEMAPI - Entretien cours d'eau", categorie: 'GEMAPI' },
  comp_17: { nom: 'GEMAPI - Défense contre les inondations', categorie: 'GEMAPI' },
  comp_18: { nom: 'GEMAPI - Protection écosystèmes aquatiques', categorie: 'GEMAPI' },
  comp_19: { nom: 'Approvisionnement en eau', categorie: 'GEMAPI' },
  comp_20: { nom: 'Maîtrise eaux pluviales et érosion', categorie: 'GEMAPI' },
  comp_21: { nom: 'Lutte contre la pollution des eaux', categorie: 'GEMAPI' },
  comp_22: { nom: 'Protection eaux superficielles et souterraines', categorie: 'GEMAPI' },
  comp_23: { nom: 'Aménagements hydrauliques sécurité civile', categorie: 'GEMAPI' },
  comp_24: { nom: 'Ouvrages hydrauliques existants', categorie: 'GEMAPI' },
  comp_25: { nom: 'Surveillance ressource en eau', categorie: 'GEMAPI' },
  comp_26: { nom: 'Animation prévention inondation', categorie: 'GEMAPI' },

  // ENVIRONNEMENT (comp_27 à comp_34)
  comp_27: { nom: 'Parc naturel régional', categorie: 'ENVIRONNEMENT' },
  comp_28: { nom: 'Concession plages', categorie: 'ENVIRONNEMENT' },
  comp_29: { nom: 'Plan climat-air-énergie territorial (PCAET)', categorie: 'ENVIRONNEMENT' },
  comp_30: { nom: 'Collecte des déchets ménagers', categorie: 'DECHETS' },
  comp_31: { nom: 'Traitement des déchets ménagers', categorie: 'DECHETS' },
  comp_32: { nom: 'Lutte contre les nuisances sonores', categorie: 'ENVIRONNEMENT' },
  comp_33: { nom: "Lutte contre la pollution de l'air", categorie: 'ENVIRONNEMENT' },
  comp_34: { nom: 'Règlement local de publicité', categorie: 'ENVIRONNEMENT' },

  // FUNÉRAIRE (comp_35 à comp_37)
  comp_35: { nom: 'Cimetières et sites cinéraires', categorie: 'FUNERAIRE' },
  comp_36: { nom: 'Crématoriums', categorie: 'FUNERAIRE' },
  comp_37: { nom: 'Pompes funèbres', categorie: 'FUNERAIRE' },

  // SANTÉ (comp_38 à comp_39)
  comp_38: { nom: 'Activités sanitaires', categorie: 'SANTE_SOCIAL' },
  comp_39: { nom: 'Maisons de santé pluridisciplinaires', categorie: 'SANTE_SOCIAL' },

  // PETITE ENFANCE (comp_40 à comp_42)
  comp_40: { nom: 'Crèches', categorie: 'PETITE_ENFANCE' },
  comp_41: { nom: 'Relais petite enfance', categorie: 'PETITE_ENFANCE' },
  comp_42: { nom: "Maisons d'assistants maternels", categorie: 'PETITE_ENFANCE' },

  // ACTION SOCIALE (comp_43 à comp_50)
  comp_43: { nom: "Centre intercommunal d'action sociale (CIAS)", categorie: 'ACTION_SOCIALE' },
  comp_44: { nom: 'Aide sociale', categorie: 'ACTION_SOCIALE' },
  comp_45: { nom: 'Action sociale communale', categorie: 'ACTION_SOCIALE' },
  comp_46: { nom: 'Action sociale départementale', categorie: 'ACTION_SOCIALE' },
  comp_47: { nom: "Programme départemental d'insertion", categorie: 'ACTION_SOCIALE' },
  comp_48: { nom: 'Aide aux jeunes en difficulté', categorie: 'ACTION_SOCIALE' },
  comp_49: { nom: 'Prévention spécialisée jeunes/familles', categorie: 'ACTION_SOCIALE' },
  comp_50: { nom: 'Action personnes âgées', categorie: 'ACTION_SOCIALE' },

  // DÉVELOPPEMENT ÉCONOMIQUE (comp_51 à comp_54)
  comp_51: { nom: 'Contrat de ville et développement urbain', categorie: 'DEVELOPPEMENT_ECO' },
  comp_52: { nom: 'Développement économique et commerce', categorie: 'DEVELOPPEMENT_ECO' },
  comp_53: { nom: "Zones d'activité", categorie: 'DEVELOPPEMENT_ECO' },
  comp_54: { nom: 'Compétences régionales développement économique', categorie: 'DEVELOPPEMENT_ECO' },

  // TOURISME (comp_55 à comp_59)
  comp_55: { nom: 'Promotion du tourisme et offices de tourisme', categorie: 'TOURISME' },
  comp_56: { nom: 'Compétences touristiques départementales', categorie: 'TOURISME' },
  comp_57: { nom: 'Équipements touristiques', categorie: 'TOURISME' },
  comp_58: { nom: 'Remontées mécaniques', categorie: 'TOURISME' },
  comp_59: { nom: 'Thermalisme', categorie: 'TOURISME' },

  // CULTURE ET SPORT (comp_60 à comp_70)
  comp_60: { nom: 'Équipements culturels et sportifs', categorie: 'CULTURE_SPORT' },
  comp_61: { nom: 'Compétences départementales culture/sport', categorie: 'CULTURE_SPORT' },
  comp_62: { nom: 'Écoles (préélémentaire et élémentaire)', categorie: 'EDUCATION' },
  comp_63: { nom: 'Activités périscolaires', categorie: 'EDUCATION' },
  comp_64: { nom: 'Lycées', categorie: 'EDUCATION' },
  comp_65: { nom: 'Collèges', categorie: 'EDUCATION' },
  comp_66: { nom: 'Enseignement supérieur et recherche', categorie: 'EDUCATION' },
  comp_67: { nom: 'Activités culturelles et socioculturelles', categorie: 'CULTURE_SPORT' },
  comp_68: { nom: 'Activités sportives', categorie: 'CULTURE_SPORT' },
  comp_69: { nom: 'Restauration scolaire', categorie: 'EDUCATION' },
  comp_70: { nom: 'Garderie périscolaire', categorie: 'EDUCATION' },

  // URBANISME (comp_71 à comp_79)
  comp_71: { nom: 'SCoT (Schéma de cohérence territoriale)', categorie: 'URBANISME' },
  comp_72: { nom: 'Schéma de secteur', categorie: 'URBANISME' },
  comp_73: { nom: "PLU (Plan local d'urbanisme)", categorie: 'URBANISME' },
  comp_74: { nom: "Opérations d'aménagement (ZAC)", categorie: 'URBANISME' },
  comp_75: { nom: 'Réserves foncières', categorie: 'URBANISME' },
  comp_76: { nom: 'Droit de préemption urbain', categorie: 'URBANISME' },
  comp_77: { nom: "Autorisations d'urbanisme (permis de construire)", categorie: 'URBANISME' },
  comp_78: { nom: 'Patrimoine naturel et paysager', categorie: 'URBANISME' },
  comp_79: { nom: "Instruction autorisations d'urbanisme", categorie: 'URBANISME' },

  // TRANSPORTS ET MOBILITÉ (comp_80 à comp_95)
  comp_80: { nom: 'Transports publics de personnes', categorie: 'TRANSPORTS' },
  comp_81: { nom: 'Transports scolaires', categorie: 'TRANSPORTS' },
  comp_82: { nom: 'Transports publics non urbains', categorie: 'TRANSPORTS' },
  comp_83: { nom: 'Ports de plaisance ou de commerce', categorie: 'TRANSPORTS' },
  comp_84: { nom: 'Aérodromes', categorie: 'TRANSPORTS' },
  comp_85: { nom: 'Gares', categorie: 'TRANSPORTS' },
  comp_86: { nom: 'Voies navigables', categorie: 'TRANSPORTS' },
  comp_87: { nom: 'Itinéraires cyclables', categorie: 'TRANSPORTS' },
  comp_88: { nom: 'Voirie communale', categorie: 'VOIRIE' },
  comp_89: { nom: 'Signalisation et stationnement', categorie: 'VOIRIE' },
  comp_90: { nom: 'Accompagnement mobilité personnes vulnérables', categorie: 'TRANSPORTS' },
  comp_91: { nom: 'Conseil en mobilité employeurs', categorie: 'TRANSPORTS' },
  comp_92: { nom: 'Transport de marchandises et logistique', categorie: 'TRANSPORTS' },
  comp_93: { nom: 'Syndicat de transport SRU', categorie: 'TRANSPORTS' },
  comp_94: { nom: 'Plans de mobilité', categorie: 'TRANSPORTS' },
  comp_95: { nom: 'Voirie départementale', categorie: 'VOIRIE' },

  // HABITAT (comp_96 à comp_104)
  comp_96: { nom: "Programme local de l'habitat (PLH)", categorie: 'HABITAT' },
  comp_97: { nom: 'Logement social', categorie: 'HABITAT' },
  comp_98: { nom: 'Logement des personnes défavorisées', categorie: 'HABITAT' },
  comp_99: { nom: 'OPAH', categorie: 'HABITAT' },
  comp_100: { nom: 'Amélioration du parc immobilier', categorie: 'HABITAT' },
  comp_101: { nom: 'Résorption habitat insalubre', categorie: 'HABITAT' },
  comp_102: { nom: 'Aides à la pierre (insécables)', categorie: 'HABITAT' },
  comp_103: { nom: 'Aides à la pierre (sécables)', categorie: 'HABITAT' },
  comp_104: { nom: "Aires d'accueil gens du voyage", categorie: 'HABITAT' },

  // SERVICES PUBLICS (comp_105 à comp_114)
  comp_105: { nom: 'Abattoirs publics', categorie: 'SERVICES_PUBLICS' },
  comp_106: { nom: 'Marchés et halles', categorie: 'SERVICES_PUBLICS' },
  comp_107: { nom: 'Financement SDIS', categorie: 'SECURITE' },
  comp_108: { nom: 'Recensement de la population', categorie: 'SERVICES_PUBLICS' },
  comp_109: { nom: 'Centre de première intervention incendie', categorie: 'SECURITE' },
  comp_110: { nom: "Défense extérieure contre l'incendie", categorie: 'SECURITE' },
  comp_111: { nom: 'Communications électroniques', categorie: 'SERVICES_PUBLICS' },
  comp_112: { nom: 'Maison France Services', categorie: 'SERVICES_PUBLICS' },
  comp_113: { nom: 'Archéologie préventive', categorie: 'SERVICES_PUBLICS' },
  comp_114: { nom: "Système d'Information Géographique (SIG)", categorie: 'SERVICES_PUBLICS' },

  // AUTRES (comp_115 à comp_123)
  comp_115: { nom: 'Plan de mise en accessibilité', categorie: 'AUTRES' },
  comp_116: { nom: 'Entretien bâtiments et espaces publics', categorie: 'AUTRES' },
  comp_117: { nom: 'Sentiers de randonnée', categorie: 'AUTRES' },
  comp_118: { nom: 'Gestion forestière', categorie: 'AUTRES' },
  comp_119: { nom: 'Projet alimentaire territorial', categorie: 'AUTRES' },
  comp_120: { nom: 'Lutte contre les nuisibles', categorie: 'AUTRES' },
  comp_121: { nom: 'Fourrière automobile', categorie: 'AUTRES' },
  comp_122: { nom: 'Fourrière animale', categorie: 'AUTRES' },
  comp_123: { nom: 'Autres compétences', categorie: 'AUTRES' },
}

/**
 * Convertit les compétences brutes (comp_1: true) en format lisible
 * @param competences Object avec comp_1, comp_2, etc.
 * @returns Object avec compétences groupées par catégorie
 */
export function formatCompetences(competences: Record<string, boolean> | null): Record<string, string[]> | null {
  if (!competences) return null

  const result: Record<string, string[]> = {}

  for (const [key, value] of Object.entries(competences)) {
    if (value === true && COMPETENCES_MAPPING[key]) {
      const info = COMPETENCES_MAPPING[key]
      const categorieName =
        CATEGORIES_COMPETENCES[info.categorie as keyof typeof CATEGORIES_COMPETENCES] || info.categorie

      if (!result[categorieName]) {
        result[categorieName] = []
      }
      result[categorieName].push(info.nom)
    }
  }

  // Trier les catégories et les compétences
  const sortedResult: Record<string, string[]> = {}
  for (const cat of Object.keys(result).sort()) {
    sortedResult[cat] = result[cat].sort()
  }

  return Object.keys(sortedResult).length > 0 ? sortedResult : null
}

/**
 * Retourne la liste des compétences actives (format simple)
 */
export function getActiveCompetences(competences: Record<string, boolean> | null): string[] {
  if (!competences) return []

  const result: string[] = []

  for (const [key, value] of Object.entries(competences)) {
    if (value === true && COMPETENCES_MAPPING[key]) {
      result.push(COMPETENCES_MAPPING[key].nom)
    }
  }

  return result.sort()
}
