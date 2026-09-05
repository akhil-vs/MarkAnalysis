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
npm run dev
```

In another terminal:

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

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

## Consolidated mark lists

Once teachers have entered marks for an exam (and leadership has approved them), the exam coordinator or principal can generate the official **consolidated mark list** for a class.

Open **Mark lists** in the sidebar (or **Consolidated lists** from the school desk). Choose an exam and a class. The screen shows every student against every subject, with total, percent, grade, and rank. Classes are marked **Ready** when every subject register is fully approved.

Download **Excel** or **PDF**. Incomplete classes can still be previewed; missing or draft papers appear as blanks. Approve remaining registers on the mark register before treating the file as official.

# MarkAnalysis
