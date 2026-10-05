# User manuals — School Marks Analytics

Role-based guides for day-to-day use of the School Marks Analytics platform.

| Role | Manual (Markdown) | PDF |
|---|---|---|
| **Principal** | [Principal user manual](./principal.md) | [`principal-user-manual.pdf`](../../client/public/help/principal-user-manual.pdf) |
| **Exam co-ordinator** | [Co-ordinator user manual](./coordinator.md) | [`coordinator-user-manual.pdf`](../../client/public/help/coordinator-user-manual.pdf) |
| **Teacher** | [Teacher user manual](./teacher.md) | [`teacher-user-manual.pdf`](../../client/public/help/teacher-user-manual.pdf) |
| **Parent / student portal** | [Portal guide](./portal.md) | (web guide — no PDF yet) |

In the app, **HELP → User manuals** shows **only the signed-in user’s own role PDF** (principals, co-ordinators, and teachers each get their guide). Platform admins can open every manual.

Regenerate PDFs after editing the Markdown guides:

```bash
npm run docs:pdf
```

## Who does what (at a glance)

| Task | Principal | Co-ordinator | Teacher |
|---|---|---|---|
| Enter / bulk-upload marks | — | Yes | Yes |
| Approve submitted registers | Yes | Yes | — |
| Manage staff & assignments | Yes (incl. co-ordinators & Role access) | Teachers & assignments | — |
| School profile & join code | Yes (join code rotate is principal-only) | Edit profile (not join code) | — |
| Records (classes, subjects, students, exams) | Yes | Yes | — |
| Consolidated mark lists | Yes | Yes | Class teachers only (own section, when complete) |
| School / subject / teacher analysis | Yes | Yes | Limited (own classes & students) |
| Timetables (accordion, daily board, hours) | Yes | Yes | View if Role access grants it, or via staff link |
| Leave (request / approve) & substitutes | Approve & assign cover | Approve & assign cover (default) | Request from **My leave** |
| Student photos | Any student | Any student | Assigned classes |
| Hall tickets | Create / edit / print | Create / edit / print | View / download own classes |
| Board ops & CPD (when enabled) | Yes | Yes | Own CPD record |
| Audit log (all staff) | Full | Teacher actions | — |

## Getting access

Default go-to-market is **invite-led** (public registration CTAs stay off):

1. **New school (pilot)** — submit **Request a school pilot** at `/request-pilot`, or ask PencilLabs / the platform operator to provision a campus. The principal receives a login and temporary password (change on first sign-in).
2. **Staff** — open `/signup`, enter the school’s **join code** (from **School profile → Modules & Security**), and wait for the principal (or leadership) to activate the account.
3. **Sign in** — use your email, school ID, and password. Enable MFA under **Profile** for stronger security.

Operators who re-enable public registration (`SHOW_PUBLIC_REGISTRATION`) can also use `/register-school` for self-serve campus creation. Parent / student access uses principal-issued portal links — see [Portal guide](./portal.md).

Passwords reset by leadership may require a change on the next login.
