# Principal user manual

School Marks Analytics — guide for the **Principal** role.

The principal owns school setup, staff access, mark approval, leadership analytics, and board-facing outputs. Principals **do not type or bulk-upload marks**; teachers and exam co-ordinators enter registers, and you review and approve them.

---

## 1. Sign in and home desk

1. Open the app login page.
2. Enter your **email**, **school ID**, and **password**.
3. If MFA is enabled, enter the 6-digit authenticator code (or a recovery code).

You land on the **Principal desk** (`/`): school average, pass rate, distinction/fail counts, register readiness, pending uploads, submitted papers waiting for approval, and shortcuts into Deep insights and Consolidated lists.

- Use the **exam selector** at the top to switch the working exam. Teachers and leadership share the same latest exam by default.
- Open the **?** hint on any page for a short “what’s on this page” tip.

---

## 2. First-time school setup

Work through these once per academic year (and whenever structure changes).

### 2.1 School profile (`School setup → School profile`)

1. Set school name, short name, board, affiliation, address, and contact details.
2. Upload a **PNG or JPEG logo** — it prints as letterhead on report cards, class summaries, consolidated lists, and Excel downloads.
3. Share the **staff join code** with teachers and co-ordinators so they can request access at `/signup`. Only the principal can **rotate** the join code.
4. Configure the **working week** (5 or 6 days) and **bell schedule** (period names and times) so timetables match your day.
5. Set **pass percent**, **distinction minimum**, and **grade bands** before publishing results.
6. Set **unit / mid / final weights** for the annual composite used in Deep insights.
7. Optionally enable **email digests** and optional modules (**Board ops**, **CPD**).

### 2.2 Records (`School setup → Records`)

| Tab | What to do |
|---|---|
| **Classes** | Create a class with several divisions at once; assign a **class teacher** per division. |
| **Subjects** | Add subjects; set **Max marks (mark entry)**; mark electives and enrol students as required. |
| **Students** | Add or import the roll; upload photos for hall tickets. |
| **Exams** | Create exams; set paper dates (same date for all, or per class/subject); set **Max marks [consolidation]**; **Lock for consolidation** when ready. |
| **Promote** | After a year, promote a class to the next section without losing prior marks. |

### 2.3 Staff (`School setup → Staff`)

1. Activate pending sign-ups, or **add / bulk-import** staff (Name, Email, School ID, Password, Role).
2. Only the principal can create **exam co-ordinator** accounts and manage **role feature access**.
3. Assign each teacher to **class + subject** papers. Teachers cannot enter marks until they are **ACTIVE** and assigned.
4. Open a teacher’s **timetable** from the staff row when needed.

### 2.4 Timetables (`School setup → Timetables`)

- Browse teachers → open **Daily** or **Weekly** views; add or remove periods.
- Use the **daily board** for every teacher on one day.
- Use **Find free** to see who is free in a given period.

---

## 3. Exam cycle — marks workflow

```
Teachers enter drafts → Submit → Leadership Approve → Analytics & CML include marks
```

### 3.1 Chase and approve (`Marks → Pending uploads`)

1. Select the exam.
2. See teachers with **empty registers** and papers **awaiting approval**.
3. **Notify teachers** (deadline, incomplete marklist, or custom message) for everyone still missing marks, or one teacher.
4. Open a register → **Approve** submitted marks. Only approved marks feed school analytics, ranks, and consolidated lists.
5. Use **Moderate** on the register for grace adjustments with a reason (stays approved and audited).

Principals open registers from Pending uploads (there is no Mark register / Bulk upload item in the principal sidebar).

### 3.2 Access requests (`Marks → Access requests`)

Teachers may ask for **late entry** after a deadline or to **edit** a submitted register. Approve only when a genuine correction is needed — every grant is recorded on the audit log.

### 3.3 Special mark codes

On registers, staff may enter:

| Code | Meaning |
|---|---|
| `AB` | Absent |
| `EX` | Exempt |
| `WH` | Withheld |

### 3.4 Consolidated lists (`Marks → Consolidated lists`)

1. Ensure **Max marks** (Subjects) and **consolidation max** (Exams) are set and locked as needed. Lists **scale** entry marks onto the consolidation ceiling.
2. Choose exam → class → division.
3. Divisions show **Ready** when every subject register is fully approved.
4. Download **Excel** or **PDF**. Incomplete divisions can be downloaded as a **preview** (watermarked). **Official** download requires full approval.
5. From an incomplete class, **notify** the teachers still missing papers.

### 3.5 Hall tickets (`Marks → Hall tickets`)

1. Pick exam, class, and division.
2. Create/edit batch details (title, venue, instructions).
3. Preview on the right; **Download PDF** (five tickets per A4). Ensure paper dates and student photos are in place under Records.

### 3.6 Audit log (`Marks → Audit log`)

Principals can filter by role and actor and see mark changes, approvals, and access grants — including exam-co-ordinator actions.

---

## 4. Insights and analysis

Open **Insights → Marks analysis** (or cards on the hub):

| Report | Use it to… |
|---|---|
| **School overview** | KPIs, grade mix, toppers, year-on-year movement |
| **Classes** | Compare classes/sections; drill into a division |
| **Subjects** | Hard papers, class splits, teacher-to-teacher comparison |
| **Teachers** | Averages, register status, peer comparison |
| **Students** | Search a student; trends, strengths, report card |
| **Compare** | Previous years; same-subject across teachers |
| **Deep insights** | Outcomes/bands, exam readiness, division gaps, improvement cohorts, promotion carry-forward, teacher load, weighted annuals |

Deep insights panels each have their own hint icon explaining the measure and how to act on it.

---

## 5. Board ops and CPD (optional modules)

Enable under School profile if your school uses them.

### Board ops (`School setup → Board ops`)

Per-paper calendar and venues, report-card **publish** and principal **sign-off**, parent notify, revaluation workflow, and downloadable **board packs**.

### CPD (`School setup → CPD`)

Training plans, lesson observations, appraisals, and certificates. Leadership can open any teacher’s CPD file.

---

## 6. Parent / student portal

From **Records** (students / exam context), leadership can **issue a portal link** for a student and exam. Parents open `/portal` with that link to see **approved** marks for that exam only.

---

## 7. Notify teachers

Send in-app notices from:

- Pending uploads / dashboards (pending or one teacher)
- Consolidated lists (incomplete class)
- Records → Exams (deadline reminder)
- Staff (one teacher or all)

Teachers see notices in the bell and on their dashboard, with links into the relevant register.

---

## 8. Your profile

Under **Account → Profile**: update name/email details, change password, and enable **MFA** (TOTP). Keep recovery codes safe.

---

## 9. Typical principal checklist (per exam)

1. Confirm subjects, max marks, roll, and paper dates in **Records**.
2. Lock consolidation max marks when ready.
3. Confirm teacher assignments and deadlines.
4. Clear **Pending uploads** — notify, then **Approve**.
5. Resolve **Access requests** only when needed.
6. Review **Deep insights → Exam readiness**, then school/class/subject reports.
7. Generate **official consolidated lists** and hall tickets.
8. Publish / sign off report cards (Board ops) if used.
9. Spot-check the **Audit log** if any result is questioned.

---

## 10. Principal-only capabilities

Compared with the exam co-ordinator, only the principal can:

- Create and manage **exam co-ordinator** accounts
- Manage **staff role feature access**
- **Rotate** the school join code
- Toggle optional modules (Board ops / CPD) when saving school profile
- View the **full** audit trail (including co-ordinator actions)

Principals do **not** enter or bulk-upload mark registers.
