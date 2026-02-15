# Guide de contribution - API Territoires

## Prise en main rapide

### 1. Installation

```bash
cd /root/services/api-territoires
npm install
npx prisma generate
npm run dev
```

### 2. Vérifier que tout fonctionne

```bash
# API Territoires
curl http://localhost:3020/api/v1/territoires/health

# API EnRezo
curl http://localhost:3020/api/v1/enrezo
```

### 3. Explorer la base de données

```bash
npx prisma studio
```

---

## Structure du code

### Endpoints API

Tous les endpoints sont dans `src/app/api/v1/`:

| Dossier        | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `territoires/` | API territoriale (régions, départements, communes, groupements) |
| `enrezo/`      | Données énergétiques CEREMA                                     |
| `laureats/`    | Lauréats ACTEE/CHENE                                            |
| `economes/`    | Économes de flux                                                |
| `structures/`  | Structures employeuses                                          |

### Ajouter un nouvel endpoint

1. Créer `src/app/api/v1/mon-endpoint/route.ts`
2. Exporter les méthodes HTTP (GET, POST, etc.)
3. Utiliser le client Prisma depuis `@/lib/prisma`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const data = await prisma.monModele.findMany()
  return NextResponse.json(data)
}
```

### Modifier le schéma

1. Éditer `prisma/schema.prisma`
2. Appliquer les changements:

```bash
npx prisma db push
npx prisma generate
```

---

## Scripts d'import

### Exécuter un script

```bash
# En local
npx tsx scripts/import-enrezo.ts

# Dans le container
docker exec api-territoires npx tsx scripts/import-enrezo.ts
```

### Créer un nouveau script

1. Créer `scripts/mon-script.ts`
2. Importer Prisma:

```typescript
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Votre code ici
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

---

## PostGIS et géométries

### Requêtes spatiales (raw SQL)

```typescript
// Récupérer une géométrie en GeoJSON
const result = await prisma.$queryRaw`
  SELECT id, nom, ST_AsGeoJSON(geometry)::json as geojson
  FROM zone_opportunite
  WHERE geometry && ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326)
`
```

### Coordonnées GeoJSON

**Important:** GeoJSON utilise l'ordre `[longitude, latitude]`, pas `[latitude, longitude]`.

---

## Conventions

### Nommage

- Tables SQL: snake_case (`zone_opportunite`)
- Modèles Prisma: PascalCase (`ZoneOpportunite`)
- Champs Prisma: camelCase (`codeInsee`)
- Mapping via `@map()` et `@@map()`

### CORS

Tous les endpoints incluent:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
}
```

---

## Déploiement

### Build local

```bash
npm run build
```

### Build Docker

```bash
# IMPORTANT: Limiter le CPU sur ce serveur
run-limited -c 50 docker build -t api-territoires .
```

### Déployer

Voir la section "Déploiement" dans README.md.

---

## Debugging

### Logs API

```bash
docker logs -f api-territoires
```

### Prisma debug

```bash
DEBUG="prisma:*" npm run dev
```

### Test endpoint

```bash
# Avec curl
curl -v "http://localhost:3020/api/v1/enrezo?type=zone&limit=10"

# Avec jq pour formater
curl -s "http://localhost:3020/api/v1/territoires/health" | jq .
```

---

## Ressources

- [Prisma Docs](https://www.prisma.io/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [PostGIS Reference](https://postgis.net/docs/reference.html)
- [CEREMA EnRezo WFS](https://www.cerema.fr/fr/activites/services/enrezo)
