# Feature backlog — School Marks Analytics

Gaps fixed in the professional polish pass are listed in the PR. Remaining work that would make this suitable for a live school:

## Domain / school operations

- **Absent / exempt / withheld** mark states (vs blank vs 0)
- **Theory + practical / IA** split papers and weighted components
- **Weighted annual result** across unit / mid / final
- **Configurable grade bands** and pass percent (board-specific)
- **Tied ranks** (1, 1, 3) instead of strict sort order
- **Student promotion / transfer** with academic-year snapshots
- **Electives / additional subjects** per student
- **School profile** (name, board, logo, affiliation) on report cards and consolidated PDFs
- **Class-teacher inbox** for section pending papers without full leadership rights
- **Moderation / grace marks** with audit reason

## Product / access

- Mobile-friendly sidebar and mark entry (card-per-student)
- Parent / student read-only portal
- Email digests for pending sign-ups, late entry, deadlines, approvals
- Principal-initiated password reset for staff
- Force password change on first login; gate demo one-click accounts
- Server-side search/pagination for students, staff, and audit log
- Incomplete consolidated PDF watermark / hard block for official download

## Engineering

- Automated tests (grades, ranks, consolidated ready, deadlines, RBAC)
- CI (lint + test) and production Docker Compose (`db` + `api` + `web`)
- Rate limiting on auth; httpOnly / refresh tokens
- Non-destructive seed path for demos
- Replace `xlsx` parse path with ExcelJS-only if supply-chain policy requires it
