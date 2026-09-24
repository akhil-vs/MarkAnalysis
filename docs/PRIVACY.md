# Privacy & data protection — School Marks Analytics

This platform stores **student and staff personal data** (names, emails, dates of birth, admission numbers, guardian contacts, photos, marks). Operators must treat it as regulated education / personal data.

## Roles and data

| Data | Who can see it | Notes |
|---|---|---|
| Staff accounts | Leadership / platform admin | Passwords stored as bcrypt hashes only |
| Student records & marks | Teachers (scoped), leadership | Class teachers get section-wide read access |
| Student photos | Staff with Student photos feature | Binary in DB; **omitted from platform backups** |
| Guardian email / address / phone | Staff (scoped) | **Omitted from platform backups** |
| Parent portal | Holder of issued link token | Read-only approved marks for linked students |

## Operator obligations

1. **Lawful basis / consent** — Confirm your board/school policy covers processing of student marks and photos before go-live (FERPA, GDPR, DPDP, or local equivalent).
2. **Retention** — Define how long marks, photos, and portal links are kept after a student leaves. Use platform school data delete tools for campus offboarding.
3. **Access** — Prefer least privilege via Staff → Role access; enable MFA for leadership.
4. **Exports** — Platform JSON backups omit passwords, MFA secrets, logos, student photos, and guardian contact fields. Store any downloaded backup encrypted at rest.
5. **Parent portal** — Issue time-limited links; revoke when no longer needed. Share links only with guardians.
6. **DSAR / deletion** — Leadership can remove school data categories via the platform console; coordinate legal review for individual student erasure requests.

## Application controls already in place

- Tenant isolation per school
- httpOnly session cookies + refresh rotation
- Optional TOTP MFA
- Activity / mark audit logs
- Official consolidated downloads blocked until registers are approved

This document is **not legal advice**. Engage counsel for production deployments that process minors’ data.
