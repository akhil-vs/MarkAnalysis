# Email GTM plan — School Marks Analytics

**Owner:** Marketing (PencilLabs) · **Channel primary:** email · **Motion:** invite / sales-led school pilots  
**Product one-liner:** We replace exam-week Excel chase with approved mark registers, school-branded reports, and one place for leadership to see what is still missing.

This plan assumes public self-serve registration and pricing CTAs stay **off**. Email drives meetings and pilot requests; the platform provisions campuses. Existing copy lives in [`../pitch/`](../pitch/).

---

## 1. Strategic intent

| Goal | Why email first |
|---|---|
| Book principal + co-ordinator demos | Decision-makers still open school mail; LinkedIn is secondary |
| Convert demos → 2–4 week pilots | Written trail + leave-behind beats a cold call alone |
| Activate provisioned campuses | Credential and setup emails reduce time-to-first-CML |
| Expand from pilot → paid / multi-exam | Trust is built inside one exam cycle; nurture by calendar |

**North-star outcomes (first cohort):**

1. **Meetings booked** from outbound + inbound pilot form  
2. **Pilots provisioned** with a named co-ordinator champion  
3. **Official CML produced** without a spreadsheet merge (pilot success)  
4. **Expansion conversations** opened before the next major exam window  

Do **not** measure success by list size or open rate alone. In this market, a short personalised note that lands a meeting beats a blast newsletter.

---

## 2. Positioning for every email

**Category:** Exam-desk control software for schools (not “AI edtech,” not LMS replacement).

**Primary promise:** Certainty before parents and the board — draft → approve → official downloads from one source of truth.

**Proof points to rotate (pick 1–2 per email):**

- Pending uploads + teacher notices replace WhatsApp chase  
- Official consolidated lists unlock only when every paper is approved  
- School name, address, and crest on report cards / CML / Excel  
- Staff join by code the principal controls  
- Same workspace for timetables, leave cover, and leadership insights  

**Tone:** Institutional, respectful, concrete. Spell the school name correctly. Never lead with pricing, stack, or “AI.” Avoid vendor-first language inside the school’s mental frame — they care about exam week, not PencilLabs.

**Brand rule in copy:** Full name **School Marks Analytics** on first mention; **Marks Analytics** only in tight subject lines if needed. Vendor line: PencilLabs.

---

## 3. Ideal customer profile (ICP)

### Primary buyer

- **Principal** (or Head of School) at mid-size CBSE / affiliated campuses with multiple divisions and a real exam co-ordinator role  
- Pain: post-exam merge chaos, incomplete lists, unclear ownership of “is this official?”  

### Champion / day-to-day

- **Exam co-ordinator** — must be named in every pilot ask  

### Influencers (cc only when invited)

- Vice principal / supervisor with leave or timetable ownership  
- IT only after the principal cares — then use a separate short note (MFA, privacy link, no student data on first call)  

### Out of scope for v1 outbound

- Individual teachers as cold targets  
- Pure tuition centres without a consolidation desk  
- Open marketplace / parent acquisition campaigns  

### Segment tiers for list hygiene

| Tier | Definition | Email treatment |
|---|---|---|
| A | Known principal, warm intro, or inbound `/request-pilot` | Personal 1:1 within 24h |
| B | Target school, verified email, exam calendar known | 4-touch cold sequence |
| C | Directory / event leads, weak verification | Single soft touch; park if no reply |

---

## 4. Funnel architecture (email as the spine)

```text
List / referral / event
        │
        ▼
  Cold outreach (E1) ──► Bump (E2–E3) ──► Soft break-up (E4)
        │                      │
        └──────── meeting ─────┘
                 │
                 ▼
        Thank-you + deck (same day)
                 │
                 ▼
     Pilot confirm / /request-pilot
                 │
                 ▼
        Campus provisioned email
                 │
                 ▼
   Activation nudges (week 1–2) ──► Mid-pilot check-in
                 │
                 ▼
        Pilot success / case note
                 │
                 ▼
   Expansion / renewal ask (next exam)
```

