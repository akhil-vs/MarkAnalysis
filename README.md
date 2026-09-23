# School Marks Analytics Platform

Role-based marks upload and analytics for principals, exam coordinators, and teachers.

## User manuals

Step-by-step guides for each school role (also under **HELP → User manuals** in the app — each user only sees their own role’s PDF):

- [Principal](docs/user-manuals/principal.md) · [PDF](client/public/help/principal-user-manual.pdf)
- [Exam co-ordinator](docs/user-manuals/coordinator.md) · [PDF](client/public/help/coordinator-user-manual.pdf)
- [Teacher](docs/user-manuals/teacher.md) · [PDF](client/public/help/teacher-user-manual.pdf)
- [Index](docs/user-manuals/README.md)

Regenerate PDFs with `npm run docs:pdf`.

## Stack

- React + Vite + Tailwind CSS + Recharts
- Express REST API + Prisma ORM 8
- PostgreSQL (Docker)
- JWT auth with RBAC

## Local setup

Requires **Node.js 22.18+** (Node 24 recommended).

```bash
docker compose up -d
cd server
cp .env.example .env
npm install
npx prisma contract emit
# Apply schema to an empty database the first time, or use ensureSchema on boot:
# npx prisma db init
# For existing databases already matching the contract:
# npx prisma db sign && npx prisma migration ref set db <baseline>
npm run seed
npm test
npm run dev
```

In another terminal:

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Full stack in Docker

```bash
export JWT_SECRET=a-long-random-string
docker compose up --build
```

