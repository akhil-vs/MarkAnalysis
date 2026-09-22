# Design: Teacher leave + balanced substitute coverage

Status: **implemented** (Phases A–C)  
Audience: Principal / academic supervisor (leadership)  
Depends on: existing weekly `TimetableEntry` template, periods, working days, `/api/timetable/free` + daily board

## Problem

When a teacher is on leave, the school needs to:

1. Mark the teacher as on leave for one or more calendar days (or a date range).
2. Show those periods as **uncovered / on leave** on the daily timetable board (without destroying the permanent weekly template).
3. Assign **substitute teachers** for each vacated period.
4. Prefer substitutes whose load stays fair: enough free periods that day, and week/day hours that do not pile onto the same few teachers.

## Recommendation (best fit for this codebase)

**Keep the weekly timetable as a reusable template. Apply leave and substitutes as a dated overlay.**

Do **not** rewrite `TimetableEntry` rows when someone is absent. The weekly grid is the long-lived schedule; leave is a short-lived calendar event. Overlays:

- preserve the master timetable when leave ends
- support multi-day leave cleanly
- allow partial-day leave (selected periods only)
- compose with holidays / non-working days later
- match how the daily board already resolves a calendar date → `dayOfWeek` → template slots

This is the same pattern schools use operationally: “today’s duty roster” sits on top of the fixed week plan.

---

## Data model

### `TeacherLeave`

| Field | Purpose |
|---|---|
| `id`, `tenantId` | Identity + multi-school |
| `teacherId` | Teacher on leave |
| `startDate`, `endDate` | Inclusive calendar range (`YYYY-MM-DD`) |
| `leaveType` | `FULL_DAY` \| `PARTIAL` (optional extension) |
| `reason` | Optional free text (sick / personal / training) |
| `status` | `ACTIVE` \| `CANCELLED` |
| `createdById` | Principal / coordinator who recorded it |
| `createdAt`, `updatedAt` | Audit |

Optional later: `periodIds[]` for partial-day leave within a date.

**Constraint:** one active leave per teacher may overlap dates only if periods differ (v1 can simply reject overlapping ACTIVE ranges for the same teacher).

### `TimetableSubstitution`

| Field | Purpose |
|---|---|
| `id`, `tenantId` | Identity |
| `leaveId` | FK to the leave that caused the gap (nullable if ad-hoc cover) |
| `date` | Calendar day being covered |
| `periodId` | Bell period |
| `classSectionId`, `subjectId` | Class/subject from the original slot (denormalized for fast board reads) |
| `originalTeacherId` | Teacher who would have taught |
| `substituteTeacherId` | Covering teacher |
| `sourceTimetableEntryId` | Optional link back to template row |
| `assignedById` | Who confirmed the cover |
| `notes` | Optional |
| `createdAt` | Audit |

**Uniques:**

- `(date, periodId, classSectionId)` — one cover per class slot
- `(date, periodId, substituteTeacherId)` — substitute cannot be double-booked that period (unless school policy later allows combined classes)

Template `TimetableEntry` stays untouched.

---

## Effective timetable for a day

For date `D` with ISO weekday `W`:

```
templateSlots = TimetableEntry where dayOfWeek = W
leaves        = TeacherLeave ACTIVE covering D
subs          = TimetableSubstitution where date = D

for each template slot:
  if original teacher has leave that day (full or that period):
    if sub exists for (D, period, class):
      show substitute teacher (badge: "Cover")
    else:
      show "UNCOVERED" / "On leave" (needs cover)
  else:
    show normal teacher
```

Daily board, teacher daily view, and find-free must all use this **effective** layer, not raw template alone.

Teachers on leave are **not free** for substitute duty that day.

---

## Who can do what

| Action | Principal | Exam coordinator | Teacher |
|---|---|---|---|
| Put teacher on leave | Yes | Yes (if `timetables` feature) | No |
| Cancel leave | Yes | Yes | No |
| Assign / change substitute | Yes | Yes | No |
| Auto-suggest substitutes | Yes | Yes | View own cover only |
| See leave on own timetable | — | — | Yes (own day/week) |

