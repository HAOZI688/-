#!/usr/bin/env bash
# V4 Database Restore
# Usage:
#   bash scripts/restore-db.sh backups/contentos-XXXX.sql.gz          # restore to VERIFY db (safe)
#   bash scripts/restore-db.sh backups/contentos-XXXX.sql.gz --write  # write to main db (dangerous!)
set -euo pipefail

CONTAINER="${CONTAINER:-content-os-postgres}"
DB_USER="${DB_USER:-contentos}"
DB_NAME="${DB_NAME:-contentos}"
VERIFY_DB="${DB_NAME}_restore_test"

FILE="${1:?Usage: restore-db.sh <backup.sql.gz> [--write]}"
WRITE="${2:-}"

[ -f "$FILE" ] || { echo "ERROR: backup file not found: $FILE"; exit 1; }

if [ "$WRITE" = "--write" ]; then
  TARGET="$DB_NAME"
  echo "WARNING: restoring into MAIN database $TARGET in 10 seconds (Ctrl+C to cancel)..."
  sleep 10
else
  TARGET="$VERIFY_DB"
  echo "Restoring to VERIFY database $TARGET (safe mode; add --write to touch main db)"
  EXISTS=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='$TARGET'" | tr -d ' \n')
  if [ "$EXISTS" != "1" ]; then
    docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $TARGET OWNER $DB_USER" >/dev/null
  fi
  docker exec "$CONTAINER" psql -U "$DB_USER" -d "$TARGET" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
fi

echo "Restoring: $(basename "$FILE") -> $TARGET"
gunzip -c "$FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$TARGET" -q 2>&1 | grep -v "does not exist, skipping" || true

TABLES=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$TARGET" -tc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" | tr -d ' ')
echo "DONE: $TARGET restored ($TABLES tables in public schema)"

if [ "$WRITE" != "--write" ]; then
  TOPICS=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$TARGET" -tc "SELECT count(*) FROM topics" | tr -d ' ')
  SNAPS=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$TARGET" -tc "SELECT count(*) FROM post_metric_snapshots" | tr -d ' ')
  echo "VERIFY: topics=$TOPICS post_metric_snapshots=$SNAPS"
  echo "Cleanup verify db: docker exec $CONTAINER psql -U $DB_USER -d postgres -c \"DROP DATABASE $TARGET\""
fi
