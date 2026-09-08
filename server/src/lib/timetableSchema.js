import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";

const MIGRATION_NAME = "20260908103000_teacher_timetable";
/** sha256 of server/prisma/migrations/20260908103000_teacher_timetable/migration.sql */
const MIGRATION_CHECKSUM = "887d49c8c5a5a80c55657cc8aab9425c4fdcb9dd1f6fe6336a9508f3984f4549";

const MIGRATION_STATEMENTS = [
  `CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "TimetableEntry" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "room" TEXT,
    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX "Period_sortOrder_key" ON "Period"("sortOrder")`,
  `CREATE INDEX "TimetableEntry_teacherId_dayOfWeek_idx" ON "TimetableEntry"("teacherId", "dayOfWeek")`,
  `CREATE INDEX "TimetableEntry_dayOfWeek_periodId_idx" ON "TimetableEntry"("dayOfWeek", "periodId")`,
  `CREATE UNIQUE INDEX "TimetableEntry_teacherId_dayOfWeek_periodId_key" ON "TimetableEntry"("teacherId", "dayOfWeek", "periodId")`,
  `CREATE UNIQUE INDEX "TimetableEntry_classSectionId_dayOfWeek_periodId_key" ON "TimetableEntry"("classSectionId", "dayOfWeek", "periodId")`,
  `ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
];

let ensurePromise = null;

async function tableExists(tableName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass($1) AS reg`,
    `public."${tableName}"`
  );
  return Boolean(rows?.[0]?.reg);
}

async function recordMigrationIfNeeded() {
  try {
    const exists = await prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1`,
      MIGRATION_NAME
    );
    if (exists?.length) return;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
      randomUUID(),
      MIGRATION_CHECKSUM,
      MIGRATION_NAME
    );
  } catch {
    // Migration history table may be unavailable; schema ensure still succeeded.
  }
}

function isAlreadyAppliedError(err) {
  const msg = String(err?.message || err);
  return (
    /already exists/i.test(msg) ||
    err?.code === "42P07" ||
    err?.code === "42710"
  );
}

/**
 * Production may be missing Period/TimetableEntry when migrate deploy
 * cannot run at Vercel build time (DATABASE_URL often runtime-only).
 * Apply that migration idempotently on first timetable request.
 */
export async function ensureTimetableSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const [hasPeriod, hasEntry] = await Promise.all([
        tableExists("Period"),
        tableExists("TimetableEntry"),
      ]);
      if (hasPeriod && hasEntry) {
        await recordMigrationIfNeeded();
        return;
      }

      for (const statement of MIGRATION_STATEMENTS) {
        try {
          await prisma.$executeRawUnsafe(statement);
        } catch (err) {
          if (isAlreadyAppliedError(err)) continue;
          throw err;
        }
      }

      await recordMigrationIfNeeded();
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

export const __test = { MIGRATION_NAME, MIGRATION_CHECKSUM, MIGRATION_STATEMENTS };
