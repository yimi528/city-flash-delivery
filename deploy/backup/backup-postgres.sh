#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set to the production PostgreSQL connection string}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/city-flash/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$BACKUP_DIR/city-flash-$timestamp.dump"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > "$output"
chmod 600 "$output"
find "$BACKUP_DIR" -type f -name 'city-flash-*.dump' -mtime "+$RETENTION_DAYS" -delete
printf '%s\n' "created $output"
