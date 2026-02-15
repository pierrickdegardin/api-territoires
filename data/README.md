# Données seed

Ces fichiers contiennent les données métier qui ne proviennent pas d'APIs publiques.
Ils sont chargés automatiquement par `scripts/import-all.ts`.

| Fichier                    | Contenu                                                | Lignes |
| -------------------------- | ------------------------------------------------------ | ------ |
| `laureats.csv`             | Lauréats programmes ACTEE/CHENE                        | 995    |
| `structures.csv`           | Structures d'accompagnement (CAUE, ALEC, syndicats...) | 7169   |
| `aliases.csv`              | Noms alternatifs de territoires                        | 62     |
| `groupement-adhesions.csv` | Liens d'adhésion entre groupements                     | 13511  |

Les données territoriales (régions, départements, communes, groupements, géométries)
et les données EnRezo (CEREMA) sont importées directement depuis les APIs publiques.
