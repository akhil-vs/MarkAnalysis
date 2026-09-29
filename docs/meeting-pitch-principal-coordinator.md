# Meeting pitch — School Marks Analytics

**Audience:** School Principal and Exam Co-ordinator  
**Purpose:** A complete, meeting-ready explanation of the application — what it is, who uses it, how an exam cycle runs, and what leadership gains.

---

## Opening (2 minutes)

Good morning. We are proposing **School Marks Analytics** — a role-based platform that replaces scattered spreadsheets and last-minute consolidation with one controlled workflow: teachers enter marks, leadership approves them, and the school gets official consolidated lists, hall tickets, and actionable analysis from the same data.

It is built for three roles that already exist in every school:

| Role | Primary job in the system |
|---|---|
| **Principal** | School setup, staff access, approve results, leadership insights, board-facing outputs |
| **Exam co-ordinator** | Day-to-day exam operations: records, chase-ups, mark entry when needed, approvals, CML, hall tickets |
| **Teachers** | Enter and submit their subject registers; class teachers can see their section when complete |

Your data stays isolated to your school. Staff join with a school join code; the principal activates accounts. Nothing from another campus can mix with yours.

---

## The problem we solve

Today, most schools still assemble results like this:

1. Teachers type marks in personal sheets or notebooks.
2. Someone copies them into a master file — often under deadline pressure.
3. Totals, percentages, ranks, and grades are recalculated by hand or fragile formulas.
4. Incomplete papers still get printed as “final.”
5. When a parent questions a mark, there is little audit trail of who changed what and when.
6. Year-on-year or teacher-to-teacher comparison means another weekend of Excel.

**School Marks Analytics** keeps one source of truth: a mark is a **draft** until it is **submitted** and **approved**. Only approved marks feed school analytics, ranks, and official consolidated lists.

```
Teachers enter drafts → Submit → Principal / Co-ordinator Approve
        → Analytics, ranks, CML, report cards, parent portal
```

---

## What each of you will use

### Principal — leadership and control

You own school identity and access, not day-to-day typing of marks.

- **School profile** — name, address, affiliation, logo (prints as letterhead on PDFs and Excel), pass/distinction rules, grade bands, working week and bell schedule.
- **Staff** — activate teachers and co-ordinators; assign class + subject papers; manage who can use which features. Only you create co-ordinator accounts and rotate the staff join code.
- **Pending uploads** — see empty registers and papers waiting for approval; notify teachers; **Approve** (or moderate with a recorded reason).
- **Access requests** — grant late entry or edits only when justified; every grant is audited.
- **Consolidated lists & hall tickets** — official downloads when every paper is approved; preview (watermarked) if incomplete.
- **Insights** — school, class, subject, teacher, and student views; year-on-year and same-subject teacher comparison; Deep insights (exam readiness, division gaps, improvement cohorts, teacher load, weighted annuals).
- **Audit log** — full trail across teachers and co-ordinators.
- **Optional modules** — Board ops (calendar, report-card publish/sign-off, parent notify, revaluation, board packs) and CPD (plans, observations, appraisals, certificates).

You do **not** enter or bulk-upload mark registers. That separation keeps the principal as the approver and accountability layer.

### Exam co-ordinator — operations desk

You run the exam cycle day to day, alongside the principal.

- **Records** — classes/sections, subjects and max marks, student roll and photos, exam calendar and paper dates, consolidation max marks (lock when ready), year-end promote.
- **Staff & timetables** — activate teachers, assign papers, daily/weekly boards, find who is free in a period.
- **Mark register & bulk upload** — enter marks yourself when covering a paper or closing a gap; spreadsheet template with preview before commit.
- **Pending uploads & approvals** — chase incomplete registers; approve submitted papers; notify by deadline or incomplete marklist.
- **Consolidated lists & hall tickets** — same official/preview rules as the principal.
- **Insights** — same leadership analysis suite, starting from your desk metrics (pending upload, awaiting approval, hardest subjects).
- **Audit log** — teacher mark changes, approvals, and access grants (the principal sees the wider “all roles” view).

