# Exam co-ordinator user manual

School Marks Analytics — guide for the **Exam co-ordinator** (co-ordinator) role.

The co-ordinator runs the exam operations desk: school records, teacher chase-ups, mark entry when needed, approvals, leave cover, consolidated lists, hall tickets, and operational analytics. You work alongside the principal; some school-admin actions (join code rotation, co-ordinator accounts, Role access) stay with the principal.

---

## 1. Sign in and home desk

1. Open the app login page.
2. Enter your **email**, **school ID**, and **password**.
3. If MFA is enabled, enter the 6-digit code (or recovery code).

You land on the **Exam coordination** desk (`/`): teachers still pending upload, papers awaiting approval, hardest subjects, subject correlations, upload queue, and access-request panels.

- Switch the **working exam** with the exam selector.
- Use the **?** hint on each page for short guidance (**How it is useful**).
- Download this guide from **HELP → User manuals**.

If you requested access via `/signup`, wait until the principal activates your account before you can use the desk.

---

## 2. School setup you own day to day

### 2.1 Records (`School setup → Records`)

Keep structure accurate so registers, hall tickets, analytics, and promotion stay correct.

| Tab | What to do |
|---|---|
| **Classes** | Add a class with several divisions at once (**Fill A–D** for a quick start); assign class teachers per division. Use **Registered class sections** to expand a grade, search, and filter. |
| **Subjects** | Pool subjects with **Max marks (mark entry)**; optional **Practical max**; **Elective (enroll selected students only)** plus **Enrollments**. Then pick which papers each class uses. |
| **Students** | Roll list; photos for hall tickets (or **Marks → Student photos**). |
| **Exams** | Exam calendar; **Classes in this exam** (choose which classes sit under the exam — editable later); per-class / per-subject paper dates and start times; **Max marks [consolidation]**; **Lock for consolidation**. Copy one class timetable to the others when useful. |
| **Promote** | Year-end promotion to the next section. |

When scheduling an exam, choose which **classes** are included, then set one date for every paper or different dates per class and subject. Paper dates only appear for the classes you select.

### 2.2 Staff (`School setup → Staff`)

1. Activate pending teacher sign-ups, or add / **bulk-import** teachers.
2. The staff list is an **accordion** — expand a row for assignments, **Transfer classes**, and timetable.
3. Assign **class + subject** papers to teachers. The principal can also assign papers to the principal, vice principal, and co-ordinators. Teachers need **ACTIVE** status and assignments before they can enter marks.
4. You can create **teacher** accounts; only the **principal** can create another **exam co-ordinator** or change **Role access**.
5. Open a teacher’s timetable from the staff row when needed.
6. **Notify** one teacher or all teachers from Staff when useful.

Co-ordinators typically already have **Timetables**, **Leave approval**, and **Assign substitutes**. Ask the principal if a tab is missing.

### 2.3 Timetables (`School setup → Timetables`)

Same four tabs as the principal:

- **Teachers** — accordion. Search or filter by **class** and **subject**. Expand a row to **Open timetable**, **Put on leave**, or **Hrs history** (own teaching plus extra cover hours). Use **Previous week** / **Next week**, or **From** / **To** and **Show range**.
- **Daily board** — all teachers for one day. **Click and drag to scroll periods**. Rows show period count, teaching hours, and **+extra** cover hours. Vacated cells: **Needs cover** / **Cover**. **Assign cover** opens ranked substitutes.
- **Find free** — who is free, on leave, or teaching in a chosen period.
- **Leave & cover** — **Pending leave requests** (Approve / Reject), put a teacher on leave, and the **Cover planner**.

Working week and bell times are set under **School profile → Bell Schedule & Timings**.

Teachers request leave from **My leave** on their dashboard. Approved leave overlays timetables and notifies principal, vice principal, supervisors, and co-ordinators.

### 2.4 School profile (`School setup → School profile`)

Tabs: **Identity & Affiliation**, **Campus & Contact**, **Modules & Security**, **Grading Framework**, **Bell Schedule & Timings**.

Edit identity, logo, working week, bell schedule, grading bands, pass/distinction, exam weights, and digests.

- You can update most profile fields and the logo.
- The **join code** is on **Modules & Security** for sharing; **rotating** it is principal-only.
- Optional modules (Board ops / CPD) are controlled by the principal when saving.

---

## 3. Marks — enter, chase, approve

Unlike the principal, the co-ordinator **can enter and bulk-upload marks** as well as approve them.

### 3.1 Mark register (`Marks → Mark register`)

1. Choose exam, class/section, and subject.
2. Enter marks (or `AB` / `EX` / `WH` for absent / exempt / withheld).
3. Split papers show **Theory max** / **Practical max** and **Th** / **Pr** columns. Codes apply to **theory only**.
4. Elective papers show **—** (**Not enrolled**) for students who are not on that paper — skip those cells.
5. **Save draft** — drafts stay out of analytics until submitted and approved.
6. **Submit** for leadership approval (you or the principal can then Approve).

### 3.2 Bulk upload (`Marks → Bulk upload`)

1. Download the spreadsheet template for the class and exam.
2. Fill marks, then upload and **preview** (catches missing students and bad values).
3. Commit when the preview looks correct.

### 3.3 Pending uploads (`Marks → Pending uploads`)

1. Select the exam.
2. The two queues are **accordions**: **Entered — awaiting your approval** and **Still missing marks**. Expand a teacher for papers, **Notify**, **Open register**, and **Approve**.
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

Create and edit batches (title, venue, instructions; **Print student photos when available**), preview (**With photo**), and **Download PDF (5 / A4)**. Ensure paper schedule dates **and start times** exist under Records → Exams for every class that needs tickets (or fill one class and use **Copy class timetable to all classes**).

Upload photos under **Marks → Student photos**: **Bulk upload by admission no** (files named like `ADM-10B-01.jpg`) or one photo per student. PNG or JPEG, 1 MB or smaller. Use **Remove unmatched** to drop files that did not match.

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

When enabled on the school (and granted in Role access):

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

1. Confirm classes, subjects (entry max, practical max, electives), students, photos, **Classes in this exam**, and paper dates in **Records**.
2. Set and **lock** consolidation max marks.
3. Verify teacher assignments and timetables; clear **Pending leave requests** and assign cover.
4. Send deadline notices; watch **Pending uploads**.
5. Enter/upload marks yourself only for papers you cover or when covering gaps (including **Th** / **Pr** where used).
6. **Approve** submitted registers; handle access requests carefully.
7. Check Deep insights → **Exam readiness** and subject difficulty.
8. Produce hall tickets (**Download PDF (5 / A4)**) and **official** consolidated lists when every paper is approved.
9. Support Board ops publish/pack steps if your school uses them.

---

## 10. Co-ordinator vs principal

| You can | Principal only |
|---|---|
| Enter & bulk-upload marks | Create co-ordinator accounts |
| Approve / unapprove / moderate | Manage **Role access** |
| Manage teachers, records, timetables, leave & cover | Rotate join code |
| Edit school profile & logo | Toggle optional modules on save |
| Leadership analytics & CML | Full audit across all roles |

Work with the principal on staff access and school-wide policy; own the exam operations queue day to day.
