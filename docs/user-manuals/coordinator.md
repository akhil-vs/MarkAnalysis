# Exam co-ordinator user manual

School Marks Analytics — guide for the **Exam co-ordinator** (co-ordinator) role.

The co-ordinator runs the exam operations desk: school records, teacher chase-ups, mark entry when needed, approvals, consolidated lists, hall tickets, and operational analytics. You work alongside the principal; some school-admin actions (join code rotation, co-ordinator accounts, feature access) stay with the principal.

---

## 1. Sign in and home desk

1. Open the app login page.
2. Enter your **email**, **school ID**, and **password**.
3. If MFA is enabled, enter the 6-digit code (or recovery code).

You land on the **Exam coordination** desk (`/`): teachers still pending upload, papers awaiting approval, hardest subjects, subject correlations, upload queue, and access-request panels.

- Switch the **working exam** with the exam selector.
- Use the **?** hint on each page for short guidance.

If you requested access via `/signup`, wait until the principal activates your account before you can use the desk.

---

## 2. School setup you own day to day

### 2.1 Records (`School setup → Records`)

Keep structure accurate so registers, hall tickets, analytics, and promotion stay correct.

| Tab | What to do |
|---|---|
| **Classes** | Maintain class–section rows and class teachers. |
| **Subjects** | Subjects and **Max marks (mark entry)**; electives and enrolments. |
| **Students** | Roll list; photos for hall tickets. |
| **Exams** | Exam calendar; per-class / per-subject paper dates; **Max marks [consolidation]**; **Lock for consolidation**. |
| **Promote** | Year-end promotion to the next section. |

When scheduling an exam you can set one date for every paper or different dates per class and subject.

### 2.2 Staff (`School setup → Staff`)

1. Activate pending teacher sign-ups, or add / **bulk-import** teachers.
2. Assign **class + subject** papers. Teachers need **ACTIVE** status and assignments before they can enter marks.
3. You can create **teacher** accounts; only the **principal** can create another **exam co-ordinator** or change role feature access.
4. Open a teacher’s timetable from the staff row when needed.
5. **Notify** one teacher or all teachers from Staff when useful.

### 2.3 Timetables (`School setup → Timetables`)

- Teacher cards → Daily / Weekly; add or remove periods.
- **Daily board** — all teachers for one day.
- **Find free** — who is free in a chosen period.
- Working week and bell times are set under **School profile**.

### 2.4 School profile (`School setup → School profile`)

Edit identity, logo, working week, bell schedule, grading bands, pass/distinction, exam weights, and digests.

- You can update most profile fields and the logo.
- The **join code** is shown for sharing; **rotating** it is principal-only.
- Optional modules (Board ops / CPD) are controlled by the principal when saving.

---

## 3. Marks — enter, chase, approve

Unlike the principal, the co-ordinator **can enter and bulk-upload marks** as well as approve them.

### 3.1 Mark register (`Marks → Mark register`)

1. Choose exam, class/section, and subject.
2. Enter marks (or `AB` / `EX` / `WH` for absent / exempt / withheld).
3. **Save draft** — drafts stay out of analytics until submitted and approved.
4. **Submit** for leadership approval (you or the principal can then Approve).

### 3.2 Bulk upload (`Marks → Bulk upload`)

1. Download the spreadsheet template for the class and exam.
2. Fill marks, then upload and **preview** (catches missing students and bad values).
3. Commit when the preview looks correct.

### 3.3 Pending uploads (`Marks → Pending uploads`)

1. Select the exam.
2. Chase teachers with empty registers; open submitted papers to **Approve**.
3. **Notify teachers** about deadlines or incomplete marklists (all pending, or one person).

Approved marks are what school analytics and consolidated lists use.

### 3.4 Access requests (`Marks → Access requests`)

Review late-entry and edit requests across exams. Approve only when a correction is justified — grants appear on the audit log.

### 3.5 Moderate

On an open register, leadership can **Moderate** marks with a recorded reason (grace adjustments that remain approved).

### 3.6 Consolidated lists (`Marks → Consolidated lists`)

1. Confirm entry max marks (Subjects) and consolidation max (Exams); lock consolidation when ready. Totals **scale** onto the consolidation ceiling.
2. Exam → class → division. **Ready** means every subject register is approved.
3. Download Excel/PDF. Preview downloads for incomplete divisions are watermarked; **official** requires full approval.
4. Notify teachers for incomplete classes from this screen.

### 3.7 Hall tickets (`Marks → Hall tickets`)

Create and edit batches (title, venue, instructions), preview, and download PDF (five per A4). Ensure paper schedule dates **and start times** exist under Records → Exams for every class that needs tickets (or fill one class and use **Copy class timetable to all classes**).

### 3.8 Audit log (`Marks → Audit log`)

Co-ordinators see the trail of teacher mark changes, approvals, and access grants. The principal’s wider “all users” view (including co-ordinator actions) is principal-only.

---

## 4. Insights

Same leadership analysis suite as the principal:

- **School overview**, **Classes**, **Subjects**, **Teachers**, **Students**
- **Compare** (year-on-year and same-subject teachers)
- **Deep insights** (readiness heatmap, division gaps, improvement cohorts, teacher load, weighted annuals, and more)

Start from the co-ordinator desk metrics (pending upload, awaiting approval, hardest subject) then drill into Deep insights → **Exam readiness** before results lock.

---

## 5. Board ops and CPD

When enabled on the school:

- **Board ops** — paper calendar, report-card publish/sign-off flow, parent notify, revaluation, board packs.
- **CPD** — plans, observations, appraisals, certificates for any teacher.

---

## 6. Parent portal links

Issue portal links for a student and exam so parents can view **approved** marks at `/portal`.

---

## 7. Notify teachers

Available from pending uploads, consolidated lists, exam records, staff, and the dashboard upload queue. Teachers receive in-app notices (bell + dashboard) with links into the register.

---

## 8. Your profile

**Account → Profile**: password, MFA, and contact details for your staff account.

---

## 9. Typical co-ordinator checklist (per exam)

1. Confirm classes, subjects (entry max), students, and exam paper dates in **Records**.
2. Set and **lock** consolidation max marks.
3. Verify teacher assignments and timetables.
4. Send deadline notices; watch **Pending uploads**.
5. Enter/upload marks yourself only for papers you cover or when covering gaps.
6. **Approve** submitted registers; handle access requests carefully.
7. Check Deep insights → **Exam readiness** and subject difficulty.
8. Produce hall tickets and **official** consolidated lists when every paper is approved.
9. Support Board ops publish/pack steps if your school uses them.

---

## 10. Co-ordinator vs principal

| You can | Principal only |
|---|---|
| Enter & bulk-upload marks | Create co-ordinator accounts |
| Approve / unapprove / moderate | Manage role feature access |
| Manage teachers, records, timetables | Rotate join code |
| Edit school profile & logo | Toggle optional modules on save |
| Leadership analytics & CML | Full audit across all roles |

Work with the principal on staff access and school-wide policy; own the exam operations queue day to day.
