# Principal pitch plan — School Marks Analytics

A meeting playbook for getting a school to adopt the platform. Designed for a **30–45 minute** conversation with a principal (optionally with the exam coordinator).

---

## 1. Goal of the meeting

**Primary ask:** Agree to a **2–4 week pilot** for one exam cycle (one class set or one grade).

**Secondary asks (pick one if the pilot is blocked):**

- Second meeting with the exam coordinator + one class teacher
- Access to review sample report cards / consolidated lists from their last exam
- Soft commitment to trial after board exam season

**Success looks like:** A named start date, a school contact, and clarity on who will enter marks during the pilot.

---

## 2. What principals care about (lead with these)

| Pain today | How we help |
|---|---|
| Chasing teachers for incomplete mark lists | Pending uploads, in-app notices, email digests |
| Excel chaos before board / parent meetings | Approved registers → official consolidated lists (PDF/Excel) |
| No single view of school performance | Class, subject, teacher, and year-over-year analytics |
| Report cards without school identity | School profile letterhead (name, address, logo) on every download |
| Staff access sprawl | Join code + principal approval; role-based access |
| “Is this official?” uncertainty | Draft → approve gate; watermarked previews; official download only when complete |

Do **not** open with tech stack, multi-tenant architecture, or MFA. Lead with time saved and fewer exam-week surprises.

---

## 3. Pre-meeting prep (day before)

1. **Learn the school:** board affiliation, roughly how many students/sections, who owns mark entry (teachers vs office).
2. **Decide the pilot scope:** e.g. “Grade 9–10 Unit Test only” or “one section per grade.”
3. **Prepare a live demo** on the seed school (Greenfield) *or* a blank trial tenant under their school name.
4. **Print or PDF a one-page leave-behind** (section 8).
5. **Bring:** laptop, demo URL, join-code story, and a clear pilot checklist.

### Demo accounts (local/seed)

| Role | Email | School ID |
|---|---|---|
| Principal | `principal@school.edu` | `SCH-P01` |
| Exam coordinator | `coordinator@school.edu` | `SCH-C01` |
| Teacher | `anita.sharma@school.edu` | `SCH-T01` |

Password for seed accounts: `password123`. Prefer showing the **principal** view first.

---

## 4. Meeting agenda (suggested)

| Time | Block | Owner |
|---|---|---|
| 0–3 min | Intro + confirm their exam calendar pain | You |
| 3–8 min | Their current process (listen) | Principal |
| 8–12 min | Pitch in plain language (section 5) | You |
| 12–28 min | Live demo (section 6) | You |
| 28–35 min | Objections + fit check | Both |
| 35–45 min | Pilot ask + next steps | You |

If they only give **20 minutes**, do: listen (3) → pitch (3) → demo highlights (10) → ask (4).

---

## 5. Pitch narrative (2–3 minutes)

Use this arc; adapt names and board language to the school.

> **Problem.** After every exam, leadership spends days chasing incomplete registers, merging spreadsheets, and hoping the consolidated list matches what parents will see.
>
> **What we built.** School Marks Analytics is a role-based marks and results platform for principals, exam coordinators, and teachers. Teachers enter marks; leadership approves; then analytics, consolidated lists, and report cards stay consistent.
>
> **Why it fits you.** Your school keeps its own data, branding, and join code. Teachers request access; you approve. Nothing goes on an official list until you say it is ready.
>
> **Proof in the room.** In the next few minutes we will walk the path you actually take in exam week: pending uploads → approve → consolidated list → parent-facing report card.
>
> **Ask.** A short pilot on one exam so your coordinator and one class teacher can judge it with real workflow—not a slide deck.

**One-liner if interrupted:**

> “We replace exam-week Excel chase with approved mark registers, school-branded reports, and one place for you to see what is still missing.”

---

## 6. Live demo flow (principal-first)

Keep the demo under **15 minutes**. Stay in the principal account unless they ask to see a teacher screen.

### Act A — School desk / pending work (2 min)

1. Sign in as principal.
2. Show **pending uploads** / incomplete registers.
3. Send a **notify teachers** reminder (deadline or incomplete marklist).

**Talk track:** “You see who is late without opening ten WhatsApp threads.”

### Act B — Approve → official (4 min)

1. Open a mark register with drafts.
2. Show **Approve** (draft marks do not pollute school analytics until approved).
3. Open **Consolidated lists** → Ready vs incomplete.
4. Download a **preview** (watermarked) vs explain **official** only when every subject is approved.

