# Principal user manual

School Marks Analytics — guide for the **Principal** role.

The principal owns school setup, staff access, leave and cover, mark approval, leadership analytics, and board-facing outputs. Principals **do not type or bulk-upload marks**; teachers and exam co-ordinators enter registers, and you review and approve them.

---

## 1. Sign in and home desk

1. Open the app login page.
2. Enter your **email**, **school ID**, and **password**.
3. If MFA is enabled, enter the 6-digit authenticator code (or a recovery code).

You land on the **Principal desk** (`/`): school average, pass rate, distinction/fail counts, register readiness, pending uploads, submitted papers waiting for approval, and shortcuts into Deep insights and Consolidated lists.

- Use the **exam selector** at the top to switch the working exam. Teachers and leadership share the same latest exam by default.
- Open the **?** hint on any page for a short “what’s on this page” tip (and **How it is useful**).
- Download this guide any time from **HELP → User manuals**.

---

## 2. First-time school setup

Work through these once per academic year (and whenever structure changes).

### 2.1 School profile (`School setup → School profile`)

The page is split into tabs. Jump to the section you need:

| Tab | What to do |
|---|---|
| **Identity & Affiliation** | School name, short name, board, affiliation, motto, crest. Upload a **PNG or JPEG logo** — it prints as letterhead on report cards, class summaries, consolidated lists, and Excel downloads. |
| **Campus & Contact** | Address, phone, email, website, and other campus details. |
| **Modules & Security** | **Staff join code** (share with teachers and co-ordinators so they can request access at `/signup`). Only the principal can **rotate** the join code. Optionally enable **email digests** and optional modules (**Show Board ops**, **Show CPD**). Staff still need the matching permission under **Staff → Role access**. |
| **Grading Framework** | **Pass percent**, **distinction minimum**, **grade bands**, and **unit / mid / final weights** for the annual composite used in Deep insights. Configure these before publishing results. |
| **Bell Schedule & Timings** | **Working week** (5 or 6 days) and **bell schedule** (period names and times) so timetables match your day. Deep-link `#school-schedule` opens this tab. |

### 2.2 Records (`School setup → Records`)

| Tab | What to do |
|---|---|
| **Classes** | Create a class with several divisions at once (**Add class with divisions**, **Fill A–D** for a quick start); assign a **class teacher** per division. The **Registered class sections** directory expands a grade to manage divisions — search by class, section, or teacher; filter by class teacher / status; export CSV. |
| **Subjects** | Add subjects to the pool with **Max marks** (theory ceiling for mark entry). Optional **Practical max** (leave blank for theory-only). Tick **Elective (enroll selected students only)** and use **Enrollments** to pick students. Then select which pool subjects each class uses. |
| **Students** | Add or import the roll; upload photos for hall tickets (or use **Marks → Student photos**). |
| **Exams** | Create exams; under **Classes in this exam** choose which classes sit under it (**Select all** / **Clear**, or toggle **Class {name}** — editable later). Set paper dates (same date for all, or per class/subject); set **Max marks [consolidation]**; **Lock for consolidation** when ready. If one class paper timetable is complete, **Copy class timetable to all classes**. |
| **Promote** | After a year, promote a class to the next section without losing prior marks. |

### 2.3 Staff (`School setup → Staff`)

1. Activate pending sign-ups, or **add / bulk-import** staff (Name, Email, School ID, Password, Role).
2. The list is an **accordion**: expand a row for assignments and actions (edit, **Transfer classes**, timetable, notify).
3. Only the principal can create **exam co-ordinator** accounts and open **Role access**.
4. Under **Role access**, grant menu features per role — including **Timetables**, **Leave approval**, and **Assign substitutes** for vice principals, supervisors, or co-ordinators.
5. Assign each teacher to **class + subject** papers. Teachers cannot enter marks until they are **ACTIVE** and assigned.
6. Open a teacher’s **timetable** from the staff row when needed.

### 2.4 Timetables (`School setup → Timetables`)

Four tabs: **Teachers**, **Daily board**, **Find free**, **Leave & cover**. Tabs appear according to Role access (**Timetables**, **Leave approval**, **Assign substitutes**).

**Teachers (accordion)**