`JWT_SECRET` is required (Compose refuses to start the API with the placeholder). API on [http://localhost:4000](http://localhost:4000), web on [http://localhost:8080](http://localhost:8080). The API container runs `prisma db migrate` before listening.

### API integration tests

Unit tests stay DB-free (`npm test`). Real HTTP + Postgres coverage lives in `server/src/test/`:

```bash
cd server
# with Docker Postgres (or any DATABASE_URL):
SEED=1 npm run db:prepare
npm run test:api
```

CI runs the same flow in the `api-integration` job (Postgres 16 service).

### Full-application E2E (Playwright)

Browser workflows for every role manual (principal, co-ordinator, teacher) plus the cross-role marks cycle:

```bash
# API + Vite are started automatically if not already running
npm run test:e2e

# API automation + E2E together
npm run test:app
```

HTML report: `reports/playwright-html/index.html` (also `reports/playwright-report.json`).

### Deploy auth config (Vercel / production)

Set these on the Vercel project (or host env) before going live:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres URL used at runtime for migrate/ensure + queries |
| `JWT_SECRET` | yes | ≥16 random chars; boot fails on Vercel/production if weak |
| `JWT_ACCESS_EXPIRES` | no | Access cookie TTL (default `15m`) |
| `CLIENT_ORIGIN` | no* | Comma-separated SPA origins. \*Not needed when the SPA and `/api` share one Vercel deployment |
| `COOKIE_SECURE` | no | Force `Secure` cookies; auto-on when `VERCEL` or `NODE_ENV=production` |
| `VITE_ENABLE_DEMO_LOGIN` | no | Build-time; leave unset/`false` so demo one-click logins stay hidden |
| `PLATFORM_ADMIN_PASSWORD` | prod | Required to create the platform admin on first boot. Never use the documented seed password (`password123`) in production |
| `PLATFORM_ADMIN_PASSWORD_LOCKED` | prod | Set `true` after the admin password is set so boot cannot rotate it |
| `ENSURE_PLATFORM_ADMIN` | no | Set `false` to skip boot-time admin ensure entirely |

Sessions use httpOnly cookies `sma_access` + `sma_refresh` (rotated on `POST /api/auth/refresh`). The SPA calls APIs with `credentials: "include"`.

Seed is **non-destructive** when users already exist. To wipe and reseed locally: `SEED_MODE=wipe npm run seed`. In production also set `ALLOW_DESTRUCTIVE_SEED=true`.

Leadership can set the **school name, address, affiliation, and logo** under **School profile**. The crest, name, and address print as a letterhead on report cards, class summaries, consolidated lists, and Excel downloads. Share the **staff join code** from that page so teachers can request access. After a year, use **Records → Promote** to move a class to the next section without losing last year’s marks. On the mark register, type `AB`, `EX`, or `WH` for absent, exempt, or withheld. Class teachers can open their section’s full register (read-only for papers they do not teach).

## Seed logins

All seed passwords are `password123`. The login page also has one-click sign-in for every account.

| Role | Email | School ID |
|---|---|---|
| Platform admin | `admin@platform.edu` | `PLT-A01` |
| Principal · Greenfield | `principal@school.edu` | `SCH-P01` |
| Exam Coordinator | `coordinator@school.edu` | `SCH-C01` |
| Teacher · Mathematics | `anita.sharma@school.edu` | `SCH-T01` |
| Teacher · Physics | `rahul.mehta@school.edu` | `SCH-T02` |
| Teacher · Chemistry | `priya.nair@school.edu` | `SCH-T03` |
| Teacher · English | `david.thomas@school.edu` | `SCH-T04` |
| Teacher · Biology | `meera.iyer@school.edu` | `SCH-T05` |
| Teacher · Mathematics | `kiran.bose@school.edu` | `SCH-T06` |
| Teachers · T07–T100 | `teacher007@school.edu` … `teacher100@school.edu` | `SCH-T07` … `SCH-T100` |
| Principal · Riverside | `principal@riverside.school` | `RIV-P01` |

**Platform console** (`/platform`): sign in as the platform admin to list every school, add a campus, suspend or reactivate it, and create or reset principal accounts. Staff request access with the school’s **join code** (Greenfield: `DEMO-JOIN`, Riverside: `RIVE-SIDE`). Marks, staff, and exams stay isolated per campus.

Greenfield seed models a mid-size **CBSE** campus: classes **5–8** with four divisions (A–D), classes **9–12** with two divisions (A–B), **40 students** per division, **100 teachers**, CBSE-aligned subjects (middle school core, secondary with Physics/Chemistry/Biology registers, and 11–12 Science PCM vs Commerce streams), weekly teacher timetables, and elective enrollments (AI in 9–10, PE in 11–12).

The current Final Exam seed leaves Biology (all sections) and English 10-B empty so principals and coordinators can see pending teacher uploads. Teachers and leadership now default to the **same latest exam**. After a teacher saves marks they stay **draft** until a principal or coordinator clicks **Approve** on the mark register — only then do school analytics and consolidated lists include them.

Mathematics for classes 9–10 is split across two teachers (Anita Sharma: 9-A, 10-A; Kiran Bose: 9-B, 10-B) so same-subject teacher comparison has data. Seed exams cover academic years 2024-25 and 2025-26. The demo school join code is `DEMO-JOIN`.

## Multiple schools

Each school is a tenant: staff, classes, exams, marks, timetables, and analytics stay isolated.

- **Register your school** at `/register-school` — creates the school and an active principal
- **Staff request access** at `/signup` with the school’s **join code** (shown on School profile). The principal still approves teachers and coordinators
- Staff IDs such as `SCH-T01` are unique **inside a school**, not globally. Email stays unique across the platform

Existing single-school databases migrate into one tenant and keep working.

## Analysis

Leadership can review:

- **Class-wise** and **division-wise** results
- **Subject-wise** and whole-school analysis per subject
- **Teacher** registers and peer comparison
- **Previous-year** comparison for the same exam type
- **Same-subject** comparison when two or more teachers mark that paper

## Teacher timetables

Principals and exam coordinators can open **Timetables** in the sidebar (or **Timetable** from a staff row) to browse each teacher’s schedule. Teachers see the page when Role access grants **Timetables**, **Leave approval**, or **Assign substitutes**.

- **Teachers** — accordion of every active teacher. Expand a row to **Open timetable**, **Put on leave**, or **Hrs history** (own teaching hours plus extra cover hours). The week follows School profile working days; use Previous week / Next week or a From / To range.
- **Daily board** — one page with every teacher’s timetable for a chosen day (subject, class, free slots, leave, and cover). Click and drag to scroll periods. Rows show period count, teaching hours, and **+extra** cover hours.
- **Find free** — pick a date and period to see who is free, on leave, or already teaching.
- **Leave & cover** — approve teacher **My leave** requests, put a teacher on leave, and accept ranked substitute suggestions. Vacated cells show **Needs cover** until cover is assigned.

The **working week** (5 or 6 school days) and **bell schedule** (period names, start/end times, and breaks) live under **School profile → Bell Schedule & Timings**. Defaults are seeded only when the schedule is empty.

Leadership can also add or remove teaching periods on a teacher’s full timetable page. Grant **Leave approval** and **Assign substitutes** under **Staff → Role access** for vice principals, supervisors, and coordinators.

Deployments generate the Prisma client on Vercel build. On cold start the API runs `prisma migrate deploy` when `DATABASE_URL` is available, then `ensurePendingSchema` as a catch-up for environments that cannot migrate at build time. You can also run migrations from GitHub Actions (workflow **Migrate database**) when `secrets.DATABASE_URL` is set. Set `SKIP_MIGRATE_DEPLOY=true` to rely only on the catch-up path.

## Consolidated mark lists

Principal and exam coordinator set **Max marks** (mark entry) under **Records → Subjects**, and **Max marks [consolidation]** when they schedule an exam under **Records → Exams**, then **Lock for consolidation**. Consolidated lists **scale** each paper from Max marks onto that exam’s consolidation ceiling, so subject marks and overall percentages stay within 100%. Mark entry still validates against Max marks. Unlock an exam’s consolidation ceiling only if a correction is needed.

Once teachers have entered marks for an exam and leadership has **approved** them, the exam coordinator or principal can generate the official **consolidated mark list** for a class. **Class teachers** can open and download the list for their own section only when every subject register for that class is fully approved.

Open **Consolidated lists** in the sidebar (or from the school desk / teacher desk). Choose an exam, then a class, then a division. The screen shows every student against every subject, with total, percent, grade, and rank. Divisions are marked **Ready** when every subject register is fully approved.

Download **Excel** or **PDF**. Leadership can download a **preview** of incomplete divisions (watermarked / labelled preview-only). **Official** downloads require every subject register to be approved (`official=1`); incomplete official requests return HTTP 409. Class teachers do not see incomplete lists. Approve remaining registers on the mark register before treating the file as official.

## Notify teachers

Principals and exam coordinators can send in-app notices to teachers about **deadlines**, **incomplete marklists**, or a **custom message**. Teachers see them in the bell and on their dashboard, with a link into the relevant register.

- **Pending uploads** and the leadership dashboards: notify everyone still missing marks, or one teacher
- **Consolidated lists**: notify the teachers for an incomplete class
- **Records → Exams**: send a deadline reminder
- **Staff**: notify one teacher or all teachers

## Live ops, board product, and CPD

- **Health**: `GET /api/health` (liveness) and `GET /api/health?deep=1` (DB ping). Helmet sets CSP (report-only unless `CSP_ENFORCE=true`).
- **MFA**: Profile → enable TOTP; login then asks for a 6-digit code (or recovery code).
- **Email digests**: enable on School profile; platform admin can **Run email digests** / **Flush mail queue**. Configure `SMTP_URL` or `SMTP_HOST` (without SMTP, messages stay in `EmailOutbox` as skipped).
- **Backup**: platform overview → **Download backup** (JSON) via `POST /api/platform/backup`. Merge restore via `POST /api/platform/backup/restore`.
- **Board ops** (leadership): per-paper exam calendar, report-card publish/sign-off, parent notify, revaluation, board packs.
- **CPD**: training plans, observations, appraisals, and certificates under **CPD** in the sidebar.

# MarkAnalysis