**Talk track:** “Preview for internal review; official only when the class is complete—so parents never get a half-finished sheet.”

### Act C — Analytics that answer board questions (3 min)

Show one of each, briefly:

- Class / division results
- Subject-wise view
- Same-subject teacher comparison (if relevant)
- Previous-year comparison for the same exam type

**Talk track:** “When the board or management asks ‘how did Class 10 do in Maths versus last year?’ you answer from here.”

### Act D — School identity + staff onboarding (3 min)

1. **School profile:** name, address, logo → show letterhead on a PDF.
2. **Staff join code:** teachers request access; principal approves.
3. Optional glance: **Timetables** (daily board / find free teacher) or **Board ops** (report-card publish) if they care.

**Talk track:** “Your crest on every download; your join code for staff; you stay in control of who gets in.”

### Act E — Close the demo (1 min)

Return to the pilot ask. Do not wander into platform-admin or CPD unless they ask.

---

## 7. Objection handling

| Objection | Response |
|---|---|
| “Teachers will not switch from Excel.” | Pilot with one willing class teacher + coordinator. Import path / familiar register layout; approve gate mirrors how offices already “finalize” sheets. |
| “We already have an ERP / SMS.” | Position as the **marks → results → analytics** layer that ERPs often do poorly. Pilot side-by-side for one exam. |
| “Data privacy / cloud fears.” | Per-school tenancy; role-based access; MFA available; principal controls staff approval. Offer to walk security with their IT person in a follow-up. |
| “No time until after exams.” | Book the pilot for the **next** unit/mid-term; use this meeting only for scope + champion. |
| “Must match our board format.” | Configurable grade bands, pass percent, theory/practical, electives, consolidation max-marks lock. Collect one sample sheet and map it in the pilot week. |
| “Parents need access.” | Principal-issued parent/student portal link for approved marks on an exam. |
| “What if marks are wrong?” | Draft until approve; moderation/grace with reason; unlock consolidation only for corrections. |
| “Cost?” | Defer detailed pricing until pilot scope is clear. Frame pilot as low-risk evaluation on one exam cycle. |

---

## 8. Leave-behind one-pager (copy onto a single page)

**School Marks Analytics — for principals**

- Teachers enter marks; you approve; then results and analytics stay aligned  
- Pending uploads + teacher notices so incomplete lists surface early  
- Official consolidated lists and report cards with your school letterhead  
- Class, subject, teacher, and year-over-year analysis in one place  
- Staff join with a school code; you approve access  
- Parent/student read-only portal when you publish  

**Pilot proposal:** 2–4 weeks · one exam · one grade or section set · success = coordinator can produce an official consolidated list without a spreadsheet merge  

**Next step:** Confirm start date and nominate exam coordinator + one class teacher  

---

## 9. Pilot proposal (say this out loud)

> “Let’s run a pilot on your next [unit test / mid-term] for [Grade X]. Your exam coordinator owns the calendar and approvals. One class teacher enters marks. We help with setup in the first week. At the end, you decide: continue, expand, or stop—no long contract required to evaluate.”

### Pilot checklist (leave with them)

- [ ] Pilot start date: ________  
- [ ] Exam name / type: ________  
- [ ] Classes / sections in scope: ________  
- [ ] Champion (exam coordinator): ________  
- [ ] Class teacher volunteer: ________  
- [ ] School display name + logo for letterhead: ________  
- [ ] Follow-up call date: ________  

---

## 10. After the meeting

**Same day**

1. Send a short thank-you email with the one-pager and pilot checklist.  
2. Share the demo link (or trial tenant) and principal login instructions.  
3. Log objections and board-format samples they promised to send.

**Within 48 hours**

1. Confirm pilot scope in writing (classes, exam, dates).  
2. Schedule a 30-minute setup call with the coordinator.  
3. If they stalled, send one useful artifact (sample consolidated PDF with *their* school name mocked up).

**Do not** flood them with feature lists, CPD modules, or platform-admin screenshots unless requested.

---

## 11. Internal scorecard (your debrief)

Rate 1–5 after each meeting:

- Urgency of exam-week pain  
- Authority of the person in the room  
- Clarity of a champion (coordinator/teacher)  
- Fit of board/report requirements  
- Strength of the pilot commit  

**Advance** if authority ≥ 4 and pilot commit ≥ 3. Otherwise book the second meeting with the missing stakeholder before pushing paperwork.
