# Privacy & data protection — School Marks Analytics

This platform stores **student and staff personal data** (names, emails, dates of birth, admission numbers, guardian contacts, photos, marks). Operators must treat it as regulated education / personal data.

## Roles and data

| Data | Who can see it | Notes |
|---|---|---|
| Staff accounts | Leadership / platform admin | Passwords stored as bcrypt hashes only |
| Student records & marks | Teachers (scoped), leadership | Class teachers get section-wide read access |
| Student photos | Staff with Student photos feature | Binary in DB (or filesystem keys when `BLOB_STORAGE=filesystem`); **omitted from platform backups** |
| Guardian email / phone / name, date of birth, admission number | Staff (scoped) | **Omitted from platform JSON backups**, along with marks and photos |
| Parent portal | Holder of issued link token | Read-only approved marks. Links expire within 90 days (30 by default) |
| School pilot requests | Platform admin | Contact name, email, phone, school details from `/request-pilot` |

## Operator obligations

1. **Lawful basis / consent** — Confirm your board/school policy covers processing of student marks and photos before go-live (FERPA, GDPR, DPDP, or local equivalent).
2. **Retention** — Principals set a leaver retention period on School profile. Left and transferred pupils are erased after 31 March of their academic year plus that many years. Campus offboarding remains on the platform console. Define how long unanswered **pilot requests** are retained.
3. **Access** — Prefer least privilege via Staff → Role access; enable MFA for leadership.
4. **Exports** — Platform JSON backups omit passwords, MFA secrets, logos, student photos, dates of birth, guardian contact, admission numbers, and marks. Merge-restore only updates school profile fields and exam paper schedules. Disaster recovery is a full `pg_dump`: the Compose `backup` service runs `scripts/pg-dump-backup.sh` on a schedule, and `scripts/pg-dump-restore-check.sh` proves a dump can be restored into a scratch database. Those dumps include marks, photos, guardian contacts, and password hashes. Keep the `backups` volume private and encrypted at rest. On managed Postgres, use the provider's point-in-time recovery instead.
5. **Parent portal** — Every issued link expires (default 30 days, maximum 90). Revoke when no longer needed. Share links only with guardians.
6. **DSAR / deletion** — Leadership can delete one pupil from the student register (marks, photo, and portal links go with the row) or erase due leavers from School profile. Campus-wide category delete remains on the platform console.
7. **Pilot enquiries** — Treat `/request-pilot` submissions as sales/contact data; only platform admins should access the **School pilots** inbox.

## Application controls already in place

- Tenant isolation per school
- httpOnly session cookies + refresh rotation
- Optional TOTP MFA
- Activity / mark audit logs
- Official consolidated downloads blocked until registers are approved

This document is **not legal advice**. Engage counsel for production deployments that process minors’ data.
