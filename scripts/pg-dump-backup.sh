#!/usr/bin/env bash
# Disaster-recovery backup via pg_dump. Prefer this (or managed PITR) over the
# platform JSON export, which only merge-restores school profile + paper schedules.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${OUT_DIR}/marks-${STAMP}.dump"

echo "Writing ${OUT_FILE}"
pg_dump --format=custom --no-owner --no-acl --file="$OUT_FILE" "$DATABASE_URL"
echo "Done. Restore with: pg_restore --clean --if-exists --no-owner --dbname=\"\$DATABASE_URL\" ${OUT_FILE}"
