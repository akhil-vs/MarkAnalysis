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

The Final Exam seed leaves Biology (all sections) and English 10-D empty so principals and coordinators can see pending teacher uploads.
