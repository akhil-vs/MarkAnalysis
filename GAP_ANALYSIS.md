# Gap analysis — School Marks Analytics

This document inventories what the app already does, then lists **incomplete wiring** (APIs or screens that exist but are not finished), **correctness and security gaps**, and **features worth adding**. It is based on the current `main` tree (Express + Prisma API, React client, Postgres).

## What is already in place

Role-based staff app for a **single school**:

| Area | Present |
|---|---|
| Auth | JWT login (email or school ID), self-signup with principal approval, seed demo accounts |
| Roles | Principal, exam coordinator, teacher |
| Records | Classes/sections, subjects (per class + max marks), students, exams (year / term / type / mark-entry deadline) |
| Mark flow | Grid entry, Excel/CSV upload, draft → approve, audit log, late-entry requests after deadline |
| Analysis | School, class, division, subject, teacher, student, year-on-year, same-subject teacher compare |
| Official lists | Consolidated class mark list (JSON / Excel / PDF) once registers are approved |
| Exports | Student report card PDF, class summary PDF, marks Excel dump |

There are **no automated tests**, **no CI**, and **no app Docker image** — only Postgres in `docker-compose.yml`.

---

## 1. Incomplete wiring (code exists, product does not)

These are the highest-value “missing parts”: the backend or a page is already there, but the user-facing flow is unfinished or unused.

### Coordinator dashboard is unused

`client/src/pages/CoordinatorDashboard.jsx` is a full exam-coordination desk (pending uploads, subject difficulty, teacher-by-subject, correlations). `App.jsx` never routes to it. Coordinators land on `PrincipalDashboard` instead, so `/api/analytics/coordinator` is effectively dead.

### Records UI is create-only

APIs support **PATCH and DELETE** for classes, subjects, students, and exams. The **Records** screen only creates rows (exams can update the deadline). There is no edit, rename, reassign class teacher, change max marks, move a student, or delete anything from the UI.

### Student fields dropped in the form

Schema + bulk template include **date of birth**, **guardian name**, and **guardian phone**. The “Add one student” form only collects name, roll, class, and guardian name. DOB and phone never appear in tables either.

### Staff assignment modal cannot remove rows

The Assign dialog can **add** class/subject rows. There is no remove control. Saving replaces the whole assignment set, so the only way to unassign a paper is an API call. Subjects are also **not filtered by the selected class**, so a teacher can be assigned “Chemistry · Class 9” to 10-A.

### No way to un-approve marks

Leadership can approve a register. Editing an approved cell **silently writes it back to `DRAFT`** with no warning. There is no Unapprove, no lock after approval, and no confirmation before Approve.

### Class teacher is a label only

`ClassSection.classTeacherId` is stored and shown, but class teachers get **no extra access**. A class teacher who is not also a subject assignee cannot open that class’s register or analytics.

### Audit log is truncated and under-filtered

`GET /api/marks/audit` supports `classSectionId` and is hard-capped at **200** rows. The Audit page only filters by exam and never offers class, teacher, or student search. Older edits disappear with no paging.

### Late-entry requests are not tied to the class table

`MarkEntryAccessRequest.classSectionId` is a bare string with **no foreign key** to `ClassSection`. Deleting a class leaves orphaned requests; the route re-hydrates class labels in a second query.

### Report cards and PDFs have no school identity

Exports hard-code the title “School Marks Analytics”. There is no school name, logo, board, affiliation number, or principal signature block — so they are not usable as official documents without a redesign.

### Teachers can open another teacher’s analysis URL

`/analysis/teachers/:id` has no role guard. The API correctly forbids other teachers’ data, but the page itself is reachable and will 403 rather than redirect.

---

## 2. Auth, RBAC, and data-access gaps