Inbound from `/request-pilot` skips cold sequence: treat as **Tier A** (acknowledge → qualify → book or provision).

**Supporting assets (attach rules):**

| Stage | Attach |
|---|---|
| Cold E1 | Leave-behind only ([`principal-leave-behind.md`](../pitch/principal-leave-behind.md)) |
| Post-meeting | Deck PPTX + leave-behind |
| Provisioned | No deck; login + join code + setup steps |
| Expansion | Optional one-paragraph case note + leave-behind |

---

## 5. Campaign calendar (exam-aligned)

School buying follows the **exam calendar**, not SaaS quarters. Plan outbound waves **4–6 weeks before** common unit / mid-term / final windows.

| Window | Marketing job | Primary emails |
|---|---|---|
| Pre-exam (T−6 to T−3 weeks) | Book demos; open pilots for “next exam” | Cold sequence + meeting thank-you |
| Exam week | Do not cold-spam principals | Silence outbound; service existing pilots only |
| Post-exam (T+1 to T+3 weeks) | Capture pain while fresh; close pilots that ran | Check-in, success ask, expansion |
| Mid-term lull | Soft nurture / referral | One value note or referral ask |

**Cadence caps:** Max **one** cold sequence in flight per contact. Max **one** nurture email every 3–4 weeks to non-engaged Tier C. Always honour unsubscribe / “please don’t email.”

---

## 6. Sequences (what to send)

Ready-to-send copy for cold, thank-you, and provisioned lives in [`../pitch/principal-outreach-email.md`](../pitch/principal-outreach-email.md). Follow-up and lifecycle drafts live in [`email-sequences.md`](./email-sequences.md).

### 6.1 Cold principal sequence (Tier B)

| Day | Email | Job |
|---|---|---|
| 0 | Meeting request | Pain + workflow + 3 time slots + `/request-pilot` |
| 3 | Short bump | New subject; one proof point; resend slots |
| 7 | Co-ordinator angle | “Happy to include your exam co-ordinator” |
| 14 | Break-up | Leave door open for next exam cycle |

### 6.2 Inbound pilot request (Tier A)

| Timing | Email | Job |
|---|---|---|
| &lt; 4 business hours | Acknowledge | Confirm receipt; ask 2 clarifying questions (exam + classes) |
| After qualify | Book or provision path | Meeting slots **or** confirm checklist for provision |
| After provision | Campus ready | Credentials + setup agenda |

### 6.3 Pilot activation (after provision)

| Timing | Email | Job |
|---|---|---|
| Day 0 | Provisioned | Login, join code, 4-step first session |
| Day 3 | Activation nudge | “Have crest + pilot exam been set?” |
| Day 10 | Mid-pilot | Pending uploads / approve / CML path reminder |
| End of pilot | Success + expansion | Ask for official CML confirmation; propose next exam |

### 6.4 Expansion & referral

- **Expansion:** After one official CML, propose the next exam type or adjacent grades.  
- **Referral:** Ask for one peer principal introduction — not a mass forward.  
- **Re-engage:** Quiet schools 1–2 weeks before their next known exam window only.

---

## 7. List building (ethical, high-signal)

**Preferred sources**

1. Warm introductions from existing school contacts  
2. Inbound `/request-pilot` and event conversations  
3. Verified school office / principal emails from public school sites (personalised, not scraped blasts)  
4. Association / cluster meetings where business cards were exchanged  

**Do not**

- Buy bulk educator lists and spray  
- Email teachers’ personal Gmail without a relationship  
- Put student or parent PII in marketing systems  

**CRM hygiene (minimum fields):** school name, board/affiliation, principal name + email, co-ordinator if known, next exam window, tier, last touch, stage (cold / meeting / pilot / active / parked).

---

## 8. Metrics & weekly operating rhythm

### Leading indicators

| Metric | Healthy early signal |
|---|---|
| Personalised sends / week | Consistent operator capacity (quality &gt; volume) |
| Reply rate (cold) | Track; iterate subject + first paragraph |
| Meetings booked / 10 Tier-B sends | Primary outbound efficiency |
| Pilot-form → contacted &lt; 24h | Inbound SLA |

