# School pilot readiness — branding & go-live

Assessment for approaching schools on a **test / pilot** basis with School Marks Analytics (PencilLabs).

## Verdict

**Ready for controlled school pilots** (invite-led, platform-provisioned campuses), not for open self-serve marketplace launch.

Product, security, and ops foundations are in place. Public registration and pricing CTAs stay off by design. Remaining work is mostly commercial packaging, legal review per jurisdiction, and operator discipline on production env vars.

| Area | Status | Notes |
|---|---|---|
| Core exam workflow (draft → approve → CML) | Ready | Official downloads gated; previews watermarked |
| Multi-tenant school isolation | Ready | Join codes; platform provision / suspend |
| Auth & session hardening | Ready | httpOnly cookies, MFA, rate limits, deploy guards |
| Role manuals / in-app help | Ready | Principal, co-ordinator, teacher PDFs |
| Landing & trust surfaces | Ready for pilots | Pilot request + privacy pages; plans/registration hidden |
| Principal outreach pack | Ready | `docs/pitch/` (PPTX, HTML, email, leave-behind) |
| Open self-serve GTM / billing | Deferred | Pricing UI exists; CTAs off (`SHOW_PUBLIC_*`) |
| Legal / DPA per school | Operator | Confirm board policy before real student data |

## Branding analysis

### What works for school meetings

- **Clear job-to-be-done:** exam-desk control, not a generic “AI school platform.”
- **Academic visual system:** ink navy, cream paper, clay accent, Source Serif + IBM Plex Sans — reads as editorial / institutional rather than consumer SaaS neon.
- **School-first letterheads:** campus name, address, and crest on downloads matter more to principals than the vendor logo.
- **Vendor line:** “Powered by PencilLabs” keeps product and company distinct without overpowering the school brand inside the app shell.

### Gaps to watch when pitching

1. **Name length** — Use **School Marks Analytics** in outreach and the first viewport; **Marks Analytics** is fine in tight chrome.
2. **Generic product stage** — The landing mock (“Final Exam · 2025-26”) is illustrative; for a live demo, prefer the seeded Greenfield campus or the prospect’s provisioned school.
3. **Trust links** — Privacy and pilot request must stay linked from the public footer before sending principals to the site.
4. **No open pricing** — Correct for test outreach; if a principal asks “what does it cost?”, use the leave-behind / conversation, not the disabled plans section.
5. **Design familiarity** — Cream + terracotta + serif is common in modern product marketing; differentiate in the meeting with **live pending-upload → approve → CML** proof, not the landing alone.

### Brand checklist before a campus visit

- [ ] Browser tab title and favicon show School Marks Analytics
- [ ] Landing hero shows the full product name + one tagline + Sign in / Request pilot
- [ ] Demo build has `VITE_ENABLE_DEMO_LOGIN` off unless it is an internal sandbox
- [ ] School profile logo/name set on the pilot campus before showing PDF/Excel outputs
- [ ] Pitch deck + leave-behind printed or attached (`docs/pitch/`)

## Go-live checklist (production host)

Operators must complete [SECURITY.md](../SECURITY.md) and:

- [ ] `DATABASE_URL` and strong `JWT_SECRET` (≥16 chars)
- [ ] `PLATFORM_ADMIN_PASSWORD` set; then `PLATFORM_ADMIN_PASSWORD_LOCKED=true`
- [ ] `VITE_ENABLE_DEMO_LOGIN` unset/`false` on the production build
- [ ] `CLIENT_ORIGIN` includes every real SPA origin (custom domains)
- [ ] Optional: `VITE_PILOT_CONTACT_EMAIL` for mailto pilots; else contact uses PencilLabs site
- [ ] Optional: `SMTP_*` for digests; otherwise accept outbox “skipped”
- [ ] Optional: `SENTRY_DSN` for error reporting
- [ ] Deep health `GET /api/health?deep=1` returns `db.ok: true` after migrate
- [ ] Platform admin can create the pilot school and principal without seed passwords
- [ ] Confirm lawful basis / consent for student marks & photos with the school

## Recommended pilot shape

**Duration:** 2–4 weeks  
**Scope:** one exam · one grade or section set  
**Success:** co-ordinator produces an **official** consolidated list without a spreadsheet merge  

Provision via **platform console** (do not re-enable public registration for the first cohort). Use `docs/pitch/principal-outreach-email.md` and `principal-leave-behind.md` for the approach.

## Intentionally deferred for v1 pilots

- Billing / entitlements enforcement
- Object storage / CDN for student photos
- Shared Redis cache across many instances
- Full public plans + self-serve registration GTM