Use existing `requireLeadership()` + `requireFeature("timetables")`.

---

## UX (leadership)

### 1. Put on leave

Entry points:

- Timetables → teacher row → **Put on leave**
- Daily board → teacher name → **On leave**
- Optional Staff row action

Form:

- Teacher (pre-filled when opened from a row)
- Start / end date
- Reason (optional)
- Checkbox: **Suggest covers for all vacated periods** (default on)

On save:

1. Create `TeacherLeave`.
2. Expand each working day in range → list vacated teaching periods from template.
3. If suggest-on: run balancer (below) and open **Cover planner** with ranked picks pre-filled (editable).
4. Notify affected teachers (leavee + each substitute) via existing `Notification` + optional email digest.

### 2. Cover planner (day or leave range)

Table: Period | Class | Subject | Original | Suggested sub | Score | Override dropdown

Actions: **Accept all suggestions**, **Accept selected**, **Clear**, **Save covers**.

Uncovered slots stay highlighted on the daily board (amber/red).

### 3. Daily board changes

- Leave teacher rows: struck / muted with **Leave** chip.
- Covered cells: substitute name + small **Cover** chip; tooltip shows original teacher.
- Uncovered cells: **Needs cover** CTA → opens single-slot assigner (reuse find-free + scores).

### 4. Teacher view

Absent teacher’s daily/weekly view for those dates shows leave and who is covering.  
Substitute’s view shows extra **Cover** periods for those dates.

---

## Substitute selection algorithm (recommended)

### Goal

Fair cover that does not overload anyone, while preferring subject/class familiarity when possible.

Hard filters first, then soft scoring. Principal always sees ranked options and can override.

### Hard filters (must pass)

For slot `(date D, period P, class C, subject S, original teacher T0)` candidate `T`:

1. `T` is ACTIVE teacher, not `T0`.
2. `T` is **not on leave** on `D`.
3. `T` has **no template teaching** in period `P` on weekday of `D`.
4. `T` has **no other substitution** already in `(D, P)`.
5. Optional school policy: `T` must teach same subject **or** same class (configurable; default **prefer, do not require**).

### Soft score (higher = better)

Compute for each candidate on day `D` (after applying already-accepted covers for that date in the same planning session):

| Signal | Definition | Weight (default) |
|---|---|---|
| **Day headroom** | Free teaching periods left that day after this cover | +3 per free period remaining (cap at school max) |
| **Avoid overload** | Penalize if day load after cover ≥ school `maxPeriodsPerDay` (default: teaching periods − 1) | −100 hard soft-fail / exclude if ≥ max |
| **Week balance** | Distance below school median weekly template hours + covers this week | +2 × (median − candidateWeeklyLoad) |
| **Consecutive relief** | Prefer not stacking 3+ teaching periods in a row | −4 if this cover creates a 3+ streak |
| **Subject match** | Candidate has assignment or recent teaching of subject `S` | +8 |
| **Class familiarity** | Candidate already teaches class `C` | +5 |
| **Recent cover fairness** | Covers given in last N school days (default 14) | −1.5 × recentCoverCount |
| **Same department / stage** | Optional tag match | +2 |

Then rank descending. Break ties by lower weekly load, then name.

### Why this is the best method for schools

| Approach | Verdict |
|---|---|
| **Manual only (pick any free teacher)** | Works but unfair; same popular teachers get dumped on |
| **Round-robin only** | Fair-ish but ignores day free periods and subject fit |
| **Pure optimization (ILP/min-cost flow over all slots)** | Best math, but opaque and heavy for v1; good as Phase 3 |
| **Hard filters + weighted score + human confirm (this plan)** | Transparent, fast, fair enough, fits existing find-free UX; principal stays in control |

