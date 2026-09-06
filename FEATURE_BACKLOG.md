# Feature backlog — School Marks Analytics

Shipped in the implementation-order pass: absent/exempt/withheld codes, class-teacher read access, school profile on PDFs, student promotion with academic-year enrollments, principal password reset, and CI (unit tests + client build).

Remaining work that would make this suitable for a live school:

## Domain / school operations

- **Theory + practical / IA** split papers and weighted components
- **Weighted annual result** across unit / mid / final
- **Configurable grade bands** and pass percent (board-specific)
- **Electives / additional subjects** per student
- **Class-teacher inbox** for section pending papers (read access to the register is in; dedicated inbox is not)
- **Moderation / grace marks** with audit reason

## Product / access

- Mobile-friendly sidebar and mark entry
- Parent / student read-only portal
- Email digests for pending sign-ups, late entry, deadlines, approvals
- Force password change on first login; gate demo one-click accounts
- Server-side search/pagination for students, staff, and audit log
- Incomplete consolidated PDF watermark / hard block for official download

## Engineering

- Broader API/integration tests against a real database
- Production Docker Compose (`db` + `api` + `web`)
- Rate limiting on auth; httpOnly / refresh tokens
- Non-destructive seed path for demos
- Replace `xlsx` parse path with ExcelJS-only if supply-chain policy requires it
