# Feature backlog — School Marks Analytics

Shipped in the implementation-order pass: absent/exempt/withheld codes, class-teacher read access, school profile on PDFs, student promotion with academic-year enrollments, principal password reset, and CI (unit tests + client build).

Remaining work that would make this suitable for a live school:

## Domain / school operations

- **Theory + practical / IA** split papers and weighted components
- **Weighted annual result** across unit / mid / final
- **Configurable grade bands** and pass percent (board-specific)
- **Electives / additional subjects** per student
- ~~**Class-teacher inbox** for section pending papers~~ (read access + gated CML for class teachers; dedicated inbox still open)
- **Moderation / grace marks** with audit reason
+ ~~**Moderation / grace marks** with audit reason~~ (`POST /api/marks/moderate` + Marks Entry Moderate)
- ~~One-time consolidation max-marks lock for principal / exam coordinator~~ (Records → Exams → Lock for consolidation)
- ~~Teacher daily / weekly / monthly timetables for principal and exam coordinator~~ (Timetables nav + views + seed periods)
- ~~All-teachers daily board + find free teacher for a period~~ (leadership Timetables modes)
- ~~Configurable bell schedule (periods + timings) for principal and exam coordinator~~ (School profile → school day periods)
- ~~Configurable 5/6-day working week on school profile~~ (drives weekly timetable grids)

## Product / access

- ~~Mobile-friendly sidebar and mark entry~~ (app shell with hamburger drawer, responsive mark register)
- Parent / student read-only portal
- Email digests for pending sign-ups, late entry, deadlines, approvals
- ~~Force password change after admin reset; gate demo one-click accounts~~ (`mustChangePassword`, `VITE_ENABLE_DEMO_LOGIN`)
- ~~Server-side search/pagination for students, staff, and audit log~~
- Incomplete consolidated PDF watermark / hard block for official download

## Engineering

- Broader API/integration tests against a real database
- Production Docker Compose (`db` + `api` + `web`)
- ~~Rate limiting on auth~~ (in-memory limiter on login/signup; httpOnly / refresh tokens still open)
- Non-destructive seed path for demos
- Replace `xlsx` parse path with ExcelJS-only if supply-chain policy requires it
