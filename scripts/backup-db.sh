#!/usr/bin/env bash
# V4 Database Backup: pg_dump -> gzip -> backups/ (keep BACKUP_KEEP copies)
# Usage: bash scripts/backup-db.sh
set -euo pipefail

CONTAINER="${CONTAINER:-content-os-postgres}"
DB_USER="${DB_USER:-contentos}"
DB_NAME="${DB_NAME:-contentos}"
KEEP="${BACKUP_KEEP:-14}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DIR/contentos-$STAMP.sql.gz"

mkdir -p "$DIR"

echo "Backup $DB_NAME from container $CONTAINER ..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --clean --if-exists | gzip > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
COUNT=$(ls -1t "$DIR"/contentos-*.sql.gz | wc -l | tr -d ' ')

# Remove old backups beyond KEEP
ls -1t "$DIR"/contentos-*.sql.gz | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old"
  echo "Removed old backup: $(basename "$old")"
done

echo "DONE: $FILE ($SIZE, $COUNT copies)"
