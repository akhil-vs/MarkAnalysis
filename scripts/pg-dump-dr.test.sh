#!/bin/sh
# Guards for the disaster-recovery scripts. No database required.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

if DATABASE_URL= sh "$ROOT/scripts/pg-dump-backup.sh" 2>"$TMP/err"; then
  fail "backup should require DATABASE_URL"
fi

mkdir -p "$TMP/bin"
cat > "$TMP/bin/psql" << 'EOF'
#!/bin/sh
echo "psql should not run" >&2
exit 99
EOF
cat > "$TMP/bin/pg_dump" << 'EOF'
#!/bin/sh
echo "pg_dump should not run" >&2
exit 99
EOF
chmod +x "$TMP/bin/psql" "$TMP/bin/pg_dump"

export PATH="$TMP/bin:$PATH"

if DATABASE_URL='postgresql://marks:marks@localhost:5432/marks?schema=public' \
  RESTORE_CHECK_DB=marks \
  sh "$ROOT/scripts/pg-dump-restore-check.sh" 2>"$TMP/err"; then
  fail "restore check should refuse the live database name"
fi
grep -q 'Refusing to drop marks' "$TMP/err" || fail "missing refuse message for the live database"

for blocked in postgres template0 template1; do
  if DATABASE_URL='postgresql://marks:marks@localhost:5432/marks' \
    RESTORE_CHECK_DB="$blocked" \
    sh "$ROOT/scripts/pg-dump-restore-check.sh" 2>"$TMP/err"; then
    fail "should refuse $blocked"
  fi
done

if DATABASE_URL='postgresql://marks:marks@localhost:5432/marks' \
  RESTORE_CHECK_DB='marks;drop' \
  sh "$ROOT/scripts/pg-dump-restore-check.sh" 2>"$TMP/err"; then
  fail "should refuse an unsafe scratch name"
fi

cat > "$TMP/bin/pg_dump" << 'EOF'
#!/bin/sh
out=""
prev=""
for arg in "$@"; do
  case "$arg" in
    --file=*) out=${arg#--file=} ;;
  esac
  if [ "$prev" = "--file" ]; then
    out=$arg
  fi
  prev=$arg
done
if [ -z "$out" ]; then
  echo "fake pg_dump: missing --file" >&2
  exit 1
fi
printf 'dump' > "$out"
EOF
chmod +x "$TMP/bin/pg_dump"

DIR="$TMP/backups"
mkdir -p "$DIR"
printf x > "$DIR/marks-20200101T000000Z.dump"
printf x > "$DIR/marks-20200102T000000Z.dump"
printf x > "$DIR/marks-20200103T000000Z.dump"
printf keep > "$DIR/notes.txt"
mkdir -p "$DIR/nested"
printf x > "$DIR/nested/marks-19990101T000000Z.dump"

DATABASE_URL='postgresql://marks:marks@localhost:5432/marks' \
  BACKUP_DIR="$DIR" \
  sh "$ROOT/scripts/pg-dump-backup.sh" >/dev/null
count=$(find "$DIR" -maxdepth 1 -type f -name 'marks-*.dump' | wc -l)
[ "$count" -eq 4 ] || fail "unset BACKUP_KEEP pruned dumps (count=$count)"
[ -f "$DIR/notes.txt" ] || fail "notes.txt removed"
[ -f "$DIR/nested/marks-19990101T000000Z.dump" ] || fail "nested dump removed"

# The fake pg_dump records its last argument (the URL) in the dump body.
cat > "$TMP/bin/pg_dump" << 'EOF'
#!/bin/sh
out=""
prev=""
url=""
for arg in "$@"; do
  case "$arg" in
    --file=*) out=${arg#--file=} ;;
  esac
  if [ "$prev" = "--file" ]; then
    out=$arg
  fi
  case "$arg" in
    --file|--file=*) ;;
    *) url=$arg ;;
  esac
  prev=$arg
done
if [ -z "$out" ]; then
  echo "fake pg_dump: missing --file" >&2
  exit 1
fi
printf '%s' "$url" > "$out"
EOF
chmod +x "$TMP/bin/pg_dump"

DATABASE_URL='postgresql://marks:secret@localhost:5432/marks?schema=public' \
  BACKUP_DIR="$DIR" \
  BACKUP_KEEP=2 \
  sh "$ROOT/scripts/pg-dump-backup.sh" >/dev/null
count=$(find "$DIR" -maxdepth 1 -type f -name 'marks-*.dump' | wc -l)
[ "$count" -eq 2 ] || fail "BACKUP_KEEP=2 left $count dumps"
[ -f "$DIR/notes.txt" ] || fail "notes.txt removed during prune"
[ -f "$DIR/nested/marks-19990101T000000Z.dump" ] || fail "nested dump pruned"
newest=$(find "$DIR" -maxdepth 1 -type f -name 'marks-*.dump' | sort -r | head -n 1)
grep -q 'schema=public' "$newest" && fail "pg_dump URL still contains schema query" || true
grep -q '/marks$' "$newest" || fail "pg_dump URL lost the database name: $(cat "$newest")"

if DATABASE_URL='postgresql://x' BACKUP_DIR="$DIR" BACKUP_KEEP=abc \
  sh "$ROOT/scripts/pg-dump-backup.sh" 2>"$TMP/err"; then
  fail "invalid BACKUP_KEEP should fail"
fi

echo "pg_dump DR script checks passed"
