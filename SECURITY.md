# Security policy — School Marks Analytics

## Reporting

If you discover a vulnerability, email the repository maintainers privately. Do not open a public issue with exploit details.

## Hardening checklist (operators)

- [ ] Strong `JWT_SECRET` (≥16 random chars); never commit secrets
- [ ] `PLATFORM_ADMIN_PASSWORD` set + `PLATFORM_ADMIN_PASSWORD_LOCKED=true` in production
- [ ] `VITE_ENABLE_DEMO_LOGIN` unset/`false` on production builds
- [ ] `CLIENT_ORIGIN` includes every SPA origin that uses cookie auth
- [ ] `TRUST_PROXY` correct for your reverse proxy / Vercel
- [ ] CSP left enforced (default in production); only disable temporarily while debugging embeds
- [ ] `PILOT_NOTIFY_EMAIL` (or `VITE_PILOT_CONTACT_EMAIL`) so `/request-pilot` submissions can queue mail
- [ ] SMTP configured or accept that digests / pilot notify stay in `EmailOutbox` as skipped
- [ ] Platform backups stored encrypted; treat as sensitive even though photos/PII fields are omitted
- [ ] Optional: `SENTRY_DSN` for error reporting

## Known product posture

- Public self-serve plans/registration CTAs are **disabled** (`SHOW_PUBLIC_*` flags) — onboarding is invite / sales-led via `/request-pilot` and platform **School pilots** provision unless you re-enable them.
- Password policy requires ≥10 characters with a letter and a number.
- Rate limiting protects auth, registration, portal session, and public pilot-request endpoints.