| You can | Principal only |
|---|---|
| Enter & bulk-upload marks | Create co-ordinator accounts |
| Approve / moderate registers | Manage role feature access |
| Manage teachers, records, timetables | Rotate join code |
| Edit school profile & logo | Toggle Board ops / CPD on save |
| Leadership analytics & CML | Full audit across all roles |

---

## Complete walkthrough of the application

### 1. Getting the school onto the platform

1. Register the school (creates the campus and an active principal).
2. Set **School profile** — identity, logo, grading bands, pass/distinction, exam weights (unit / mid / final), week length, bell times.
3. Share the **join code** so teachers (and co-ordinators) request access at signup.
4. Principal activates accounts and assigns each teacher to the **class + subject** papers they mark.
5. Build **Records**: classes, subjects (max marks for entry), students (and photos for hall tickets), exams (dates and consolidation max marks).

Until a teacher is **ACTIVE** and assigned, they cannot enter marks. That prevents orphan registers and wrong papers.

### 2. Setting up an exam

Under **Records → Exams**:

- Create the exam (unit / mid / final or your naming).
- Set paper dates — one date for all papers, or per class and subject.
- Set **Max marks [consolidation]** and **Lock for consolidation** when ready.
- Subject **Max marks (mark entry)** stay on Subjects; consolidated lists **scale** entry marks onto the consolidation ceiling so totals and percentages stay consistent.

Special codes on registers: `AB` (absent), `EX` (exempt), `WH` (withheld).

### 3. Marks workflow (core of the product)

**Teachers**

- Open their assigned register, enter marks (or bulk-upload), **Save draft**, then **Submit**.
- Drafts do not appear in school analytics or official CML.
- After submit, they need leadership approval (or a granted access request) to change further.

**Co-ordinator / Principal**

- **Pending uploads** shows who has not uploaded and what is awaiting approval.
- Open a register → **Approve**. Optionally **Moderate** with a reason (grace adjustments stay approved and audited).
- Send **in-app notices** (deadline, incomplete marklist, or custom) from pending uploads, consolidated lists, exam records, or staff — teachers see them in the bell and on their dashboard with a link into the register.

**Class teachers** can open their section’s full register (read-only for papers they do not teach) and, when every subject is approved, download that section’s consolidated list.

### 4. Official outputs

**Consolidated mark lists**

- Choose exam → class → division.
- Division is **Ready** only when every subject register is fully approved.
- Download **Excel** or **PDF** with school letterhead.
- Incomplete divisions: leadership may download a **preview** (watermarked / labelled preview-only). **Official** download is blocked until all papers are approved.
- Marks are scaled from entry max onto the exam’s consolidation max so overall percentages stay within a fair ceiling.

**Hall tickets**

- Batch by exam, class, and division; set title, venue, instructions.
- Preview and **Download PDF** (five tickets per A4), using student photos and paper dates from Records.

**Parent / student portal**

- Leadership issues a portal link for a student and exam.
- Parents open `/portal` and see **approved** marks for that exam only — not drafts.

**Board ops** (if enabled)

- Per-paper calendar and venues, report-card publish and principal sign-off, parent notify, revaluation workflow, downloadable board packs.

### 5. Analysis leadership can act on

From **Insights** (and cards on each desk):

| Report | Decision it supports |
|---|---|
| **School overview** | KPIs, grade mix, toppers, year-on-year movement |
| **Classes** | Which sections need intervention |
| **Subjects** | Hard papers; splits by class; teacher-to-teacher comparison |
| **Teachers** | Averages, register status, peer comparison |
| **Students** | Individual trends, strengths, report card |
| **Compare** | Previous years; same subject across teachers |
| **Deep insights** | Exam readiness heatmap, division gaps, improvement cohorts, promotion carry-forward, teacher load, weighted annual composite |

Teachers see limited analysis for their own classes and students — not the full school desk.

