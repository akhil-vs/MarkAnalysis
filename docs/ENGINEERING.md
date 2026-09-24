# Engineering notes — School Marks Analytics

## Schema & migrations

- **Source of truth:** `server/src/prisma/contract.prisma` + `server/migrations/app/*`
- Prefer `npx prisma db migrate --advance-ref db` (CI workflow **Migrate database**, API boot, Docker).
- Embedded catch-up (`ensurePendingSchema` in `ensureSchema.js`) is a **fallback**:
  - Runs on Vercel cold start by default (cold-start budget)
  - Runs when migrate fails/skips, unless `ALLOW_ENSURE_SCHEMA_FALLBACK=false`
  - **Skipped** after a successful migrate unless `FORCE_ENSURE_SCHEMA=true`
  - Disabled entirely with `SKIP_ENSURE_SCHEMA=true`

## Auth & security

- Set `trust proxy` via `TRUST_PROXY` (defaults to 1 hop on Vercel/production). Rate limits use `req.ip` only — never raw `X-Forwarded-For`.
- CSP enforces in production/Vercel by default; set `CSP_ENFORCE=false` to stay report-only.
- Passwords: min 10 chars, letter + number (`validatePasswordPolicy`). Hashing via `bcryptjs` (`hashPassword` / `verifyPassword`).
- Optional error reporting: set `SENTRY_DSN` and install `@sentry/node`.

## Observability

- Structured JSON logs (`LOG_LEVEL=debug|info|warn|error`)
- Request middleware logs method/path/status/duration
- Public `GET /api/health` and `?deep=1` (DB ping only). Schema inventory is **platform admin** `/api/platform/health/deep` only.
- Responses include `X-API-Version: 1` (current surface is unversioned `/api/*` = v1).

## Prisma release channel

Production dependencies currently track **Prisma ORM 8 release candidates** (`prisma` / `@prisma/orm-postgres`). Pin or upgrade to a stable 8.x once available; treat RC bumps as high-risk dependency changes.

## Deferred / follow-on

- Object storage / CDN for student photos (still DB bytes)
- Shared Redis (or similar) cache for multi-instance analytics
- Billing / entitlements (pricing UI exists; public plans CTAs remain off — sales-led / invite-only GTM)
- Full OpenAPI document (version header is the interim contract marker)

See also [PRIVACY.md](./PRIVACY.md) and [SECURITY.md](../SECURITY.md).