| Gap | Detail |
|---|---|
| Anyone can request Principal | Signup lets a visitor pick `PRINCIPAL`. Only the *first* active principal auto-activates; later ones sit in pending, but the option should not be public. |
| Coordinator can promote to Principal | `PATCH /api/users/:id` allows `role: "PRINCIPAL"` for coordinators. Only creating a coordinator is blocked. |
| No password change or reset | Staff cannot change their own password. Forgotten passwords have no recovery path. Temporary passwords stay forever. |
| No user delete / deactivate | Status can be `REJECTED`, but there is no delete, disable-login-without-reject, or last-principal protection. |
| Student GET is unscoped | `GET /api/students/:id` does not check teacher assignments. A teacher who knows an ID can read any student. Analytics for that student *does* check. |
| JWT in `localStorage` | Token lives 7 days in `sma_token`. No refresh rotation, logout-all, or httpOnly cookie option. Default `JWT_SECRET` is `change-me-in-production`. |
| Marks write is not transactional | `PUT /api/marks` upserts row-by-row. A mid-loop failure can leave a partial save. No concurrent-edit detection. |
| Teachers can still hit any class on upload/template | `GET /api/marks` 403s if unassigned; **template and upload** only return empty subject columns instead of 403. |
| Error handler leaks messages | The Express error middleware returns `err.message` to the client. |

---

## 3. Domain model gaps (school marks)

The current model is “one numeric mark per student × subject × exam”. Real school registers usually need more:

| Missing concept | Why it matters |
|---|---|
| **Absent / exempt / withheld** | Empty cell vs 0 vs AB are different. Rank, pass %, and consolidated totals treat missing as blank, 0 as a real score. |
| **Theory + practical / IA + board** | One `maxMarks` per subject. No split papers, internals, or weighted components. |
| **Exam weightage / annual result** | Unit test, mid-term, and final are separate snapshots. There is no combined year result, best-of, or board-style aggregation. |
| **Configurable grade scale** | `GRADE_BANDS` and `PASS_PERCENT = 50` are hardcoded. Boards and schools differ (CGPA, A1–E2, 35% pass, grace marks). |
| **Tied ranks** | Rank is sort order only. Ties get 1, 2, 3 instead of 1, 1, 3. |
| **Student promotion / transfer** | Students belong to one section forever. No academic-year snapshot, promote-to-next-class, TC, or left-the-school flag. Historical analysis will mix cohorts if you reuse the same student row. |
| **Optional / additional subjects** | Every subject for a class name is assumed for every student in that class. No electives, sixth subject, or “not offered in this section”. |
| **Remarks / moderation** | No teacher remark, grace, or moderation log beyond raw mark audits. |
| **Custom exam types** | `ExamType` is a fixed enum (`UNIT_TEST`, `MID_TERM`, `FINAL`). Pre-boards, practicals, and surprise tests need a migration. |
| **Multi-school / campus** | No `School` (or campus) table. One database = one school. |
| **Parent / student portal** | Only staff accounts. Guardians cannot see report cards. |

`Mark` also has no index on `(examId, status)` or `studentId`. Analytics loads **all approved marks** for year-on-year views — fine for the seed, not for a full school over several years.

---

## 4. Product and UX gaps

- **Sidebar is desktop-only.** `Layout` is a fixed `w-64` column with no collapse, overlay, or mobile nav. Mark grids overflow on small screens.
- **No profile page.** Name, email, school ID, and password cannot be edited by the signed-in user.
- **No in-app notifications.** Pending staff, late-entry requests, and “your register was approved / rejected” only show as sidebar badges if leadership happens to have the app open. No email.
- **Approve has no preview.** Leadership can approve an incomplete register (missing students still allowed). Pending-uploads tracks *empty* cells, not drafts awaiting approval, as two different queues.
- **Consolidated PDF can look official while incomplete.** Preview downloads are allowed; the incomplete banner is easy to miss in a printed file.
- **Search is local only.** Student analysis loads every visible student then filters in the browser. Same for staff and records tables (`PaginatedTable` is client-side).
- **Login still advertises seed passwords** (`password123` + one-click accounts). Fine for demo; must be gated or removed before any real deployment.
- **No print CSS** for analysis screens (only dedicated PDF endpoints).
- **No empty-state onboarding** beyond copy on a few pages (e.g. “add a class first”).

---

## 5. Engineering / production gaps