### 6. Timetables and staffing (operations support)

- Daily and weekly views per teacher; add/remove periods.
- **Daily board** — every teacher’s day on one page.
- **Find free** — who is free in a chosen period (useful for substitutions and viva slots).
- Working week (5 or 6 days) and bell schedule live on School profile.

### 7. Year end and continuity

- **Promote** moves a class to the next section without losing prior marks.
- Historical exams remain available for year-on-year comparison.
- School identity on letterheads stays consistent across report cards, class summaries, CML, and Excel.

### 8. Security and accountability

- Sign-in with email, school ID, and password; optional **MFA** (authenticator app).
- Role-based access — principals, co-ordinators, and teachers only see what their role allows.
- Multi-tenant isolation — each school’s staff, marks, and exams stay separate.
- **Audit log** for mark changes, approvals, moderation, and access grants.
- Passwords reset by leadership can force a change on next login.

---

## How a typical exam cycle looks with both of you

| Step | Principal | Exam co-ordinator |
|---|---|---|
| 1. Confirm structure | Spot-check profile, grading, staff access | Own Records: classes, subjects, roll, dates, consolidation lock |
| 2. Assign papers | Approve co-ordinator / feature access if needed | Assign teachers; verify timetables |
| 3. Chase marks | Notify from leadership desk if needed | Pending uploads + notifications as primary queue |
| 4. Close gaps | — | Enter/bulk-upload where covering |
| 5. Approve | Approve / moderate; handle sensitive access requests | Approve routine registers; escalate policy calls |
| 6. Readiness | Review Deep insights → Exam readiness | Same; flag hardest subjects and incomplete divisions |
| 7. Publish | Official CML, hall tickets, Board ops sign-off | Produce CML / hall tickets; support packs |
| 8. Query | Full audit if a result is challenged | Teacher-level audit trail |

---

## Benefits in one page

1. **One workflow** — draft → submit → approve → publish; no parallel “final” spreadsheets.
2. **Clear roles** — principal governs access and final accountability; co-ordinator runs operations; teachers own their papers.
3. **Official vs preview** — incomplete results cannot masquerade as final.
4. **Letterheaded outputs** — CML, hall tickets, and exports carry the school crest and address.
5. **Live chase-ups** — in-app notices instead of scattered WhatsApp follow-ups.
6. **Analysis that answers real questions** — which class, which paper, which teacher, which cohort, which year.
7. **Auditability** — every meaningful change can be explained to a parent or board.
8. **Optional growth path** — Board ops and CPD when the school is ready; core marks workflow works without them.

---

## Suggested demo agenda for this meeting (20–25 minutes)

1. **Principal desk** — KPIs, pending approvals, exam selector (3 min).
2. **Co-ordinator desk** — pending uploads, hardest subject, notify teacher (3 min).
3. **Records** — subject max marks, exam consolidation lock, student photo (3 min).
4. **Mark register** — draft → submit → approve; show `AB` / moderation (4 min).
5. **Consolidated list** — Ready vs incomplete; preview watermark vs official (4 min).
6. **Hall ticket PDF** — batch preview (2 min).
7. **Deep insights** — exam readiness + one subject comparison (3 min).
8. **Q&A** — join code, MFA, parent portal, year promote (remainder).

Role manuals for after the meeting:

- Principal: `docs/user-manuals/principal.md`
- Exam co-ordinator: `docs/user-manuals/coordinator.md`
- Teacher: `docs/user-manuals/teacher.md`

---

## Closing ask

We are asking for agreement to:

1. Nominate the **principal** and **exam co-ordinator** as the school’s leadership accounts.
2. Confirm **board / grading rules** (pass percent, distinction, grade bands) and exam naming for the current year.
3. Schedule a **setup window** to load classes, subjects, roll, and teacher assignments.
4. Run the **next unit / mid / final** fully on the platform — with official CML and hall tickets produced only from approved registers.

If that works for you, we can start with School profile and Records this week, and treat the next scheduled exam as the first live cycle.
