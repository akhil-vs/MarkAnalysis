#!/bin/sh
# Disaster-recovery backup via pg_dump. Prefer this (or managed PITR) over the
# platform JSON export, which only merge-restores school profile + paper schedules.
#
# BACKUP_DIR   directory for marks-<UTC stamp>-NN.dump (default ./backups)
# BACKUP_KEEP  when set to a positive integer, delete older marks-*.dump files
#              in that directory only (not subdirectories) after a successful dump.
#              Unset or 0 does not delete anything, so a one-shot run cannot
#              remove dumps already stored there.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"

keep_arg="${BACKUP_KEEP:-}"
if [ -n "$keep_arg" ]; then
  case "$keep_arg" in
    *[!0-9]*)
      echo "BACKUP_KEEP must be a non-negative integer" >&2
      exit 1
      ;;
  esac
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
# Same-second runs must not overwrite each other. The numeric suffix sorts
# newest-first under `sort -r`, which is what retention uses.
seq=0
while true; do
  suffix=$(printf '%02d' "$seq")
  OUT_FILE="${OUT_DIR}/marks-${STAMP}-${suffix}.dump"
  [ -e "$OUT_FILE" ] || break
  seq=$((seq + 1))
  if [ "$seq" -gt 99 ]; then
    echo "Too many dumps in the same second under ${OUT_DIR}" >&2
    exit 1
  fi
done
# Prisma URLs append ?schema=public, which libpq rejects.
PG_URL="${DATABASE_URL%%\?*}"

echo "Writing ${OUT_FILE}"
pg_dump --format=custom --no-owner --no-acl --file="$OUT_FILE" "$PG_URL"
echo "Done. Restore with: pg_restore --clean --if-exists --no-owner --dbname=\"\$DATABASE_URL\" ${OUT_FILE}"
echo "That pg_restore replaces objects in the target database. Rehearse first with scripts/pg-dump-restore-check.sh (scratch database only)."

if [ -n "$keep_arg" ] && [ "$keep_arg" -gt 0 ]; then
  # Stamps sort newest-first. Only top-level marks-*.dump files are eligible.
  find "$OUT_DIR" -maxdepth 1 -type f -name 'marks-*.dump' | sort -r | awk -v keep="$keep_arg" 'NR > keep { print }' | while IFS= read -r old; do
    [ -n "$old" ] || continue
    rm -f -- "$old"
    echo "Pruned ${old}"
  done
fi
