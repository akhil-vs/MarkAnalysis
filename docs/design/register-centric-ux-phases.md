# Register-centric UX — phased delivery plan

Coordinated frontend + backend work to make exam workflows task-first.
Branch: `cursor/register-centric-ux-a625`.

## Shared principles

1. **Register** = `(exam, classSection, subject, teacher)` projected from Mark rows — one status vocabulary everywhere.
2. **Workspace** = working exam + school section; query override > preference > catalog default.
3. Ship new BFF endpoints alongside old routes; deprecate aliases after cutover.
4. FE renders capabilities/queues; BE owns status rules, eligibility, audit, notifications.

---

## Phase P0 — Workspace + registers + task desks

**Goal:** Stop re-picking exam on every page; teachers open papers in one click.

### Backend

- [x] `User.workspace` JSONB column + `ensureSchema` catch-up
- [x] `GET/PUT /api/me/workspace` — resolve exam via override > preference > latest
- [x] Include `workspace` on login / `/api/auth/me`
- [x] `GET /api/registers?examId=` — `RegisterDto[]` with status + `actions[]`
- [x] Unit tests for preference resolve + register actions

### Frontend

- [x] Workspace context provider (chip in Layout: exam + section)
- [x] Nav regroup: **Today** / **Outputs** / **Setup** / **Insights** / HELP / Account
- [x] Teacher desk: next-actions + My papers as primary; leave/analytics secondary
- [x] Leadership desk: approvals/chase strip first (Submitted marks + Approvals inbox links)
- [x] `/marks` without params → first incomplete paper or papers list

### Done when

- Changing exam in the shell updates desks/pending without per-page reselect
- Teacher with pending papers sees Finish CTA above the fold

---

## Phase P1 — Approvals inbox + setup checklist

**Goal:** One place to clear queues; guided first-year setup.

### Backend

- [x] `GET /api/approvals/inbox?tab=registers|access`
- [x] `POST /api/approvals/registers/approve` (batched register keys, capped)
- [x] `GET /api/school/setup-status` — ordered steps with `href` + `blocking`
- [x] Audit notification `link` builders for exam/class/subject params (`accessRequestsLink` → `/approvals?tab=access`)
- [x] Keep `/api/analytics/awaiting-approvals` + `/api/mark-access` as aliases

### Frontend

- [x] `/approvals` unified page (tabs); desk strip links here
- [x] Redirect `/late-entry` → `/access-requests` (or `/approvals?tab=access`)
- [x] Empty/home checklist from setup-status
- [x] Rename Pending uploads nav label toward “Mark progress”

### Done when

- Leadership can approve submitted registers and access requests from one screen
- Empty school home shows actionable setup steps

---

## Phase P2 — Exam readiness + insights questions + capabilities

**Goal:** Lower setup/analysis cognitive load.

### Backend

- [x] Exam `readiness` fields on exam APIs (papers missing dates, consolidation lock)
- [x] `GET /api/insights/home?examId=` — role-filtered question cards
- [x] `capabilities` (or `navProfile`) on `/me`

### Frontend

- [x] Split **Exams** out of Records → `/exams` under Exam office
- [x] Analysis hub: questions first, catalog secondary
- [x] Nav driven by capabilities; hide empty groups

### Done when

- New co-ordinator can schedule exams without hunting Records tabs
- Insights hub answers “what should I look at?” before listing reports

---

## Phase P3 — Consolidation + mobile + hardening

**Goal:** Single register service, clearer errors, mobile task bar.

### Backend

- [x] Centralize register/approve/submit eligibility in `lib/registers.js` (`registerActions`)
- [x] Structured error codes (`NO_DRAFTS`, `PAST_DEADLINE`, `EDIT_LOCKED`, …)
- [ ] Perf indexes / cache keys if inbox slow (defer until measured)
- [x] Deprecate duplicate aggregation paths where safe (approvals inbox preferred; awaiting-approvals kept)

### Frontend

- [x] Mobile bottom task bar (Home / Papers|Approvals / Profile)
- [x] Toast copy from structured codes
- [ ] Optional mark autosave (only if still needed after P0/P1) — deferred

### Done when

- Status rules exist in one module with tests
- Mobile teachers reach My papers without scrolling the drawer

---

## Testing rubric (each phase)

1. Unit: new lib helpers
2. API: auth + registers/workspace (and later approvals/setup)
3. Manual / e2e smoke: login as teacher + coordinator, switch exam, open paper, approve
4. Walkthrough artifacts under `/opt/cursor/artifacts/`

## Non-goals

- School-wide approve-all without audit
- Parallel Register.status table as source of truth
- Rewriting RBAC / multi-tenant isolation