- No test suite (API, domain math, or UI). Grade %, rank, year-series, and consolidated totals are easy to regress.
- No GitHub Actions / lint / typecheck. Client and server are untyped JavaScript.
- No Dockerfile or compose service for the API and Vite/static client. README is local-dev only.
- `xlsx` is used to parse uploads (known supply-chain/CVE history). ExcelJS already handles generation; parsing could consolidate.
- No rate limiting, Helmet, request-size policy beyond `2mb` JSON, or structured logging.
- Seed script **wipes every table** (`deleteMany` on users, marks, classes, …). Running `npm run seed` on a live database destroys data.
- No backup / restore docs, no migration runbook beyond `prisma migrate dev`.
- Duplicate exam loaders (`loadExams` in both `analytics.js` and `analyticsReports.js`).
- Analytics endpoints refetch large mark sets per request with no caching.

---

## 6. Features worth adding (priority-shaped)

### Finish the current product (do first)

1. Wire **Coordinator dashboard** as the coordinator home (keep Principal dashboard for principals).
2. **Edit / delete** on Records (classes, subjects, students, exams) with cascade warnings.
3. Assignment modal: **remove row**, filter subjects by class, prevent duplicate papers.
4. **Unapprove** + confirm Approve; warn when editing an approved cell.
5. Scope `GET /api/students/:id`; stop coordinators from setting `role: PRINCIPAL`; hide Principal from public signup.
6. Password change for self; principal-initiated reset.
7. School profile (name, board, logo) used on report cards and consolidated lists.
8. Absent / exempt mark states so zeros and blanks are not confused.
9. Indexes on `Mark(examId, status)` and a FK from late-entry requests to `ClassSection`.
10. Tests around grades, ranks, consolidated ready/not-ready, and mark-entry deadlines.

### School operations (next)

- Academic-year **promotion** and section transfer, keeping past exam rows attached to the year they were sat.
- Electives / additional subjects per student.
- Weighted **annual result** (e.g. 20% unit + 30% mid + 50% final) and a true rank list for that composite.
- Configurable grade bands and pass percent per school or per class (CBSE vs state board).
- Class-teacher inbox: “my section’s pending papers” without full leadership rights.
- Email or digest: pending sign-ups, late-entry queue, “deadline tomorrow”, “register approved”.
- Moderation / grace marks with a reason, shown on the audit log.
- Bulk **re-open** a subject after a paper is found to be mis-keyed, with a required comment.

### Analysis (once data quality is solid)

- Intervention lists: students failing 3+ subjects, declining across two exams, subject-wise at-risk.
- Question-paper / difficulty over time (already have subject averages; add item analysis if marks ever go sub-question).
- Gender / category / language-medium splits **only if** those fields are collected (they are not today).
- Cohort tracking: same students from Class 9 → 10 across years.
- Exportable analysis packs (principal board-meeting PDF: KPIs + toppers + at-risk + pending teachers).
- Teacher self-serve: “how my sections compare to school average in *my* subject” without opening leadership pages.

### Access and delivery

- Parent / student login (read-only report card + exam history).
- SMS / WhatsApp / email report-card links (common in Indian school ops).
- Mobile-usable register (card-per-student entry, not a wide HTML table).
- Offline-tolerant mark entry (save locally, sync when back on campus network).
- Multi-campus or multi-school tenancy if this is meant to be a product, not one school’s tool.

### Hardening for a real school

- Replace demo one-click logins; force password change on first login.
- HttpOnly cookies or short-lived access + refresh tokens.
- Rate-limit login and signup.
- CI + a non-destructive seed (`upsert` demo school instead of `deleteMany`).
- Production compose: `db` + `api` + `web`, with `JWT_SECRET` required at boot.
- Server-side pagination and search for students, audit, and marks.

---

## 7. Suggested implementation order

If work continues on this repo, a practical sequence is:

1. **Safety:** RBAC fixes, student GET scoping, stop seed-wipe in production, required `JWT_SECRET`.
2. **Finish Records + assignments** so the school can actually maintain data after first setup.
3. **Mark-register completeness:** absent codes, unapprove, approve confirmation, class-teacher access policy.
4. **Coordinator home** + school branding on PDFs.
5. **Promotion / academic year** on students so year-on-year analysis stays honest.
6. **Tests + CI**, then parent portal / notifications.

Nothing in sections 6–7 is required for the current demo seed to run; they are the gap between “works in Docker for a walkthrough” and “a school could run exams on it”.