1. Search teachers, or filter by **class** and **subject**. Each row shows subjects and a **periods/week** badge.
2. Expand a teacher, then:
   - **Open timetable** — embedded weekly grid, plus **Open full page** for Daily / Weekly / Hours history (leadership can add or remove periods on the full page).
   - **Put on leave** — Start / End, optional reason. If you can assign substitutes, tick **Suggest a different free teacher for each vacated period**. **Save leave**, then **Review covers**.
   - **Hrs history** — own teaching hours plus extra cover hours. The week follows the working days in School profile (not Monday–Sunday). Use **Previous week** / **Next week**, or **From** / **To** and **Show range** (up to 31 days).

**Daily board**

- One page with every teacher for a chosen day. Summary: on leave · need cover · covers assigned.
- Green cells are free. **Click and drag to scroll periods**.
- Each teacher row shows period count and teaching hours, plus **+extra** hours when they are covering.
- Vacated cells show **Needs cover**, **Cover**, or **On leave · covered**. Use **Assign cover** on an uncovered cell to pick a ranked substitute (**Score**, free periods left).
- **Put on leave** from a teacher row when Leave approval is enabled.

**Find free**

- Pick a date and **Period**. Sections: **Free teachers**, **On leave**, **Teaching this period** (includes Cover rows).

**Leave & cover**

- **Pending leave requests** — teachers submit **My leave** on their dashboard. **Approve** (overlays timetables and notifies principal, vice principal, supervisors, and co-ordinators) or **Reject**.
- **Put a teacher on leave** — same form as the accordion; can auto-suggest covers.
- **Cover planner** — accept ranked substitutes per vacated period (**Accept selected covers**). Slots that cannot be auto-suggested stay on the daily board as **Needs cover**.

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

When you open a register, split papers show **Theory max** and **Practical max** (codes `AB` / `EX` / `WH` apply to theory only). Elective papers show a dash for students who are not enrolled.

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

On theory + practical papers these codes apply to **theory only**.

### 3.4 Consolidated lists (`Marks → Consolidated lists`)

1. Ensure **Max marks** (Subjects) and **consolidation max** (Exams) are set and locked as needed. Lists **scale** entry marks onto the consolidation ceiling.
2. Choose exam → class → division.
3. Divisions show **Ready** when every subject register is fully approved.
4. Download **Excel** or **PDF**. Incomplete divisions can be downloaded as a **preview** (watermarked). **Official** download requires full approval.
5. From an incomplete class, **notify** the teachers still missing papers.

### 3.5 Hall tickets (`Marks → Hall tickets`)

1. Pick exam, class, and division.
2. Create/edit batch details (title, venue, instructions). Tick **Print student photos when available**.
3. Preview on the right (**With photo** count); **Download PDF (5 / A4)** (or the PDF button beside each division).
4. Paper dates **and start times** must exist under Records → Exams for every class that needs tickets (or fill one class and use **Copy class timetable to all classes**).

Upload photos under **Marks → Student photos** (or Records → Students). Use **Bulk upload by admission no** with files named like `ADM-10B-01.jpg`, or add one photo per student. PNG or JPEG, 1 MB or smaller. Unmatched files can be removed with **Remove unmatched**.

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

Enable under School profile → **Modules & Security** if your school uses them, then grant the matching **Role access**.

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

1. Confirm subjects (including practical max / electives), max marks, roll, photos, included classes, and paper dates in **Records**.
2. Lock consolidation max marks when ready.
3. Confirm teacher assignments, Role access (leave / substitutes), and deadlines.
4. Clear **Pending uploads** — notify, then **Approve**.
5. Resolve **Access requests** only when needed.
6. Approve **Pending leave requests** and assign cover so the daily board stays current.
7. Review **Deep insights → Exam readiness**, then school/class/subject reports.
8. Generate **official consolidated lists** and hall tickets (**Download PDF (5 / A4)**).
9. Publish / sign off report cards (Board ops) if used.
10. Spot-check the **Audit log** if any result is questioned.

---

## 10. Principal-only capabilities

Compared with the exam co-ordinator, only the principal can:

- Create and manage **exam co-ordinator** accounts
- Manage **staff Role access** (including Timetables, Leave approval, Assign substitutes)
- **Rotate** the school join code
- Toggle optional modules (Board ops / CPD) when saving school profile
- View the **full** audit trail (including co-ordinator actions)

Principals do **not** enter or bulk-upload mark registers.
