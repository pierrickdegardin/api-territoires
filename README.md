# API Territoires v2.0

API publique des territoires français avec données EnRezo (CEREMA) et données métier ACTEE.

**Version:** 2.0.0 | **Port:** 3020 | **Licence:** MIT | **URL:** https://territoires.pierrickdegardin.fr

---

## Table des matières

- [Reprise du projet](#reprise-du-projet)
- [Démarrage rapide](#démarrage-rapide)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Tests](#tests)
- [Scripts d'import](#scripts-dimport)
- [Déploiement](#déploiement)
- [Maintenance](#maintenance)
- [Schéma de données](#schéma-de-données)
- [Problèmes connus](#problèmes-connus)

---

## Reprise du projet

Cette section est destinée aux développeurs ou équipes qui reprennent la maintenance de ce projet.

### Vue d'ensemble

L'API Territoires est un **service autonome** qui expose les données géographiques et administratives des territoires français (régions, départements, communes, EPCI/groupements) ainsi que des données énergétiques CEREMA EnRezo. Elle sert de **source unique** pour tous les projets de l'écosystème (CARTE, DECENT, CHENE6).

### Stack technique

| Composant       | Technologie          | Version      |
| --------------- | -------------------- | ------------ |
| Framework       | Next.js (App Router) | 15.5.x       |
| Langage         | TypeScript           | 5.3 (strict) |
| ORM             | Prisma               | 5.22         |
| Base de données | PostgreSQL + PostGIS | 16 + 3.4     |
| Cache           | Redis (ioredis)      | Optionnel    |
| Validation      | Zod                  | 4.x          |
| Tests           | Vitest               | 4.x          |
| Container       | Docker multi-stage   | node:20-slim |

### Checklist de prise en main

```
1. [ ] Lire ce README en entier
2. [ ] Lire CONTRIBUTING.md (conventions, ajout d'endpoints)
3. [ ] Lancer ./scripts/setup-dev.sh (installe tout automatiquement)
4. [ ] Vérifier : curl localhost:3020/api/v1/territoires/health
5. [ ] Explorer la base : npx prisma studio
6. [ ] Lancer les tests : npm test
7. [ ] Lire le schéma Prisma : prisma/schema.prisma (25 modèles)
```

### Structure du projet

```
api-territoires/
├── prisma/schema.prisma          # Schéma DB (25 modèles, ~800 lignes)
├── src/
│   ├── app/api/v1/               # Endpoints REST
│   │   ├── territoires/          # Territoires (15 endpoints)
│   │   ├── enrezo/               # Données énergétiques CEREMA
│   │   ├── laureats/             # Lauréats ACTEE/CHENE
│   │   ├── economes/             # Économes de flux
│   │   ├── structures/           # Structures employeuses
│   │   └── stats/                # Statistiques globales
│   ├── app/api/auth/             # JWT admin (login/logout/me)
│   └── lib/
│       ├── validation.ts         # Schémas Zod (~50 schémas)
│       ├── prisma.ts             # Client Prisma singleton
│       ├── cache.ts              # Cache Redis (dégradation gracieuse)
│       ├── redis.ts              # Client Redis
│       ├── auth/session.ts       # JWT sessions admin
│       └── territoires/          # Logique métier (alias, matching, errors, types, rate-limit, batch)
├── scripts/                      # Import de données (~20 scripts actifs)
├── tests/                        # Tests d'intégration
├── docker-compose.yml            # Stack autonome (DB + API)
├── Dockerfile                    # Build multi-stage
├── .env.example                  # Variables d'environnement documentées
├── CONTRIBUTING.md               # Guide de contribution
└── LICENSE                       # MIT
```

### Décisions techniques importantes

| Décision                      | Raison                                                                             | Impact                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Next.js pour une API pure** | Standardisation avec les autres projets (CARTE, DECENT)                            | Overhead SSR inutile, mais simplifie le déploiement               |
| **Prisma + PostGIS**          | `Unsupported("geometry")` oblige à utiliser du raw SQL pour les requêtes spatiales | Les colonnes geometry ne sont pas typées Prisma, voir `$queryRaw` |
| **Redis optionnel**           | L'API fonctionne sans cache (dégradation gracieuse)                                | En prod, Redis améliore les temps de réponse de 3-5x              |
| **Zod en entrée**             | Tous les inputs sont validés (query params, body)                                  | Erreurs 400 structurées avec détails Zod                          |
| **Batch matching async**      | Matching de noms vers codes (max 1000 items)                                       | Résultats disponibles via polling GET /batch/{id}                 |

### Points d'attention pour la maintenance

1. **Requêtes raw SQL** : Les géométries PostGIS nécessitent du SQL brut (`$queryRaw`). Toutes les requêtes sont **paramétrées** (pas d'interpolation de variables). Vérifier ceci lors de tout ajout.
2. **Rate limiting** : Implémenté dans `lib/territoires/rate-limit.ts`. 100 req/min anonyme, 1000 avec API key.
3. **Sources de données** : Les imports dépendent d'APIs externes (geo.api.gouv.fr, CEREMA WFS, BANATIC). Ces APIs peuvent changer de format ou appliquer du rate limiting.
4. **Cache** : Invalidation manuelle via `DELETE /api/v1/territoires/cache` ou programmatique via `invalidateAllCache()` dans `lib/cache.ts`.

### Ce qui a été fait (v2.0)

- Next.js 15.5.x + React 19 (toutes CVEs résolues)
- CI/CD GitHub Actions (lint, test, build, docker, security audit)
- 141 tests (12 suites Vitest)
- Spec OpenAPI 3.0 (`GET /api/v1/openapi.json`)
- Logging structuré Pino + X-Request-ID sur toutes les routes
- exceljs (remplace xlsx vulnérable)
- Backup automatique (`scripts/backup.sh`)
- Validation Zod sur tous les endpoints

### Ce qui reste à faire

| Priorité | Tâche                                               | Effort estimé |
| -------- | --------------------------------------------------- | ------------- |
| Moyenne  | Augmenter la couverture de tests (routes API)       | 5-10h         |
| Moyenne  | Monitoring / alertes (Prometheus, Sentry...)        | 3h            |
| Basse    | Documentation Swagger UI interactive                | 2h            |
| Basse    | Rate limiting distribué (Redis au lieu d'in-memory) | 3h            |

---

## Démarrage rapide

### Option 1 : Script automatique (recommandé)

```bash
git clone https://github.com/pierrickdegardin/api-territoires.git
cd api-territoires
./scripts/setup-dev.sh
```

Ce script installe les dépendances, lance la DB Docker, applique le schéma Prisma, et propose d'importer les données.

### Option 2 : Docker Compose (tout-en-un)

```bash
git clone https://github.com/pierrickdegardin/api-territoires.git
cd api-territoires

# Configurer les secrets
cp .env.docker.example .env.docker
# Éditer .env.docker : renseigner POSTGRES_PASSWORD et JWT_SECRET

# Lancer la stack complète (DB + API)
docker compose up -d

# Appliquer le schéma et importer les données
docker exec api-territoires npx prisma db push
docker exec api-territoires npx tsx scripts/import-territoires.ts --all

# Vérifier
curl http://localhost:3020/api/v1/territoires/health
```

> **Note :** Le `docker-compose.yml` inclut des labels Traefik pour le reverse proxy.
> Si vous n'utilisez pas Traefik, ignorez-les — le port 3020 est exposé directement sur localhost.

### Option 3 : Installation manuelle (sans Docker)

```bash
git clone https://github.com/pierrickdegardin/api-territoires.git
cd api-territoires

# Prérequis : Node.js 20+, PostgreSQL 16 + PostGIS 3.4
cp .env.example .env
# Éditer .env avec votre DATABASE_URL pointant vers votre PostgreSQL+PostGIS

npm install
npx prisma generate
npx prisma db push
npm run dev

# Optionnel : importer les données (~35000 communes)
npx tsx scripts/import-territoires.ts --all
# Ou : données minimales de test
npx tsx scripts/seed.ts
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               Clients (CARTE, DECENT, etc.)          │
│              HTTP GET/POST → port 3020               │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│                  API Next.js                         │
│  ┌─────────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Validation  │ │   Rate   │ │   JWT Auth       │ │
│  │    Zod      │ │  Limiter │ │  (admin only)    │ │
│  └──────┬──────┘ └────┬─────┘ └────────┬─────────┘ │
│         └──────────────┼───────────────┘            │
│                        ▼                             │
│  ┌──────────────────────────────────────────────┐   │
│  │              Route Handlers                   │   │
│  │  /territoires  /enrezo  /laureats  /stats    │   │
│  └────────────────────┬─────────────────────────┘   │
│                       ▼                              │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │   Prisma   │  │   Redis    │  │  Raw SQL     │  │
│  │   Client   │  │   Cache    │  │  (PostGIS)   │  │
│  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘  │
└────────┼───────────────┼────────────────┼───────────┘
         ▼               ▼                ▼
  ┌──────────────┐ ┌──────────┐  ┌──────────────────┐
  │ PostgreSQL   │ │  Redis   │  │ PostGIS          │
  │   16         │ │ (option) │  │ Géométries       │
  └──────────────┘ └──────────┘  └──────────────────┘
```

### Flux de données

1. **Import** : Scripts TypeScript (`scripts/`) → APIs externes (geo.api.gouv.fr, CEREMA WFS) → PostgreSQL
2. **Requêtes** : Client HTTP → Validation Zod → Cache Redis (hit?) → Prisma/PostGIS → Réponse JSON
3. **Admin** : JWT login → Cookie session → Endpoints protégés (gestion API keys, imports)

---

## Configuration

### Variables d'environnement

Copier `.env.example` en `.env` :

| Variable       | Obligatoire | Description                                                           | Exemple                                                                                  |
| -------------- | ----------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Oui         | Connexion PostgreSQL+PostGIS                                          | `postgresql://territoires:territoires2026@territoires-db:5432/territoires?schema=public` |
| `JWT_SECRET`   | En prod     | Secret pour les tokens JWT admin. Générer : `openssl rand -base64 48` | (48 bytes base64)                                                                        |
| `REDIS_URL`    | Non         | URL Redis pour le cache. Sans Redis, l'API fonctionne normalement     | `redis://redis:6379`                                                                     |
| `NODE_ENV`     | Non         | `development` ou `production`                                         | `development`                                                                            |

### Connexion base de données

| Contexte          | DATABASE_URL                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Docker Compose    | `postgresql://territoires:territoires2026@territoires-db:5432/territoires?schema=public` |
| Local (DB Docker) | `postgresql://territoires:territoires2026@localhost:5432/territoires?schema=public`      |

---

## API Endpoints

Base URL : `http://localhost:3020/api/v1`

### Territoires (`/territoires`)

| Endpoint                          | Méthode | Description                                      |
| --------------------------------- | ------- | ------------------------------------------------ |
| `/territoires`                    | GET     | Liste tous les territoires (filtres, pagination) |
| `/territoires/regions`            | GET     | 18 régions françaises                            |
| `/territoires/departements`       | GET     | 101 départements                                 |
| `/territoires/communes`           | GET     | ~35 000 communes (paginé)                        |
| `/territoires/groupements`        | GET     | EPCI, syndicats (9 702)                          |
| `/territoires/search?q=`          | GET     | Recherche full-text (accent-insensitive)         |
| `/territoires/match`              | POST    | Résolution nom → code officiel                   |
| `/territoires/batch`              | POST    | Batch matching (max 1000 items)                  |
| `/territoires/batch/{id}`         | GET     | Statut d'un batch                                |
| `/territoires/batch/{id}/results` | GET     | Résultats d'un batch                             |
| `/territoires/{code}`             | GET     | Détail d'un territoire par code                  |
| `/territoires/{code}/geometry`    | GET     | Géométrie GeoJSON                                |
| `/territoires/{code}/membres`     | GET     | Communes d'un groupement                         |
| `/territoires/{code}/adhesions`   | GET     | Adhésions d'un groupement                        |
| `/territoires/geojson`            | GET     | Export GeoJSON FeatureCollection                 |
| `/territoires/health`             | GET     | Health check + stats DB                          |
| `/territoires/info`               | GET     | Documentation API                                |

#### Paramètres communs

| Paramètre     | Type    | Description                    | Défaut |
| ------------- | ------- | ------------------------------ | ------ |
| `limit`       | number  | Nombre de résultats (1-500)    | 50     |
| `offset`      | number  | Offset pagination              | 0      |
| `geometry`    | boolean | Inclure géométries GeoJSON     | false  |
| `q`           | string  | Recherche textuelle            | -      |
| `type`        | string  | Filtrer par type de territoire | -      |
| `departement` | string  | Code département               | -      |
| `region`      | string  | Code région                    | -      |

#### Exemples

```bash
# Recherche
curl "http://localhost:3020/api/v1/territoires/search?q=Lyon&limit=5"

# Match un nom vers un code
curl -X POST "http://localhost:3020/api/v1/territoires/match" \
  -H "Content-Type: application/json" \
  -d '{"query": "Métropole de Lyon"}'

# Communes d'un département
curl "http://localhost:3020/api/v1/territoires/communes?departement=69&limit=50"

# Membres d'un EPCI
curl "http://localhost:3020/api/v1/territoires/200046977/membres"

# Régions avec géométries
curl "http://localhost:3020/api/v1/territoires/regions?geometry=true"

# Désambiguïsation (code 24 = Région OU Département)
curl "http://localhost:3020/api/v1/territoires/24?type=departement"
```

### EnRezo (`/enrezo`) - Données énergétiques CEREMA

| Endpoint                    | Méthode | Description                         |
| --------------------------- | ------- | ----------------------------------- |
| `/enrezo`                   | GET     | Accueil + stats (sans param `type`) |
| `/enrezo?type=gisement`     | GET     | Gisements de chaleur fatale         |
| `/enrezo?type=installation` | GET     | Installations de production         |
| `/enrezo?type=plateforme`   | GET     | Plateformes stockage bois           |
| `/enrezo?type=reseau`       | GET     | Réseaux chaleur/froid               |
| `/enrezo?type=zone`         | GET     | Zones d'opportunité                 |
| `/enrezo/stats`             | GET     | Statistiques globales               |

#### Sous-types EnRezo

| Type         | Sous-types                                                                       | Géométrie       |
| ------------ | -------------------------------------------------------------------------------- | --------------- |
| gisement     | INCINERATION, INDUSTRIE, STEP, DATACENTER                                        | Point           |
| installation | CHAUFFERIE_BOIS, SOLAIRE_THERMIQUE, ELECTROGENE                                  | Point           |
| plateforme   | -                                                                                | Point           |
| reseau       | CHALEUR, FROID, CONSTRUCTION, PERIMETRE_PRIORITAIRE                              | MultiLineString |
| zone         | CHALEUR_FORT_POTENTIEL, CHALEUR_POTENTIEL, FROID_FORT_POTENTIEL, FROID_POTENTIEL | MultiPolygon    |

#### Paramètres EnRezo

| Paramètre     | Description                                    |
| ------------- | ---------------------------------------------- |
| `subtype`     | Filtrer par sous-type                          |
| `departement` | Code département                               |
| `bbox`        | Filtre spatial : `minLon,minLat,maxLon,maxLat` |
| `format`      | `json` (défaut) ou `geojson`                   |
| `limit`       | Max 10 000                                     |

```bash
# Zones d'opportunité dans Paris
curl "http://localhost:3020/api/v1/enrezo?type=zone&subtype=CHALEUR_FORT_POTENTIEL&bbox=2.2,48.8,2.4,48.9&format=geojson&limit=1000"
```

### Données métier

| Endpoint      | Description                                                 |
| ------------- | ----------------------------------------------------------- |
| `/laureats`   | Lauréats ACTEE/CHENE (list, detail, geojson)                |
| `/economes`   | Économes de flux (list, detail, geojson, search-by-commune) |
| `/structures` | Structures employeuses (list, detail, geojson)              |
| `/stats`      | Dashboard statistiques globales                             |

### Authentification admin

| Endpoint           | Méthode | Description              |
| ------------------ | ------- | ------------------------ |
| `/api/auth/login`  | POST    | Login admin (JWT cookie) |
| `/api/auth/logout` | POST    | Logout                   |
| `/api/auth/me`     | GET     | Utilisateur connecté     |

### Format des erreurs

Toutes les erreurs suivent le même format :

```json
{
  "error": "INVALID_REQUEST",
  "message": "Description lisible",
  "details": [{ "field": "limit", "message": "Must be between 1 and 500" }]
}
```

Codes d'erreur : `INVALID_REQUEST`, `NOT_FOUND`, `AMBIGUOUS`, `RATE_LIMITED`, `UNAUTHORIZED`, `INTERNAL_ERROR`, `CONFLICT`

---

## Tests

```bash
# Lancer tous les tests
npm test

# Mode watch (relance auto)
npm run test:watch

# Avec couverture
npm run test:coverage
```

### Fichiers de tests

| Fichier                                | Tests | Description                                       |
| -------------------------------------- | ----- | ------------------------------------------------- |
| `src/lib/__tests__/validation.test.ts` | 39    | Schémas Zod (pagination, bbox, codes, search)     |
| `src/lib/__tests__/cache.test.ts`      | 21    | Cache Redis (hit/miss, invalidation, dégradation) |
| `src/lib/__tests__/batch.test.ts`      | 12    | Batch processing (dedup, chunks, statuts)         |
| `tests/health.test.ts`                 | 5     | Endpoint /health (sain, dégradé, down)            |
| `tests/search.test.ts`                 | 8     | Endpoint /search (résultats, filtres, erreurs)    |

Les tests utilisent `vi.mock()` - pas besoin de base de données ou Redis pour les exécuter.

---

## Scripts d'import

Les scripts peuplent la base depuis des sources externes. Exécution depuis le container ou en local :

```bash
# Dans le container Docker
docker exec api-territoires npx tsx scripts/import-territoires.ts --all

# En local (nécessite DATABASE_URL dans .env)
npx tsx scripts/import-territoires.ts --all
```

### Scripts disponibles

| Script                      | Description                      | Source               | Durée      |
| --------------------------- | -------------------------------- | -------------------- | ---------- |
| `import-territoires.ts`     | Régions, départements, communes  | geo.api.gouv.fr      | ~10 min    |
| `import-enrezo.ts`          | Données énergétiques (5 types)   | CEREMA WFS           | ~5 min     |
| `import-banatic.ts`         | EPCI et groupements              | data.gouv.fr BANATIC | ~5 min     |
| `import-banatic-xlsx.ts`    | Import BANATIC depuis Excel      | Fichier local        | ~2 min     |
| `import-membres-banatic.ts` | Liaisons communes-groupements    | BANATIC              | ~3 min     |
| `import-caue-alec.ts`       | CAUE et ALEC                     | Annuaires            | ~2 min     |
| `import-arec.ts`            | AREC régionales                  | Annuaire             | ~1 min     |
| `cron-territory-update.ts`  | Mise à jour mensuelle orchestrée | Tous                 | ~30 min    |
| `create-admin.ts`           | Créer un compte admin            | -                    | instantané |

### Options d'import territoires

```bash
npx tsx scripts/import-territoires.ts --all          # Import complet
npx tsx scripts/import-territoires.ts --regions       # Régions uniquement
npx tsx scripts/import-territoires.ts --departements  # Départements
npx tsx scripts/import-territoires.ts --communes      # Communes
npx tsx scripts/import-territoires.ts --groupements   # Groupements
npx tsx scripts/import-territoires.ts --geometries    # Géométries PostGIS
npx tsx scripts/import-territoires.ts --aliases       # Alias fuzzy matching
```

### Cron mensuel

```bash
# 1er du mois à 3h du matin
0 3 1 * * docker exec api-territoires npx tsx scripts/cron-territory-update.ts
```

### Helpers

| Script                        | Description                                                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `helpers/invalidate-cache.ts` | Invalide le cache Redis après un import. Utilisable de manière programmatique (`import { invalidateCacheAfterImport }`) ou standalone (`npx tsx scripts/helpers/invalidate-cache.ts`). Supporte l'invalidation par préfixe. |

---

## Déploiement

### Build Docker

```bash
cd /root/services/api-territoires

# Build de l'image
docker build -t api-territoires .

# Ou via docker-compose
docker compose up -d --build
```

### Déploiement production

L'API est exposée via **Traefik** (reverse proxy HTTPS) :

- URL : `https://territoires.pierrickdegardin.fr`
- Port interne : 3020
- TLS : Let's Encrypt (certresolver `mytlschallenge`)

```bash
# Redémarrer
docker compose down && docker compose up -d

# Vérifier
curl https://territoires.pierrickdegardin.fr/api/v1/territoires/health
```

### Variables de production

En production, `JWT_SECRET` est **obligatoire**. Générer avec :

```bash
openssl rand -base64 48
```

---

## Maintenance

### Rate limiting

| Type                              | Limite       | Blocage                        |
| --------------------------------- | ------------ | ------------------------------ |
| Anonyme                           | 100 req/min  | -                              |
| Avec API key (header `X-API-Key`) | 1000 req/min | -                              |
| Violations répétées               | -            | Blocage 1h après 10 violations |

### Gestion du cache

```bash
# Invalider tout le cache
curl -X DELETE "http://localhost:3020/api/v1/territoires/cache"

# Invalider par préfixe
curl -X DELETE "http://localhost:3020/api/v1/territoires/cache?prefix=communes"
```

Le cache est automatiquement disponible via le helper `invalidateAllCache()` pour les scripts d'import.

### Logs et monitoring

```bash
# Logs du container
docker logs -f api-territoires

# Health check (inclut stats DB et Redis)
curl http://localhost:3020/api/v1/territoires/health | jq .

# Debug Prisma
DEBUG="prisma:*" npm run dev
```

### CORS

Tous les endpoints sont publics : `Access-Control-Allow-Origin: *`

---

## Schéma de données

### Modèles principaux (25)

| Modèle                 | Description               | Clé primaire     | Géométrie          |
| ---------------------- | ------------------------- | ---------------- | ------------------ |
| Region                 | 18 régions                | code (2 chars)   | Polygon + centroid |
| Departement            | 101 départements          | code (2-3 chars) | Polygon + centroid |
| Commune                | ~35 000 communes          | code (5 chars)   | centroid           |
| Groupement             | 9 702 EPCI/syndicats      | siren (9 chars)  | Polygon + centroid |
| GisementChaleur        | Chaleur fatale            | UUID             | Point              |
| InstallationProduction | Chaufferies, solaire      | UUID             | Point              |
| PlateformeStockageBois | Stockage bois             | UUID             | Point              |
| ReseauChaleurFroid     | Réseaux C&F               | UUID             | MultiLineString    |
| ZoneOpportunite        | Zones potentiel           | UUID             | MultiPolygon       |
| Laureat                | Lauréats ACTEE/CHENE      | UUID             | -                  |
| EconomeFlux            | Économes de flux          | UUID             | -                  |
| Structure              | Structures employeuses    | UUID             | Point              |
| AdminUser              | Comptes admin             | UUID             | -                  |
| BatchMatchRequest      | Requêtes batch            | UUID             | -                  |
| ApiKey                 | Clés API                  | UUID             | -                  |
| Alias                  | Noms alternatifs matching | UUID             | -                  |

### Types de groupements

```
EPCI_CC, EPCI_CA, EPCI_CU, EPCI_METROPOLE, EPCI_EPT
SYNDICAT, SYNDICAT_MIXTE, SYNDICAT_ENERGIE
PETR, PAYS, PNR, CAUE, ALEC, AREC
```

### Statistiques (14/02/2026)

| Catégorie   | Données                  | Enregistrements |
| ----------- | ------------------------ | --------------- |
| Territoires | Régions                  | 18              |
|             | Départements             | 101             |
|             | Communes                 | 34 875          |
|             | Groupements              | 9 702           |
| EnRezo      | Gisements chaleur        | 19 447          |
|             | Installations production | 1 763           |
|             | Plateformes bois         | 496             |
|             | Réseaux chaleur/froid    | 1 548           |
|             | Zones opportunité        | 55 675          |

### Performance

| Requête                   | Temps  |
| ------------------------- | ------ |
| 500 communes + géométries | ~60ms  |
| 18 régions                | ~10ms  |
| 1000 zones avec bbox      | ~200ms |
| Recherche full-text       | ~30ms  |

---

## Problèmes connus

1. **Zones très petites** : Les zones d'opportunité (~600m x 200m) sont invisibles au zoom < 15 sur une carte
2. **Rate limiting APIs sources** : Les APIs externes (CEREMA, geo.api.gouv.fr) peuvent appliquer du rate limiting lors des imports
3. **PostGIS + Prisma** : Les colonnes `geometry` utilisent `Unsupported("geometry")` dans Prisma, imposant du raw SQL pour les requêtes spatiales
4. **Next.js 14.2.18** : Cette version a des CVE connues. Mettre à jour vers 14.2.35+ dès que possible

---

## Contact

Projet développé dans le cadre du programme ACTEE/CHENE.

_Dernière mise à jour : 14/02/2026_
