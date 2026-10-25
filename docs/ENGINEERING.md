# Engineering notes — School Marks Analytics

## Schema & migrations

- **Source of truth:** `server/src/prisma/contract.prisma` + `server/migrations/app/*`
- Prefer `npx prisma db migrate --advance-ref db` (CI workflow **Migrate database**, API boot, Docker).
- Embedded catch-up (`ensurePendingSchema` in `ensureSchema.js`) is a **fallback only**:
  - Runs on Vercel cold start by default (cold-start budget; **not** a substitute for CI migrate)
  - Runs when migrate fails/skips, unless `ALLOW_ENSURE_SCHEMA_FALLBACK=false` (fail-closed)
  - **Skipped** after a successful migrate unless `FORCE_ENSURE_SCHEMA=true`
  - Disabled entirely with `SKIP_ENSURE_SCHEMA=true`
  - Production SoT remains the **Migrate database** GitHub Action / Docker migrate step — do not rely on ensure alone for new columns
- Do not edit legacy `server/prisma/schema.prisma` / `server/prisma/migrations/*` for new work.
- Interactive Prisma `$transaction` clients are wrapped with the same tenant proxy as the root client.

## Auth & security

- Set `trust proxy` via `TRUST_PROXY` (defaults to 1 hop on Vercel/production). Rate limits use `req.ip` only — never raw `X-Forwarded-For`.
- CSP enforces in production/Vercel by default; set `CSP_ENFORCE=false` to stay report-only.
- Passwords: min 10 chars, letter + number (`validatePasswordPolicy`). Hashing via `bcryptjs` (`hashPassword` / `verifyPassword`).
- Optional error reporting: set `SENTRY_DSN` (`@sentry/node` is a server dependency).

## School pilots

- Public form: `POST /api/pilot-requests` (rate-limited) → `PilotRequest` rows.
- Platform admin: `GET/PATCH /api/platform/pilot-requests`, `POST .../provision` (creates school + principal).
- Schema catch-up: `ensurePilotRequestsSchema` in `ensureSchema.js` (also listed in `CATCHUP_MIGRATION_NAMES`).
- Notify: `queueEmail` with `kind: "pilot_request"` when `PILOT_NOTIFY_EMAIL` or `VITE_PILOT_CONTACT_EMAIL` is set.
- Sales materials: [`docs/pitch/`](./pitch/README.md) · readiness: [`docs/SCHOOL_PILOT_READINESS.md`](./SCHOOL_PILOT_READINESS.md).

## Observability

- Structured JSON logs (`LOG_LEVEL=debug|info|warn|error`)
- Request middleware logs method/path/status/duration
- Public `GET /api/health` and `?deep=1` (DB ping only). Schema inventory is **platform admin** `/api/platform/health/deep` only.
- Responses include `X-API-Version: 1` (current surface is unversioned `/api/*` = v1).

## Prisma release channel

Production dependencies currently track **Prisma ORM 8 release candidates** (`prisma` / `@prisma/orm-postgres`). Pin or upgrade to a stable 8.x once available; treat RC bumps as high-risk dependency changes.

## Backups & DR

- Platform JSON backup (`POST /api/platform/backup`) exports configuration-oriented rows and **merge-restores only school profile fields + exam paper schedules**. Response includes `restoreCapabilities`.
- For disaster recovery use `scripts/pg-dump-backup.sh` (or managed Postgres PITR), not the JSON export.

## Blob storage

- Default: logos/photos as Postgres bytes.
- Optional filesystem backend: `BLOB_STORAGE=filesystem` + `BLOB_STORAGE_PATH=…` stores files and sets `logoStorageKey` / `photoStorageKey`.

## Background jobs

- Long-running API (`server/src/index.js`) can flush the email outbox and run digests via `ENABLE_BACKGROUND_JOBS` (on by default in non-Vercel production). Disabled on Vercel — use platform **Run digests** / **Flush mail** there.

## Deferred / follow-on

- Shared Redis (or similar) cache for multi-instance analytics
- S3/CDN backend for `blobStore.js` (filesystem path is the interim off-DB option)
- Billing / entitlements (pricing UI exists; public plans CTAs remain off — sales-led / invite-only GTM via `/request-pilot`)
- Full OpenAPI document (version header is the interim contract marker)
- Postgres RLS / composite tenant FKs for defense-in-depth beyond the ALS proxy

See also [PRIVACY.md](./PRIVACY.md), [SCHOOL_PILOT_READINESS.md](./SCHOOL_PILOT_READINESS.md), and [SECURITY.md](../SECURITY.md).