### Lagging indicators

| Metric | Definition |
|---|---|
| Pilots provisioned | Campus live with principal credentials |
| Pilot success | Official CML without spreadsheet merge |
| Expansion started | Second exam or wider class set agreed |
| Referral intros | Named warm intro secured |

### Weekly marketing stand-up (30 min)

1. Pipeline by stage (counts, not vanity opens)  
2. This week’s exam-window targets  
3. Copy that won / lost replies  
4. Blockers: SMTP, provision lag, missing leave-behind personalisation  

---

## 9. Ops, tooling, compliance

| Need | Guidance |
|---|---|
| Sending | Named human from PencilLabs (or school-facing alias with a real person behind it). Phone in signature. |
| Product mail | Configure `SMTP_*` for digests / provision ops; marketing 1:1 can start from the same mailbox or a dedicated outreach address |
| Tracking | Prefer CRM notes over heavy pixel tracking for school leaders |
| Legal | Link [`/privacy`](../PRIVACY.md) when discussing data; no student data in pitch emails |
| Consent | Cold B2B school outreach: keep short, relevant, easy opt-out; stop on request |
| Attachments | PDF/PPTX leave-behind and deck only; never attach credentials in the same thread as a public CC |

**Production hooks already in product:** `/request-pilot` → platform **School pilots** → provision → principal email drafts in the pitch pack.

---

## 10. 90-day execution plan

### Days 1–30 — Foundation

- [ ] Lock Tier-A/B school list (quality over quantity)  
- [ ] Personalise leave-behind school name fields per send  
- [ ] Set inbound SLA on `/request-pilot` (&lt; 4 business hours)  
- [ ] Run cold sequence on first Tier-B batch; log reply themes  
- [ ] Confirm SMTP / outbox for post-provision operational mail  

### Days 31–60 — Convert

- [ ] Every meeting gets same-day thank-you + deck  
- [ ] Every yes gets provision + Day-0 / Day-3 activation emails  
- [ ] Capture one written pilot success note (with school permission) for expansion copy  

### Days 61–90 — Expand

- [ ] Expansion emails to successful pilots ahead of next exam  
- [ ] Referral ask to champions  
- [ ] Refresh subject lines from reply data; park dead Tier-C leads  

---

## 11. Message house (cheat sheet)

| Audience | Hook | CTA |
|---|---|---|
| Principal | Certainty before parents / board | 30–45 min meeting or `/request-pilot` |
| Co-ordinator | Less chase, clearer pending uploads | Join the demo / own the pilot checklist |
| After pilot | You already produced an official CML | Next exam / adjacent grades |
| Peer referral | “Your co-ordinator’s workload dropped because…” | Intro to one colleague |

**Objection → email reply angle**

| Objection | Angle |
|---|---|
| “We already use Excel” | Keep Excel for teaching; official list should not depend on a merge |
| “Teachers won’t adopt” | Draft entry for assigned papers only; join code + short manuals |
| “What does it cost?” | Defer to conversation; restate pilot success definition first |
| “Data / privacy” | Point to `/privacy`; invite-led campus; principal-controlled join code |
| “Too busy in exam week” | Offer to start **after** current exam or on the **next** unit test |

---

## 12. Related files

| File | Role |
|---|---|
| [`email-sequences.md`](./email-sequences.md) | Follow-up, inbound, activation, expansion copy |
| [`../pitch/principal-outreach-email.md`](../pitch/principal-outreach-email.md) | Cold meeting request, thank-you, provisioned |
| [`../pitch/principal-leave-behind.md`](../pitch/principal-leave-behind.md) | One-pager attachment |
| [`../pitch/README.md`](../pitch/README.md) | Meeting flow + pilot start path |
| [`../SCHOOL_PILOT_READINESS.md`](../SCHOOL_PILOT_READINESS.md) | Branding & go-live checklist |
