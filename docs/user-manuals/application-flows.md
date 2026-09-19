# Application flows by role

School Marks Analytics - how the product works for **Principal**, **Exam co-ordinator**, and **Teacher**.

Use this sheet for a quick map of each role's path. For step-by-step screens and checklists, open the matching role user manual under **HELP**.

---

## Shared spine (all school staff)

```
Access -> Login -> Role desk (/) -> Work exam -> Marks cycle -> Insights / outputs
```

### Getting access

1. **New school** - register at `/register-school` (creates the school and an active principal).
2. **Staff** - open `/signup`, enter the school's **join code** (from **School profile**), and wait for leadership to activate the account.
3. **Sign in** - email, school ID, and password (+ MFA if enabled).

### Core marks cycle

```
Teacher / Co-ordinator enters draft
        -> Submit
        -> Principal / Co-ordinator Approve
        -> Analytics, ranks, official CML, parent portal
```

Only **approved** marks feed school analytics, ranks, official consolidated lists, and the parent portal.

---

## Principal

**Job:** school setup, staff and access, approve marks, leadership analytics, board-facing outputs. Principals **do not** enter or bulk-upload mark registers.

```
Login -> Principal desk
   │
   ├─ Setup (once / yearly)
   │    School profile -> Records -> Staff -> Timetables
   │
   ├─ Per exam
   │    Confirm records / lock consolidation
   │    -> Pending uploads (chase + Approve)
   │    -> Access requests (late / edit)
   │    -> Official CML + Hall tickets
   │    -> Deep insights / school reports
   │    -> Board ops publish (if enabled)
   │
   └─ Oversight
        Full audit log | notify teachers | portal links
```

### Principal-only

- Create and manage **exam co-ordinator** accounts
- Manage **role feature access**
- **Rotate** the school join code
- Toggle optional modules (Board ops / CPD) when saving school profile
- View the **full** audit trail (including co-ordinator actions)

### Typical principal checklist (per exam)

1. Confirm subjects, max marks, roll, and paper dates in **Records**.
2. Lock consolidation max marks when ready.
3. Confirm teacher assignments and deadlines.
4. Clear **Pending uploads** - notify, then **Approve**.
5. Resolve **Access requests** only when needed.
6. Review **Deep insights -> Exam readiness**, then school/class/subject reports.
7. Generate **official consolidated lists** and hall tickets.
8. Publish / sign off report cards (Board ops) if used.
9. Spot-check the **Audit log** if any result is questioned.

---

## Exam co-ordinator

**Job:** day-to-day exam operations - records, teacher chase-ups, mark entry when needed, approvals, consolidated lists, hall tickets, and operational analytics.

```
Login -> Exam coordination desk
   │
   ├─ Setup (ops ownership)
   │    Records | Staff (teachers) | Timetables
   │    | School profile (join-code rotate is principal-only)
   │
   ├─ Per exam
   │    Assignments + deadlines
   │    -> Mark register / Bulk upload (when covering gaps)
   │    -> Pending uploads (notify + Approve)
   │    -> Access requests
   │    -> Hall tickets + official CML
   │    -> Exam readiness / subject analytics
   │
   └─ Support
        Board ops / CPD (if enabled) | portal links | teacher-action audit
```

### Co-ordinator vs principal

| You can | Principal only |
|---|---|
| Enter and bulk-upload marks | Create co-ordinator accounts |
| Approve / unapprove / moderate | Manage role feature access |
| Manage teachers, records, timetables | Rotate join code |
| Edit school profile and logo | Toggle optional modules on save |
| Leadership analytics and CML | Full audit across all roles |

### Typical co-ordinator checklist (per exam)

1. Confirm classes, subjects (entry max), students, and exam paper dates in **Records**.
2. Set and **lock** consolidation max marks.
3. Verify teacher assignments and timetables.
4. Send deadline notices; watch **Pending uploads**.
5. Enter or upload marks yourself only for papers you cover or when covering gaps.
6. **Approve** submitted registers; handle access requests carefully.
7. Check Deep insights -> **Exam readiness** and subject difficulty.
8. Produce hall tickets and **official** consolidated lists when every paper is approved.
9. Support Board ops publish/pack steps if your school uses them.

---

## Teacher

**Job:** enter and submit marks for assigned papers, respond to leadership notices, review own-class analytics, and (if **class teacher**) download the section's consolidated list when every paper is approved.

```
Signup (join code) -> Principal activates + assigns papers
        -> Login -> Teacher desk
   │
   ├─ Per exam
   │    See assigned papers + notices
   │    -> Mark register / Bulk upload
   │    -> Save draft -> Submit
   │    -> (If blocked) request late entry / edit
   │         -> wait for approval -> resubmit
   │
   ├─ If class teacher
   │    Read-only view of section registers
   │    -> Download CML only when every subject is approved
   │
   └─ Also
        Hall tickets (view / download)
        | own Classes / Students analysis
        | own CPD record
```

### What teachers cannot do

- Approve or moderate other teachers' marks
- Manage staff, school profile, or whole-school records
- See incomplete consolidated lists
- Open leadership-only analysis (school overview, subjects hub, teacher comparison, deep insights) unless the principal customises role features

If a paper is missing from your register list, ask leadership to check your **assignments** under Staff.

### Typical teacher checklist (per exam)

1. Confirm your assigned papers on the Teacher desk.
2. Enter or bulk-upload marks; save drafts as you go.
3. Double-check absences (`AB` / `EX` / `WH`) before submit.
4. **Submit** each complete register before the deadline.
5. Watch the bell for reminders or access-request decisions.
6. If you are class teacher, download the **consolidated list** when the section is ready.
7. Download **hall tickets** for your classes when leadership has prepared them.
8. Use **Students** analysis for parent meetings or remedial follow-up.

---

## Who does what (at a glance)

| Task | Principal | Co-ordinator | Teacher |
|---|---|---|---|
| Enter / bulk-upload marks | - | Yes | Yes (assigned) |
| Approve submitted registers | Yes | Yes | - |
| Manage staff and assignments | Full (incl. co-ordinators) | Teachers and assignments | - |
| School profile and join code | Yes (rotate is principal-only) | Edit profile (not join code) | - |
| Records (classes, subjects, students, exams) | Yes | Yes | - |
| Consolidated mark lists | Yes | Yes | Class teachers only (own section, when complete) |
| School / subject / teacher analysis | Yes | Yes | Limited (own classes and students) |
| Timetables | Yes | Yes | View own schedule if shared |
| Board ops and CPD (when enabled) | Yes | Yes | Own CPD record |
| Audit log | Full | Teacher actions | - |

---

## Special mark codes

| Code | Meaning |
|---|---|
| `AB` | Absent |
| `EX` | Exempt |
| `WH` | Withheld |
