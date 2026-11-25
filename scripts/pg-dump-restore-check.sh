#!/usr/bin/env bash
# Prove pg_dump can be restored. Uses a scratch database on the same server
# as DATABASE_URL and drops it afterwards. Does not upload the dump.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

ROOT_URL="${DATABASE_URL%/*}/postgres"
SCRATCH_DB="${RESTORE_CHECK_DB:-marks_restore_check}"
SCRATCH_URL="${DATABASE_URL%/*}/${SCRATCH_DB}"
DUMP="$(mktemp)"
cleanup() {
  rm -f "$DUMP"
  psql "$ROOT_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\";" >/dev/null
}
trap cleanup EXIT

echo "Dumping ${DATABASE_URL%%\?*}"
pg_dump --format=custom --no-owner --no-acl --file="$DUMP" "$DATABASE_URL"

psql "$ROOT_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\";"
psql "$ROOT_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${SCRATCH_DB}\";"
# PostgreSQL 17+ clients emit SET transaction_timeout, which a 16 server rejects.
pg_restore --no-owner -f - "$DUMP" \
  | grep -v -E '^SET transaction_timeout[[:space:]]' \
  | psql "$SCRATCH_URL" -v ON_ERROR_STOP=1
psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 -c "SELECT 1 AS restored;"
echo "Restore check passed"
