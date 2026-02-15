#!/bin/bash
# Backup PostgreSQL pour API Territoires
set -e

BACKUP_DIR="/root/services/api-territoires/backups"
DATE=$(date +%Y-%m-%d_%H%M)
CONTAINER="territoires-db"
DB_NAME="territoires"
DB_USER="territoires"
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Démarrage backup $DB_NAME..."

docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/backup-$DATE.sql.gz"

SIZE=$(du -h "$BACKUP_DIR/backup-$DATE.sql.gz" | cut -f1)
echo "[$(date)] Backup créé : backup-$DATE.sql.gz ($SIZE)"

# Nettoyage des anciens backups
find "$BACKUP_DIR" -name "backup-*.sql.gz" -mtime +$KEEP_DAYS -delete
COUNT=$(ls "$BACKUP_DIR"/backup-*.sql.gz 2>/dev/null | wc -l)
echo "[$(date)] $COUNT backups conservés (max $KEEP_DAYS jours)"