**Phase 1–2:** greedy per-slot scoring with session-aware load updates (when assigning many slots for one leave, recompute after each pick so the same person is not auto-filled for every period).

**Phase 3 (optional):** global assignment for a leave day as a min-cost matching:

- bipartite graph: vacated slots ↔ eligible teachers
- edge cost = negative soft score
- solve with Hopcroft–Karp / successive shortest path / small ILP
- still present as suggestions the principal can edit

Start with greedy + rescoring; add global matching only if schools complain about batch unfairness.

### School knobs (School profile → Timetables / Leave)

- `maxPeriodsPerDay` (default: count of teaching periods − 1)
- `minFreePeriodsPerDay` while covering (default: 1)
- `preferSubjectMatch` (bool, default true)
- `requireSubjectMatch` (bool, default false — too strict for many schools)
- `balanceWindowDays` (default 14)

---

## API sketch

All under `/api/timetable`, leadership + feature gated.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/leaves` | Create leave (`teacherId`, `startDate`, `endDate`, `reason?`) |
| `GET` | `/leaves?from=&to=&teacherId=` | List leaves |
| `DELETE` / `PATCH` | `/leaves/:id` | Cancel or edit range |
| `GET` | `/day-effective?date=` | Daily board with leave + covers (extends or replaces `/day`) |
| `GET` | `/substitutes/suggest?date=&periodId=&classSectionId=` | Ranked candidates + scores |
| `POST` | `/substitutes/plan` | Body: leaveId or date → vacated slots + auto suggestions |
| `POST` | `/substitutes` | Upsert covers (batch) |
| `DELETE` | `/substitutes/:id` | Remove cover |
| `GET` | `/free` | Extend: exclude teachers on leave; optional `?rank=workload` |

Audit important mutations via existing operational audit log.

---

## Notifications

- Leavee: “You are marked on leave {dates}.”
- Each substitute: “You are covering {class} / {subject} for {teacher} on {date} period {name}.”
- Leadership digest (optional): uncovered slots remaining for tomorrow.

---

## Implementation phases

### Phase A — Leave overlay (MVP)

- Schema + migrations for `TeacherLeave`
- Create/cancel leave UI
- Effective daily board: leave chips + vacated slots as uncovered
- Teacher daily view respects leave
- Extend `/free` to exclude leave

### Phase B — Manual substitutes

- `TimetableSubstitution` CRUD
- Assign cover from uncovered cell (dropdown of free teachers)
- Cover chips on board + teacher views
- Notifications

### Phase C — Balanced auto-suggest

- Scoring library `lib/substituteScore.js` + unit tests
- Cover planner with ranked suggestions and session rescoring
- School profile knobs

### Phase D — Polish

- Partial-day leave by period
- Global day matching optimizer
- Printable “today’s cover sheet” PDF
- Calendar import / recurring leave

Ship A → B → C in that order. A alone already makes leave visible; B makes operations work; C is the fairness engine requested here.

---

## Testing plan

- Unit: score ranking (overload excluded; subject match beats stranger with same free count; recent covers deprioritized; session rescoring spreads load).
- API: leave CRUD; effective day payload; substitute conflict uniqueness; free list excludes leave.
- UI / e2e: principal puts teacher on leave → board shows uncovered → assign sub → substitute sees cover period.

---

## Non-goals (v1)

- Payroll / HR leave balances
- Self-service leave requests by teachers (can add later as request → principal approve)
- Permanently reassigning the weekly template (use existing timetable edit for that)
- Auto-publishing covers without leadership confirmation

---

## Summary

**Best method:** dated **leave + substitution overlay** on the existing weekly template, with **hard eligibility filters** and a **transparent weighted workload score**, confirmed by the principal in a cover planner. Use greedy per-slot assignment with live rescoring for multi-period leave; optionally upgrade to global matching later. This keeps the master timetable stable, mirrors school practice, and directly targets “don’t burden the same teachers / keep free periods / balance hours.”
