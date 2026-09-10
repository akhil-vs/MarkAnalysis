# School Marks Analytics Platform

Role-based marks upload and analytics for principals, exam coordinators, and teachers.

## Stack

- React + Vite + Tailwind CSS + Recharts
- Express REST API + Prisma
- PostgreSQL (Docker)
- JWT auth with RBAC

## Local setup

```bash
docker compose up -d
cd server
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run seed
npm test
npm run dev
```

In another terminal:

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Leadership can set the **school name and board** under **School profile** (used on report cards and consolidated lists). After a year, use **Records → Promote** to move a class to the next section without losing last year’s marks. On the mark register, type `AB`, `EX`, or `WH` for absent, exempt, or withheld. Class teachers can open their section’s full register (read-only for papers they do not teach).

## Seed logins

All seed passwords are `password123`. The login page also has one-click sign-in for every account.

| Role | Email | School ID |
|---|---|---|
| Principal | `principal@school.edu` | `SCH-P01` |
| Exam Coordinator | `coordinator@school.edu` | `SCH-C01` |
| Teacher · Mathematics | `anita.sharma@school.edu` | `SCH-T01` |
| Teacher · Physics | `rahul.mehta@school.edu` | `SCH-T02` |
| Teacher · Chemistry | `priya.nair@school.edu` | `SCH-T03` |
| Teacher · English | `david.thomas@school.edu` | `SCH-T04` |
| Teacher · Biology | `meera.iyer@school.edu` | `SCH-T05` |
| Teacher · Mathematics | `kiran.bose@school.edu` | `SCH-T06` |

The current Final Exam seed leaves Biology (all sections) and English 10-D empty so principals and coordinators can see pending teacher uploads. Teachers and leadership now default to the **same latest exam**. After a teacher saves marks they stay **draft** until a principal or coordinator clicks **Approve** on the mark register — only then do school analytics and consolidated lists include them.

Mathematics is split across two teachers (Anita Sharma: 9-A, 10-A, 10-B; Kiran Bose: 9-B, 10-C, 10-D) so same-subject teacher comparison has data. Seed exams cover academic years 2024-25 and 2025-26.

## Analysis

Leadership can review:

- **Class-wise** and **division-wise** results
- **Subject-wise** and whole-school analysis per subject
- **Teacher** registers and peer comparison
- **Previous-year** comparison for the same exam type
- **Same-subject** comparison when two or more teachers mark that paper

## Teacher timetables

Principals and exam coordinators can open **Timetables** in the sidebar (or **Timetable** from a staff row) to browse each teacher’s schedule.

- **Teachers** — card list of every active teacher, then open one for **Daily**, **Weekly**, or **Monthly** views
- **Daily board** — one page with every teacher’s timetable for a chosen day (subject, class, and free slots together)
- **Find free** — pick a date and period to see which teachers are free (and who is already teaching)
- **Periods** — edit the school bell schedule (names, start/end times, and breaks). Defaults are seeded only when the schedule is empty

Leadership can also add or remove teaching periods on a teacher’s timetable page.

Deployments generate the Prisma client on Vercel build. If the live database is behind on timetable or staff-notice migrations (common when `DATABASE_URL` is runtime-only), the API applies missing `Period` / `TimetableEntry` tables and `NotificationType` enum values on first Timetables or Notify-teachers request, and seeds a default bell schedule when periods are empty.

## Consolidated mark lists

Principal and exam coordinator set **Max marks** (mark entry) and **Max marks [consolidation]** under **Records → Subjects**, then **Lock for consolidation**. Consolidated totals and percentages use the consolidation ceiling; mark entry still validates against Max marks. Unlock consolidation ceilings only if a correction is needed.

Once teachers have entered marks for an exam and leadership has **approved** them, the exam coordinator or principal can generate the official **consolidated mark list** for a class. **Class teachers** can open and download the list for their own section only when every subject register for that class is fully approved.

Open **Consolidated lists** in the sidebar (or from the school desk / teacher desk). Choose an exam, then a class, then a division. The screen shows every student against every subject, with total, percent, grade, and rank. Divisions are marked **Ready** when every subject register is fully approved.

Download **Excel** or **PDF**. Leadership can still preview incomplete divisions; missing or draft papers appear as blanks. Class teachers do not see incomplete lists. Approve remaining registers on the mark register before treating the file as official.

## Notify teachers

Principals and exam coordinators can send in-app notices to teachers about **deadlines**, **incomplete marklists**, or a **custom message**. Teachers see them in the bell and on their dashboard, with a link into the relevant register.

- **Pending uploads** and the leadership dashboards: notify everyone still missing marks, or one teacher
- **Consolidated lists**: notify the teachers for an incomplete class
- **Records → Exams**: send a deadline reminder
- **Staff**: notify one teacher or all teachers

# MarkAnalysis
