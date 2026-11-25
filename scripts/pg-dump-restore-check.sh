#!/bin/sh
# Prove pg_dump can be restored. Uses a scratch database on the same server
# as DATABASE_URL and drops that scratch database afterwards. Does not upload
# the dump and does not run pg_restore against the live database.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

ROOT_URL="${DATABASE_URL%/*}/postgres"
SCRATCH_DB="${RESTORE_CHECK_DB:-marks_restore_check}"
SCRATCH_URL="${DATABASE_URL%/*}/${SCRATCH_DB}"

source_path="${DATABASE_URL##*/}"
source_db="${source_path%%\?*}"

case "$SCRATCH_DB" in
  ""|*[!A-Za-z0-9_]*)
    echo "RESTORE_CHECK_DB must be a single identifier (letters, digits, underscore)" >&2
    exit 1
    ;;
esac

case "$SCRATCH_DB" in
  "$source_db"|postgres|template0|template1)
    echo "Refusing to drop ${SCRATCH_DB}: RESTORE_CHECK_DB must be a scratch name, not the live database or a system database" >&2
    exit 1
    ;;
esac

if [ -z "$source_db" ]; then
  echo "DATABASE_URL has no database name" >&2
  exit 1
fi

DUMP="$(mktemp)"
SQL="$(mktemp)"
cleanup() {
  rm -f "$DUMP" "$SQL" "${SQL}.filtered"
  psql "$ROOT_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\";" >/dev/null
}
trap cleanup EXIT

# Prisma URLs append ?schema=public, which libpq rejects.
PG_URL="${DATABASE_URL%%\?*}"

echo "Dumping ${PG_URL}"
pg_dump --format=custom --no-owner --no-acl --file="$DUMP" "$PG_URL"

psql "$ROOT_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\";"
psql "$ROOT_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${SCRATCH_DB}\";"
# PostgreSQL 17+ clients emit SET transaction_timeout, which a 16 server rejects.
pg_restore --no-owner -f "$SQL" "$DUMP"
grep -v -E '^SET transaction_timeout[[:space:]]' "$SQL" > "${SQL}.filtered" || true
mv "${SQL}.filtered" "$SQL"
psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 -f "$SQL"
psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 -c "SELECT 1 AS restored;"
echo "Restore check passed"
