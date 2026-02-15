#!/bin/bash
# =============================================================================
# Setup développement - API Territoires
# =============================================================================
# Usage : ./scripts/setup-dev.sh
# Ce script initialise l'environnement de développement complet.

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== API Territoires - Setup développement ===${NC}"
echo ""

# 1. Vérifier Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js n'est pas installé. Installez Node.js 20+${NC}"
    exit 1
fi
echo -e "${GREEN}[OK]${NC} Node.js $(node -v)"

# 2. Installer les dépendances
echo -e "${YELLOW}[...]${NC} Installation des dépendances..."
npm install
echo -e "${GREEN}[OK]${NC} Dépendances installées"

# 3. Fichier .env
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}[OK]${NC} Fichier .env créé depuis .env.example"
    echo -e "${YELLOW}    → Éditez .env si vous n'utilisez pas Docker${NC}"
else
    echo -e "${GREEN}[OK]${NC} Fichier .env existant conservé"
fi

# 4. Lancer la base de données Docker
if command -v docker &> /dev/null; then
    echo -e "${YELLOW}[...]${NC} Démarrage de la base de données..."
    docker compose up -d territoires-db
    echo -e "${YELLOW}[...]${NC} Attente que PostgreSQL soit prêt..."
    sleep 5
    echo -e "${GREEN}[OK]${NC} Base de données démarrée"
else
    echo -e "${YELLOW}[SKIP]${NC} Docker non disponible - assurez-vous que PostgreSQL+PostGIS est accessible"
fi

# 5. Prisma
echo -e "${YELLOW}[...]${NC} Génération du client Prisma..."
npx prisma generate
echo -e "${GREEN}[OK]${NC} Client Prisma généré"

echo -e "${YELLOW}[...]${NC} Application du schéma à la base..."
npx prisma db push
echo -e "${GREEN}[OK]${NC} Schéma appliqué"

# 6. Import des données (optionnel)
echo ""
read -p "Importer les données territoriales depuis geo.api.gouv.fr ? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}[...]${NC} Import en cours (~10 minutes)..."
    npx tsx scripts/import-territoires.ts --all
    echo -e "${GREEN}[OK]${NC} Données importées"
else
    echo -e "${YELLOW}[SKIP]${NC} Import ignoré. Lancez plus tard : npx tsx scripts/import-territoires.ts --all"
fi

# 7. Vérification
echo ""
echo -e "${GREEN}=== Setup terminé ===${NC}"
echo ""
echo "Commandes utiles :"
echo "  npm run dev           → Démarrer le serveur (port 3020)"
echo "  npm test              → Lancer les tests"
echo "  npx prisma studio     → Explorer la base de données"
echo "  curl localhost:3020/api/v1/territoires/health  → Health check"
echo ""
