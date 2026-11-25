# Launch audit — TermLens

Reviewed 25 November 2026 (Europe/London) against the tree on `main`. This is a read-only audit: no application code was changed.

Method: source and config review, `npm audit` in `client/` and `server/`, and a production client build (`vite build`, 768 modules, exit 0, no warnings). Server tests, Playwright, and a browser pass were not run. Hosting, DNS, TLS, backups, and legal sign-off cannot be proven from the repo; those items are under [Questions](#questions-for-me).

Rank key: 🔴 Blocker (must fix before launch) · 🟠 High · 🟡 Medium · 🟢 Nice-to-have.

**Verdict:** no unconditional code blocker. The app is closer to a controlled pilot than to an open launch. Six high findings should be closed or explicitly accepted, and the operator checklist in section 10 must be confirmed on the real host. If the public site is the Docker Compose web container, finding O1 becomes a blocker for uploads.

---

## 1. Architecture and code quality

**Status: FAIL** (0 blockers, 2 high, 2 medium)

### Checklist

| Check | Result |
|---|---|
| Stack is identifiable and documented | Pass — React 19 + Vite 6 + Tailwind 3 + Recharts; Express 5; Prisma ORM 8; PostgreSQL 16 (`README.md` lines 30–35, `package.json`, `docker-compose.yml`) |
| Folder layout matches the runtime | Pass — `client/` SPA, `server/` API, `api/index.js` Vercel entry, `e2e/`, `docs/` |
| Dead code / duplicate sources of truth | Fail — see A2, A4 |
| `TODO` / `FIXME` / debug leftovers | Pass — no `TODO`/`FIXME` in application source. `console.error` / `console.warn` calls are operational logs, not debug dumps. One-off `console.log` calls live in scripts and the seed |
| Type safety | Fail — application code is JavaScript. `server/tsconfig.json` covers Prisma migration snapshots, not route handlers |
| Lint | Fail — `npm run lint` is a syntax parse (`scripts/syntax-check.mjs`). No ESLint or typecheck |
| Production client build | Pass — `vite build` completed with no warnings. Largest chunks: `charts` 421.66 kB (gzip 112.81 kB), `vendor-react` 234.12 kB (gzip 74.96 kB), `index` 102.36 kB (gzip 31.68 kB) |
| Dependencies current and clean | Fail — see A1 and S1 |

### Findings

#### A1 🟠 Production API depends on Prisma 8 release candidates

`server/package.json` lines 27–48 depend on `@prisma/cli-engine` `^0.3.0`, `@prisma/orm-postgres` `^8.0.0-rc.11`, and `prisma` `^8.0.0-rc.14`. `docs/ENGINEERING.md` lines 39–40 already say to treat RC bumps as high-risk and to pin a stable 8.x when one exists. A pre-launch ORM RC means a breaking CLI or runtime change can land from a lockfile refresh.

#### A2 🟠 Three ways to change the database

The documented source of truth is `server/src/prisma/contract.prisma` plus `server/migrations/app/*` (`docs/ENGINEERING.md` lines 3–13). Two other writers remain:

- Legacy Prisma SQL history under `server/prisma/schema.prisma` and `server/prisma/migrations/` (explicitly “do not edit”, but still in the tree).
- `server/src/lib/ensureSchema.js`, which runs `ALTER` / `$executeRawUnsafe` as a cold-start fallback. Production health treats `vercel-ensure-only` and `migrate-failed-ensure-fallback` as unhealthy unless `ALLOW_VERCEL_ENSURE_ONLY=true` (`server/src/lib/health.js` lines 10–24).

A database that was shaped by ensure-only catch-up can disagree with a fresh `prisma db migrate`.

#### A3 🟡 No static types or style lint on the app

Client and server request paths are `.js` / `.jsx`. CI job `lint` (`.github/workflows/ci.yml` lines 44–59) only runs `node scripts/syntax-check.mjs`. Undefined properties, wrong status codes, and unused exports are not caught before merge.

#### A4 🟡 Root `package.json` vendors a second, older API dependency set

Root `package.json` lines 22–36 list Express, Prisma RC, `csv-parse` `^5.6.0`, `exceljs`, and `multer`, while the API that actually runs is `server/package.json` (`csv-parse` `^7.0.3`, plus `helmet`, `@sentry/node`, `nodemailer`). Vercel’s `installCommand` in `vercel.json` lines 3–5 installs `server/` and `client/` only. The root lockfile is still installed by the CI lint job and can drift from the server lockfile.

---

## 2. Frontend / design / UX

**Status: FAIL** (0 blockers, 0 high, 4 medium)

### Checklist

| Check | Result |
|---|---|
| Responsive layout | Pass on inspection — viewport meta (`client/index.html` line 5), `sm:` / `lg:` breakpoints, 44px-class field heights (`client/src/index.css` line 137), phone task bar (`client/src/components/MobileTaskBar.jsx` lines 22–26). Platform console pages were opened at 1280 and 390; the rest of the app was not rechecked in a browser |
| Design tokens | Pass — ink / paper / cream / clay / moss and IBM Plex + Source Serif in `client/tailwind.config.js` lines 10–27. Not every screen uses only those tokens |
| Loading, empty, and error states | Partial — platform home, schools, and pilot inbox show `LoadError` when the load fails (F1). Analysis home still hides a failed insight fetch (F6). Many desks already use `LoadError` |
| Form validation and messages | Pass — shared parsers in `client/src/lib/formValidation.js`, used by login and signup, with `FieldError`. API errors go through `client/src/lib/apiErrorMessage.js` |
| Accessibility | Fail — see F2 and F4. Focus rings exist on `.field` (`client/src/index.css` line 137). Menu buttons have `aria-label` (`client/src/components/Layout.jsx` lines 380, 457) |
| SEO | Partial — see F3. `client/index.html` lines 7–20 has description, `og:title`, `og:description`, `og:type`, favicon, `lang="en"` |
| Performance | Partial — route-level `lazy()` in `client/src/App.jsx`, Recharts split in `client/vite.config.js` lines 6–21. See F4 |
| 404 / 500 | Partial — `path="*"` renders `NotFound` (`client/src/App.jsx` line 257). No `/500` route; render crashes hit `ErrorBoundary` (`client/src/components/ErrorBoundary.jsx` lines 19–31) |
| Broken links / hardcoded copy | Pass for product URLs. Vendor fallback `https://www.pencillabs.space/` is intentional (`client/src/lib/branding.js` line 10) |

### Findings

#### F1 Resolved — a failed platform load shows an error

Platform home, schools, and the pilot inbox still toast on failure. They now also set an error and render `LoadError` instead of `LoadingState` when there is nothing to show. A later refresh that fails keeps the list that already loaded and repeats `LoadError` above it. Deep health on the platform home shows `LoadError` in the Live ops card instead of an empty `catch`. The copy and clay alert style are the same component the other desks use.

#### F2 🟡 Several controls are unnamed for assistive tech

Sign-in and MFA labels are not tied to inputs (`client/src/pages/Login.jsx` lines 138–157 and 195–238): no `htmlFor` / `id`. Signup does this correctly (`client/src/pages/Signup.jsx` lines 79–151). Student photo thumbnails use `alt=""` (`client/src/pages/StudentPhotos.jsx` lines 57–59), so the photo is skipped rather than described. There is no skip link in `client/src/components/Layout.jsx`.

#### F3 🟡 Public SEO is a single static shell

`client/index.html` has one `<title>` and no `og:image`, `og:url`, canonical, or Twitter card. No route sets `document.title`. There is no `robots.txt` and no sitemap under `client/public/` (only `favicon.svg` and `help/`). Vercel rewrites every non-API path to `index.html` (`vercel.json` lines 7–9), so crawlers see the same title for `/privacy`, `/login`, and unknown URLs.

#### F4 🟡 Fonts and helper text

`client/index.html` lines 21–27 block first paint on Google Fonts, and the CSP must allow `fonts.googleapis.com` / `fonts.gstatic.com` (`vercel.json` lines 49–50). Helper labels use `text-ink-700/70` (`client/src/index.css` line 154) and the phone task bar uses `text-ink-700/55` (`MobileTaskBar.jsx` line 19). Those opacities on cream are likely under WCAG AA for small text; contrast was not measured in a browser.

The charts chunk is 421.66 kB raw / 112.81 kB gzip. It is split out of the entry, so the landing page does not download it, but the first analytics screen does.

#### F5 🟢 No dedicated 500 page

`ErrorBoundary` shows “Something went wrong on this page” and a reload button. It does not report to Sentry. API failures are handled per page, not by a shared server-error route.

#### F6 🟡 Analysis home hides a failed insight fetch

`client/src/pages/AnalysisHub.jsx` lines 23–28 set questions to `[]` on any error. The hub still renders, with no message that the question cards failed to load.

---

## 3. Backend / API

**Status: FAIL** (0 blockers, 0 high, 5 medium)

### Checklist

| Check | Result |
|---|---|
| Auth on staff routers | Pass — every staff router calls `use(auth)` or is mounted under `timetableRouter`, which does (`server/src/routes/timetable.js` lines 36–47). Public routes are login, signup, school lookup/register, pilot submit, portal session, health, and cron |
| Input validation | Partial — hand-written checks and `validatePasswordPolicy`. No shared schema library, so coverage varies by route |
| HTTP status and error shape | Pass — `{ error, code? }` from handlers and `toErrorPayload` (`server/src/lib/httpErrors.js`). Unknown `/api` paths return 404 (`server/src/app.js` lines 156–158) |
| Stack traces to clients | Pass in production — `toErrorPayload` replaces 500 messages with `"Server error"` when `NODE_ENV=production` (`httpErrors.js` lines 215–223). See B4 for the monitoring exception |
| Rate limiting | Partial — auth, signup, registration, join-code lookup, portal session, uploads, and backup are limited. Store fails closed in production (`server/src/lib/rateLimit.js` lines 13–17). No global limit |
| CORS | Pass — explicit allowlist, credentials on, no `*` reflection (`server/src/lib/corsAllowlist.js` lines 6–26, `server/src/app.js` lines 96–107) |
| Body size | Pass for JSON — `express.json({ limit: "2mb" })` (`app.js` line 109). File limits are 5 MB spreadsheets and 1 MB images. See O1 for the Docker proxy |
| Timeouts | Partial — Vercel function `maxDuration` 60 (`vercel.json` lines 63–67). Pool connect timeout 5s, 10s on serverless (`server/src/prisma/db.js` lines 15–29) |
| Race conditions | Pass for the paths reviewed — mark writes use `$transaction` (`server/src/lib/markSave.js` line 198). Refresh reuse outside a 15s window revokes all sessions (`server/src/lib/authCookies.js` lines 71–91) |
| Jobs, email, webhooks | Pass — flush retries `FAILED` mail up to 6 attempts with backoff and does not log the recipient or subject (B1). No inbound webhooks. Cron routes require a ≥16 character `CRON_SECRET` compared with `timingSafeEqual` (`server/src/lib/cronAuth.js` lines 7–18) |

### Findings

#### B1 Resolved — failed mail is retried, and logs omit the recipient

`flushEmailOutbox` still marks a new row `SKIPPED` when SMTP is unset, and it leaves an existing `FAILED` row alone so a later flush can send it once SMTP is configured. A send error stores `meta.mailAttempts` and `meta.retryAt` (15 minutes, then 1 hour, 4 hours, 12 hours, 24 hours) and the next flush selects that `FAILED` row until 6 attempts. `GET`/`POST /api/cron/mail` and `POST /api/platform/mail/flush` return counts only. Logs use the outbox id and kind (`mail_sent`, `mail_send_failed`, `mail_skipped_no_smtp`), not the address or subject. Rows that were already `FAILED` before this change have no attempt count, so the next flush treats them as due and may send them.

#### B2 🟡 `JWT_ACCESS_EXPIRES` does not change the cookie lifetime

`signToken` uses `process.env.JWT_ACCESS_EXPIRES || "15m"` (`server/src/middleware/auth.js` lines 263–275). The `sma_access` cookie `maxAge` is a hard-coded 15 minutes (`server/src/lib/authCookies.js` lines 7–8 and 36–37). `deployAuthConfig.js` lines 81–83 describe that variable as the access-cookie lifetime. Setting it to `5m` or `1h` makes the JWT and the cookie disagree. Refresh is 14 days (`authCookies.js` lines 8–9).

#### B3 🟡 Password reset is admin-only

Principals reset a staff password and force a change (`server/src/routes/users.js` lines 1021–1047). Platform admins can reset a principal (`server/src/routes/platform.js` line 458). There is no forgot-password or emailed reset. A principal who loses both password and MFA recovery codes needs the platform admin.

#### B4 🟡 Monitoring responses include `err.message`

`GET /api/monitoring/performance`, `/health`, and `/cache/stats` are platform-admin only (`server/src/routes/monitoring.js` lines 16–17), but failures return `err.message` (lines 39–44 and 80–85) instead of `toErrorPayload`. That can surface driver text to the admin browser.

#### B5 🟡 Upload and abuse limits are uneven

Spreadsheet parsing trusts the file extension (`server/src/lib/upload.js` lines 80–90). Logos and photos check PNG/JPEG magic bytes (`server/src/lib/school.js` lines 220–227). Authenticated analytics and list routes have no rate limit, so a logged-in client can hammer heavy reads. `POST /api/auth/change-password` (`auth.js` line 619) is not on `authWriteLimit`.

#### B6 🟡 Revocation and shared-computer sessions lag

Live staff identity is cached for 10 seconds (`server/src/middleware/auth.js` lines 55 and 109), so a suspension or demotion can apply one request late. Refresh cookies last 14 days with no idle timeout (`authCookies.js` lines 8–9). Logout does revoke the presented refresh token (`auth.js` lines 607–610).

#### B7 🟢 Portal bearer is stored in `sessionStorage`

Parent links are issued as `/portal#t=…` (`server/src/routes/portal.js` line 104), and the hash is stripped from the address bar (`client/src/pages/Portal.jsx` lines 8–18). The 12-hour portal JWT is then kept in `sessionStorage` (`Portal.jsx` lines 6 and 68). `GET /api/portal/marks` re-checks revocation (`portal.js` lines 188–202).

---

## 4. Database

**Status: FAIL** (0 blockers, 0 high, 2 medium)

### Checklist

| Check | Result |
|---|---|
| Types, FKs, uniques | Pass on the contract — `User.email` unique, `tenantId` FK with `onDelete: Cascade`, staff id unique per school (`server/src/prisma/contract.prisma` lines 159–183). Marks unique on `(studentId, subjectId, examId)` with status and tenant indexes (contract around the `Mark` model, `@@index` list from line 496) |
| Nullable columns that should be required | Pass for core identity — `passwordHash` and `role` are required. Guardian contact and photos are optional, which matches the product |
| Indexes for hot paths | Pass for tenant, exam status, notifications, timetable, and audit timestamps. See D2 for list shape |
| N+1 / unbounded reads | Partial — notifications are capped (`server/src/routes/notifications.js` lines 37–49). See D2 |
| Migrations ordered and in sync | Partial — forward-only Prisma 8 migrations are ordered by timestamp under `server/migrations/app/`. See A2. No `down` by design: rollback is the scheduled dump (D1), not an in-place down migration |
| Seed vs production | Pass with a footgun — wipe is refused in production unless `ALLOW_DESTRUCTIVE_SEED=true` (`server/prisma/seed.js` lines 296–299). See D3 |
| Backup, pool, transactions | Pass for backup — Compose `backup` runs `scripts/pg-dump-backup.sh` on `BACKUP_INTERVAL_SECONDS` into the `backups` volume (D1). Pool max 1 on serverless and 20 otherwise (`server/src/prisma/db.js` lines 15–29). Mark saves use a transaction |

### Findings

#### D1 Resolved — Compose schedules `pg_dump`, and restore is rehearsed on a scratch database

`scripts/pg-dump-backup.sh` still writes a custom-format dump. The Compose `backup` service now runs it on `BACKUP_INTERVAL_SECONDS` (default 86400, minimum 60) into the `backups` volume and, because that service sets `BACKUP_KEEP` (default 14), deletes older top-level `marks-*.dump` files after a successful dump. A one-shot run with `BACKUP_KEEP` unset does not delete existing files. `scripts/pg-dump-restore-check.sh` (CI, and `docker compose --profile rehearse run --rm backup-rehearse`) restores into a scratch database and refuses the live database name. Platform JSON backup remains a partial export (`docs/ENGINEERING.md`). App migrations stay forward-only on purpose (`operations` only, for example `server/migrations/app/20261008T1033_user_workspace/migration.ts` lines 12–13). A down migration was not added: reversing applied SQL is the change that would put existing rows at risk. Rollback is still restore a dump, or redeploy an older build against a compatible schema. A managed-Postgres launch still needs the provider's point-in-time recovery; this repo cannot turn that on.

#### D2 🟡 A class register is loaded in one query

`parsePageQuery` is unpaged unless the caller passes `page` or the route sets `defaultPaged` (`server/src/lib/pagination.js` lines 8–15). `GET /api/students` uses `defaultPaged: !scopedClass`, and the unpaged branch returns every matching student (`server/src/routes/students.js` lines 279–301). That is reasonable for one section of ~40 pupils and expensive if a client asks for many sections at once. `GET /api/platform/schools` can also return every school when paging is omitted (`server/src/routes/platform.js` lines 205–212).

#### D3 🟡 Seed skip log still advertises `password123`

When users already exist, `server/prisma/seed.js` lines 286–291 print that the platform admin is ensured “at admin@platform.edu (password123)”. Production `ensurePlatformAdmin` refuses to create or reset that password (`server/src/lib/ensurePlatformAdmin.js` lines 111–116). The log can send an operator to a password that login will reject (`server/src/routes/auth.js` lines 383–387).

---

## 5. Security

**Status: FAIL** (0 blockers, 2 high, 3 medium)

### Checklist

| Check | Result |
|---|---|
| Secrets in git | Pass — `.gitignore` ignores `.env` and `.env*` (lines 4–5 and 12). No `.env` file is tracked. History has no added `.env`. `password123` appears only as the documented demo password |
| `.env.example` | Pass — `server/.env.example` covers database, JWT, MFA, cookies, SMTP, cron, Sentry, seed, and blobs |
| Password hashing | Pass — bcryptjs, 10 rounds (`server/src/lib/password.js` lines 6–61). Production policy is ≥12 characters with upper, lower, and a digit (lines 12–40) |
| Session expiry, refresh, logout | Pass with B2 and B6 — httpOnly, `Secure` in production, `SameSite=Lax` (`authCookies.js` lines 19–42). Logout revokes the refresh token |
| Injection | Pass on review — raw SQL uses tagged templates or bound parameters. `server/src/lib/tenantSqlGuard.test.js` guards `$queryRawUnsafe`. No `dangerouslySetInnerHTML` |
| XSS / CSRF | Pass for the cookie design — `SameSite=Lax` plus CORS allowlist. CSP is enforced in production (`server/src/lib/securityHeaders.js` lines 8–34) and on the SPA (`vercel.json` lines 49–50, `client/nginx.conf` line 11). `style-src` includes `'unsafe-inline'` |
| SSRF | Pass — no user-controlled server-side fetch found |
| IDOR | Partial — tenant ALS proxy injects `tenantId` (`server/src/lib/tenant.js` lines 5–86). See S6 |
| File uploads | Partial — image magic bytes yes; spreadsheets no (B5). Photos are auth-gated and `Cache-Control: private, no-store` (`server/src/routes/students.js` lines 467–495) |
| Security headers / HTTPS | Partial — API Helmet includes HSTS by default. SPA `vercel.json` headers and `client/nginx.conf` do not set `Strict-Transport-Security`. See S4 |
| Dependency audit | Fail — see S1. Client audit: 0 vulnerabilities |
| PII, privacy, cookies | Partial — privacy page and `docs/PRIVACY.md` exist. No terms route (`client/src/App.jsx` line 168 is `/privacy` only). No third-party analytics, so a consent banner is not required for the current cookies. See S3 and S5 |

### Findings

#### S1 🟠 Server `npm audit` reports 12 highs, and CI ignores them

`npm audit` in `server/` on this review: 12 high, 6 moderate, 1 low, 0 critical. Highs are transitive through the Prisma 8 CLI (`lodash` template / prototype pollution, `hono` XSS and cache issues, `@hono/node-server` static-path bypass, `chevrotain`, `alchemy`). Application source does not import `lodash` or `hono`. `exceljs` is a runtime dependency at moderate (`uuid` buffer bounds). `.github/workflows/ci.yml` lines 32–42 fail the client audit at high, and run the server audit with `|| true` unless `AUDIT_STRICT=1`.

#### S2 🟠 Production can boot with no usable platform admin

`ensurePlatformAdmin` logs a warning and returns when it refuses the default password (`server/src/lib/ensurePlatformAdmin.js` lines 111–116). `ensureSeedPlatformAdmin` catches errors and does not fail the process (`server/src/lib/migrateOnStart.js` lines 196–208). `assertDeployAuthConfig` exits on a weak `JWT_SECRET` (`server/src/lib/deployAuthConfig.js` lines 23–28) but does not require `PLATFORM_ADMIN_PASSWORD`. A first production boot with only `JWT_SECRET` and `DATABASE_URL` serves traffic and has nobody who can provision schools.

Login does reject `password123` on a production host (`auth.js` lines 383–387), and `ALLOW_DEFAULT_PLATFORM_ADMIN` is opt-in.

#### S3 🟡 Pupil dashboard JSON sits in `sessionStorage` for 30 minutes

`client/src/lib/dashboardPrefetch.js` lines 34–60 persist the home dashboard (marks summaries, class lists) under `sma_dashboard_cache`, keyed by email. Any script that can run on the origin can read it. Logout clears it (`clearDashboardPrefetch`, lines 195–202). Login will paint that cache before the server accepts the password when the cache is still present (`client/src/auth.jsx` lines 127–138, `client/src/pages/Login.jsx` lines 46–49).

#### S4 🟡 TLS headers depend on the host you did not configure here

`client/nginx.conf` listens on port 80 only (line 2) and sets CSP, `X-Frame-Options`, and `nosniff`, not HSTS. `vercel.json` lines 34–56 do the same for the SPA. Helmet on the API process does set HSTS when the response comes from Express. A TLS terminator in front of Docker or Vercel’s edge may add HSTS; the repo does not.

#### S5 🟡 Privacy copy is not a terms or DPA pack

`/privacy` and `docs/PRIVACY.md` describe roles, retention, and backups, and they say the text is not legal advice (`docs/PRIVACY.md` lines 17–18 and 34). There is no terms page, no DPA template, and no record of a lawful basis for children’s marks and photos. `docs/SCHOOL_PILOT_READINESS.md` lines 21 and 73 leave that to the operator.

#### S6 🟢 Tenant isolation is application-level

`docs/ENGINEERING.md` line 65 defers Postgres RLS and composite tenant foreign keys. A raw query that forgets `tenantId` bypasses the proxy. The guard test reduces that risk; it is not a database backstop.

---

## 6. Testing

**Status: PASS** (0 blockers, 0 high, 1 medium)

### Checklist

| Check | Result |
|---|---|
| Unit tests | Pass — broad `node --test` coverage under `server/src/lib/**/*.test.js` and client `src/lib/*.test.js` |
| API integration | Pass in CI — `.github/workflows/ci.yml` job `api-integration` seeds Postgres 16 and runs `npm run test:api`, plus `scripts/pg-dump-restore-check.sh` |
| E2E | Pass in CI — Playwright on `ubuntu-24.04` for principal, coordinator, teacher, portal, and the marks cycle (`e2e/workflows/`) |
| Critical flows with no automated test | Fail — see T1. No payments product, so no payment tests |

### Findings

#### T1 🟡 Launch-critical UI and abuse cases are untested

Existing tests do not cover:

- An automated browser case for platform home / schools / pilot inbox when the API returns 500 (the screen now shows `LoadError` — F1).
- Keyboard names for login fields, photo alt text, or contrast.
- A spreadsheet larger than the edge body limit (finding O1).
- Load or multi-tenant isolation under concurrent mark saves.

### Proposed test plan (do not implement until approved)

1. **Unit:** cookie `maxAge` follows `JWT_ACCESS_EXPIRES`; `toErrorPayload` used by monitoring. Mailer retry is covered by `server/src/lib/mailer.test.js` and by `GET`/`POST /api/cron/mail` plus `POST /api/platform/mail/flush` in `server/src/test/api.mail.test.js`.
2. **API:** platform admin missing on production boot returns a non-2xx health or a documented degraded flag; student list with many section ids stays bounded; cron rejects a short secret (already present — keep it).
3. **E2E:** login → change temporary password → save a draft mark → coordinator approves → official consolidated download. Second spec: platform schools page shows an error, not a spinner, when overview is stubbed to 500.
4. **Payments:** none in this product. Do not add a payment suite.

---

## 7. DevOps / deployment

**Status: FAIL** (0 blockers, 1 high, 1 medium)

### Checklist

| Check | Result |
|---|---|
| Production client build | Pass — this review, `client` `vite build`, exit 0, no warnings |
| Env vars documented | Pass — `server/.env.example` and the table in `README.md` lines 126–140 |
| Dev / staging / prod configs | Partial — `NODE_ENV`, `VERCEL`, and `REQUIRE_SECURE_AUTH` switch policy. No staging overlay in the repo |
| CI | Pass with a hole — on push to `main` and on pull requests: server unit tests, client tests, client build, syntax check, API tests, E2E. Server audit is non-blocking (S1). Migrate workflow fails closed if `secrets.DATABASE_URL` is empty (`.github/workflows/migrate.yml` lines 29–33) |
| Docker / health | Partial — Compose healthchecks for Postgres and `GET /api/health` (`docker-compose.yml` lines 15–18 and 47–57). See O1 |
| Zero-downtime and rollback | Not provable — Vercel deploys are atomic at the platform. Compose `restart` replaces the container. Schema rollback is D1 |
| Domain, SSL, CDN, caching | Not in repo — see Questions. API responses are `no-store` (`server/src/app.js` lines 114–115). Analytics GET sets `private, max-age=30` (`server/src/routes/analytics.js` lines 111–116) |

### Findings

#### O1 🟠 Docker’s nginx proxy will reject the uploads the API allows

`client/nginx.conf` has no `client_max_body_size` (default 1 MB) and no `gzip`. The API allows 5 MB spreadsheets (`server/src/routes/marks.js` line 75, `students.js` line 32, `users.js` line 43) and bulk photos of up to 100 × 1 MB (`students.js` lines 30–39). Compose publishes the site on port 8080 through that proxy (`docker-compose.yml` lines 60–69). Those uploads fail at nginx before Express. Vercel’s serverless body limit is also below 5 MB (platform limit, not in this repo); the multer cap should match the real edge.

#### O2 🟡 Client and API images do not use the same Node major

`client/Dockerfile` line 1 is `node:22-alpine`. `server/Dockerfile` line 1 and CI are Node 24. Root and server `engines` are `>=22.18.0`. Both satisfy the engine range; they will not catch a Node 24-only bug in the SPA image.

#### O3 🟢 No staging manifest

There is no `staging` env file or second Compose project. Promoting “the Vercel project” is an operator choice.

---

## 8. Observability and operations

**Status: FAIL** (0 blockers, 1 high, 1 medium)

### Checklist

| Check | Result |
|---|---|
| Structured logs | Pass — JSON lines with level, path, status, duration (`server/src/lib/logger.js` lines 13–69). Query values are not logged (`requestLogFields`, lines 35–50) |
| Sensitive data in logs | Fail — see V2 and B1 |
| Error tracking | Fail — Sentry initializes only when `SENTRY_DSN` is set (`server/src/lib/errorReporting.js` lines 10–21). Default `SENTRY_TRACES_SAMPLE_RATE` is 0. The client has no error reporter |
| Uptime / alerts | Not in repo |
| Product analytics | Pass for privacy — no gtag, PostHog, or Plausible |
| Performance signals | Pass — `performanceMiddleware` and admin `GET /api/monitoring/performance` |

### Findings

#### V1 🟠 Nothing pages anyone unless you add it outside the repo

Health checks exist (`GET /api/health`, deep DB ping, platform deep health). They do not notify. Sentry is optional. There is no uptime monitor, no log drain, and no alert on `RATE_LIMIT_UNAVAILABLE`, migrate-unhealthy, or mail `FAILED`. A failed platform load is visible in the page (F1); nothing pages an operator.

#### V2 🟡 Some logs are unstructured and include SQL or mail text

`ensureSchema.js` warnings include `err.message`. The mailer no longer logs the recipient or subject (B1). `captureException` writes `err.stack` to stdout (`errorReporting.js` lines 36–40), which is appropriate for operators and noisy if a log vendor retains stacks next to pupil ids in the request path. The request middleware itself does not log bodies.

---

## 9. Documentation

**Status: PASS** (0 blockers, 0 high, 2 medium)

### Checklist

| Check | Result |
|---|---|
| README setup, test, deploy | Pass — local, Docker, seed logins, CI test commands, Vercel env table (`README.md`) |
| Operator security notes | Pass — `SECURITY.md`, `docs/ENGINEERING.md`, `docs/PRIVACY.md`, `docs/SCHOOL_PILOT_READINESS.md` |
| API reference | Fail — see C2. Responses send `X-API-Version: 1` (`server/src/app.js` line 118) |
| Incident runbook | Fail — see C2. The restore command is printed by `scripts/pg-dump-backup.sh` (lines 48–49) and the rehearsal is in `docs/ENGINEERING.md` |
| User manuals | Pass — principal, coordinator, teacher under `docs/user-manuals/` and `client/public/help/` |

### Findings

#### C1 🟡 Password policy docs disagree with production code

`docs/ENGINEERING.md` line 20 says “min 10 chars, letter + number”. `SECURITY.md` line 29 says the same. `validatePasswordPolicy` requires 12 characters plus upper and lower case when `NODE_ENV=production`, `VERCEL` is set, or `REQUIRE_SECURE_AUTH=true` (`server/src/lib/password.js` lines 12–40).

#### C2 🟡 No OpenAPI and no incident runbook

`docs/ENGINEERING.md` lines 59–65 list OpenAPI as deferred. Restore rehearsal is documented there; there is still no page that says who to call, how to revoke a portal link, or how to roll back a bad migrate. `CONTRIBUTING.md` covers contribution, not a live incident.

---

## 10. Launch checklist

Do these in order. Items 1–4 are operator blockers even though the code does not fail the build. Items 5, 6, and 10–13 are the high findings still open. Items 7–9 are done.

### Confirm before go-live (operator)

1. 🔴 Choose the edge (Vercel, Docker Compose, or something else) and make the upload limit match it. If the public URL is Compose port 8080, fix O1 first or bulk photos and larger spreadsheets never arrive.
2. 🔴 Set production env and prove a boot: `DATABASE_URL` plus a pooled `POSTGRES_URL` / `POSTGRES_PRISMA_URL` on serverless, `JWT_SECRET` ≥32 random characters, `PLATFORM_ADMIN_PASSWORD` then `PLATFORM_ADMIN_PASSWORD_LOCKED=true`, `CLIENT_ORIGIN` for every real origin, `CRON_SECRET` ≥16, `COOKIE_SECURE` left on. Confirm `GET /api/health?deep=1` is `db.ok: true` and `migrations.ok: true`.
3. 🔴 Set the GitHub Actions secret `DATABASE_URL` so `.github/workflows/migrate.yml` applies `server/migrations/app` and you are not depending on `ensureSchema.js`.
4. 🔴 Counsel sign-off for children’s marks, photos, and guardian contacts: lawful basis, DPA with each school, retention, and who answers a deletion request. The in-app privacy page is not that document (S5).

### High findings to close or accept in writing

5. 🟠 Decide whether shipping Prisma 8 RCs is acceptable for this launch (A1). If yes, freeze the lockfile and do not run a blind `npm update`.
6. 🟠 One migration path only (A2). Do not run legacy `server/prisma/migrations` against production.
7. ✅ Platform home, schools, and the pilot inbox show `LoadError` instead of an infinite spinner when the load fails (F1). Deep health failure is shown in Live ops.
8. ✅ Failed mail is retried up to 6 times with backoff, and flush logs omit the recipient and subject (B1). SMTP still has to be configured or new rows stay `SKIPPED`.
9. ✅ Compose `backup` schedules `scripts/pg-dump-backup.sh` (daily, keep 14) and `backup-rehearse` / CI run `pg_restore` into a scratch database (D1). A managed-Postgres host still needs that provider's PITR.
10. 🟠 Either gate `npm audit --audit-level=high` for `server/` or record an exception for the Prisma CLI transitive highs (S1).
11. 🟠 Fail or flag boot when production has no platform admin (S2). Do not launch on the seed password.
12. 🟠 Turn on `SENTRY_DSN` (or an equivalent) and an uptime check on `/api/health` (V1).
13. 🟠 If Docker is public, put TLS in front of nginx and set HSTS (S4, O1).

### Medium, after the list above

14. 🟡 Align cookie `maxAge` with `JWT_ACCESS_EXPIRES` (B2).
15. 🟡 Associate login/MFA labels, give student photos a name in `alt`, and check contrast (F2, F4).
16. 🟡 `robots.txt`, sitemap, `og:image`, per-route titles (F3).
17. 🟡 Self-service password reset, or a written support path for a locked-out principal (B3).
18. 🟡 Shorten refresh or add an idle timeout for shared staff PCs (B6). Avoid keeping pupil dashboards in `sessionStorage` (S3).
19. 🟡 Cap unpaged student and school lists (D2).
20. 🟡 Fix the seed log that still prints `password123` (D3) and the docs that still say 10-character passwords (C1).
21. 🟡 Add the E2E and API cases in section 6 (T1).
22. 🟡 Use the same Node major in both Dockerfiles (O2).
23. 🟡 Add OpenAPI and a one-page incident runbook (C2).

### Nice-to-have

24. 🟢 Dedicated 500 view wired to error reporting (F5).
25. 🟢 Rate-limit password change (B7).
26. 🟢 Postgres RLS as defense in depth (S6).
27. 🟢 A staging env file (O3).

---

## Questions for me

These are not findings. The repo cannot answer them.

1. Which host is the launch edge: Vercel, the Compose `web` service, or another proxy? O1 and S4 change severity with that answer.
2. Is GitHub secret `DATABASE_URL` set on this repository today, and does it point at production or at a scratch database?
3. Is `PLATFORM_ADMIN_PASSWORD` already set and locked, and has that admin enrolled MFA?
4. Who is the data controller for pupil data, and is a DPA already signed with the first school?
5. Is SMTP actually configured, and who reads `EmailOutbox` when it is not?
6. Where do production logs go, and is `SENTRY_DSN` set?
7. Compose now schedules `pg_dump` for the Docker stack. If the launch database is managed Postgres, is point-in-time recovery already on, and who can restore it?
8. Is there a staging project with a separate database, or will the first deploy be production?
9. Should parent portal links and staff sessions be shorter than 12 hours and 14 days for shared devices?
10. Are you launching the controlled pilot described in `docs/SCHOOL_PILOT_READINESS.md` (public registration off), or an open signup?

---

## Summary

| Section | Status | Blockers | High | Medium |
|---|---|---:|---:|---:|
| 1. Architecture and code quality | FAIL | 0 | 2 | 2 |
| 2. Frontend / design / UX | FAIL | 0 | 0 | 4 |
| 3. Backend / API | FAIL | 0 | 0 | 5 |
| 4. Database | FAIL | 0 | 0 | 2 |
| 5. Security | FAIL | 0 | 2 | 3 |
| 6. Testing | PASS | 0 | 0 | 1 |
| 7. DevOps / deployment | FAIL | 0 | 1 | 1 |
| 8. Observability and operations | FAIL | 0 | 1 | 1 |
| 9. Documentation | PASS | 0 | 0 | 2 |
| **Total** | **FAIL** | **0** | **6** | **21** |

Nice-to-have items (F5, B7, S6, O3) are not in the medium column. Section 10 items 1–4 are operator blockers that sit outside the code counts.

No code will be changed until you approve which findings to fix.
