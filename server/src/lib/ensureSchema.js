import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";

const TIMETABLE_MIGRATION = "20260908103000_teacher_timetable";
const TIMETABLE_CHECKSUM = "887d49c8c5a5a80c55657cc8aab9425c4fdcb9dd1f6fe6336a9508f3984f4549";

const NOTICES_MIGRATION = "20260908153000_teacher_staff_notices";
const NOTICES_CHECKSUM = "867d0ea42e804ae4b663581e5ea43311adf72b4b2f0fffde66c3446eaac8d93c";

const STAFF_NOTICE_TYPES = ["DEADLINE_REMINDER", "INCOMPLETE_MARKLIST", "STAFF_NOTICE"];

const ACTIVITY_MIGRATION = "20260909120000_activity_audit";
const ACTIVITY_CHECKSUM = "6c3703c1838115f588f2dbb9f05e394ff7829f1bd33ed762769ed841ea06a5e0";

const ACTIVITY_ACTIONS = [
  "MARK_CHANGED",
  "MARK_DELETED",
  "MARK_SUBMITTED",
  "MARK_APPROVED",
  "MARK_UNAPPROVED",
  "ACCESS_REQUESTED",
  "ACCESS_APPROVED",
  "ACCESS_REJECTED",
  "USER_CREATED",
  "USER_STATUS_CHANGED",
  "USER_ROLE_CHANGED",
  "USER_PASSWORD_RESET",
  "EXAM_CREATED",
  "EXAM_UPDATED",
  "EXAM_DELETED",
];

const ACTIVITY_STATEMENTS = [
  `DO $$ BEGIN
     CREATE TYPE "AuditAction" AS ENUM (${ACTIVITY_ACTIONS.map((a) => `'${a}'`).join(", ")});
   EXCEPTION
     WHEN duplicate_object THEN null;
   END $$;`,
  `CREATE TABLE IF NOT EXISTS "ActivityAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "examId" TEXT,
    "meta" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityAudit_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ActivityAudit_timestamp_idx" ON "ActivityAudit"("timestamp")`,
  `CREATE INDEX IF NOT EXISTS "ActivityAudit_actorId_timestamp_idx" ON "ActivityAudit"("actorId", "timestamp")`,
  `CREATE INDEX IF NOT EXISTS "ActivityAudit_examId_timestamp_idx" ON "ActivityAudit"("examId", "timestamp")`,
];

const ACTIVITY_FK_STATEMENTS = [
  `ALTER TABLE "ActivityAudit" ADD CONSTRAINT "ActivityAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
];

const CONSOLIDATION_MIGRATION = "20260909220000_consolidation_max_marks_lock";
const CONSOLIDATION_CHECKSUM =
  "9326a489183c900da2d4d4455fc2c40b5ddbf65be3228905b6b462c246a533e3";

const CONSOLIDATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "ConsolidationSettings" (
    "id" TEXT NOT NULL,
    "maxMarksLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConsolidationSettings_pkey" PRIMARY KEY ("id")
  )`,
];

const CONSOLIDATION_FK_STATEMENTS = [
  `ALTER TABLE "ConsolidationSettings" ADD CONSTRAINT "ConsolidationSettings_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
];

const SUBJECT_CONSOL_MAX_MIGRATION = "20260910083000_subject_consolidation_max_marks";
const SUBJECT_CONSOL_MAX_CHECKSUM =
  "22acbcb6f06bdea261bfac42cf34c485887a0e3bf0f7e9ac1334e0f3cbc48114";

const SUBJECT_CONSOL_MAX_STATEMENTS = [
  `ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "consolidationMaxMarks" INTEGER`,
  `UPDATE "Subject" SET "consolidationMaxMarks" = "maxMarks" WHERE "consolidationMaxMarks" IS NULL`,
  `ALTER TABLE "Subject" ALTER COLUMN "consolidationMaxMarks" SET NOT NULL`,
];

const SCHOOL_GRADING_MIGRATION = "20260910120000_school_grading_config";
const SCHOOL_GRADING_CHECKSUM =
  "7498ec62c90b828136b9050ef9e5bf2a215b21fec6e703b01ed71bca45c99576";

const SCHOOL_PROFILE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "SchoolProfile" (
    "id" TEXT NOT NULL DEFAULT 'school',
    "name" TEXT NOT NULL,
    "board" TEXT,
    "affiliationNo" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "passPercent" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "distinctionMin" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "gradeBands" JSONB,
    "examWeights" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolProfile_pkey" PRIMARY KEY ("id")
  )`,
];

const SCHOOL_GRADING_STATEMENTS = [
  `ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "passPercent" DOUBLE PRECISION NOT NULL DEFAULT 50`,
  `ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "distinctionMin" DOUBLE PRECISION NOT NULL DEFAULT 90`,
  `ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "gradeBands" JSONB`,
  `ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "examWeights" JSONB`,
];

const TIMETABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "Period" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "TimetableEntry" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "room" TEXT,
    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Period_sortOrder_key" ON "Period"("sortOrder")`,
  `CREATE INDEX IF NOT EXISTS "TimetableEntry_teacherId_dayOfWeek_idx" ON "TimetableEntry"("teacherId", "dayOfWeek")`,
  `CREATE INDEX IF NOT EXISTS "TimetableEntry_dayOfWeek_periodId_idx" ON "TimetableEntry"("dayOfWeek", "periodId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TimetableEntry_teacherId_dayOfWeek_periodId_classSectionId_key" ON "TimetableEntry"("teacherId", "dayOfWeek", "periodId", "classSectionId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TimetableEntry_classSectionId_dayOfWeek_periodId_key" ON "TimetableEntry"("classSectionId", "dayOfWeek", "periodId")`,
];

const MULTI_CLASS_PERIOD_MIGRATION = "20260910213800_timetable_multi_class_per_period";
const MULTI_CLASS_PERIOD_CHECKSUM =
  "1ac3b7c6d0931bea3831ca37c721f6f133b5fc2622f2450df6eb200e7cd9e6af";

const MULTI_CLASS_PERIOD_STATEMENTS = [
  `DROP INDEX IF EXISTS "TimetableEntry_teacherId_dayOfWeek_periodId_key"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TimetableEntry_teacherId_dayOfWeek_periodId_classSectionId_key" ON "TimetableEntry"("teacherId", "dayOfWeek", "periodId", "classSectionId")`,
];

const TIMETABLE_FK_STATEMENTS = [
  `ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
];

let ensurePromise = null;

function isAlreadyAppliedError(err) {
  const msg = String(err?.message || err);
  const code = err?.meta?.code || err?.code;
  return (
    /already exists/i.test(msg) ||
    code === "42P07" ||
    code === "42710" ||
    code === "42P16"
  );
}

async function tableExists(tableName) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname = ${tableName}
    ) AS "present"
  `;
  return Boolean(rows?.[0]?.present);
}

async function enumHasLabel(typeName, label) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = ${typeName}
        AND e.enumlabel = ${label}
    ) AS "present"
  `;
  return Boolean(rows?.[0]?.present);
}

async function recordMigration(migrationName, checksum) {
  try {
    const exists = await prisma.$queryRaw`
      SELECT 1 AS ok
      FROM "_prisma_migrations"
      WHERE migration_name = ${migrationName}
      LIMIT 1
    `;
    if (exists?.length) return;

    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (${randomUUID()}, ${checksum}, NOW(), ${migrationName}, NULL, NULL, NOW(), 1)
    `;
  } catch {
    // History table may be unavailable; schema ensure still succeeded.
  }
}

async function applyStatements(statements) {
  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (err) {
      if (isAlreadyAppliedError(err)) continue;
      throw err;
    }
  }
}

async function ensureTimetableTables() {
  const [hasPeriod, hasEntry] = await Promise.all([
    tableExists("Period"),
    tableExists("TimetableEntry"),
  ]);
  if (hasPeriod && hasEntry) {
    await recordMigration(TIMETABLE_MIGRATION, TIMETABLE_CHECKSUM);
    return;
  }

  await applyStatements(TIMETABLE_STATEMENTS);
  await applyStatements(TIMETABLE_FK_STATEMENTS);
  await recordMigration(TIMETABLE_MIGRATION, TIMETABLE_CHECKSUM);
}

async function indexExists(indexName) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'i'
        AND c.relname = ${indexName}
    ) AS "present"
  `;
  return Boolean(rows?.[0]?.present);
}

/** Drop one-class-per-teacher-period unique; allow multiple class sections per slot. */
async function ensureMultiClassPerPeriod() {
  const hasOld = await indexExists("TimetableEntry_teacherId_dayOfWeek_periodId_key");
  const hasNew = await indexExists("TimetableEntry_teacherId_dayOfWeek_periodId_classSectionId_key");
  if (!hasOld && hasNew) {
    await recordMigration(MULTI_CLASS_PERIOD_MIGRATION, MULTI_CLASS_PERIOD_CHECKSUM);
    return;
  }

  await applyStatements(MULTI_CLASS_PERIOD_STATEMENTS);
  await recordMigration(MULTI_CLASS_PERIOD_MIGRATION, MULTI_CLASS_PERIOD_CHECKSUM);
}

async function ensureActivityAuditTable() {
  const hasTable = await tableExists("ActivityAudit");
  if (hasTable) {
    const missing = [];
    for (const label of ACTIVITY_ACTIONS) {
      if (!(await enumHasLabel("AuditAction", label))) missing.push(label);
    }
    for (const label of missing) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS '${label}'`
        );
      } catch (err) {
        if (isAlreadyAppliedError(err)) continue;
        throw err;
      }
    }
    await recordMigration(ACTIVITY_MIGRATION, ACTIVITY_CHECKSUM);
    return;
  }

  await applyStatements(ACTIVITY_STATEMENTS);
  await applyStatements(ACTIVITY_FK_STATEMENTS);
  await recordMigration(ACTIVITY_MIGRATION, ACTIVITY_CHECKSUM);
}

async function ensureStaffNoticeEnum() {
  const missing = [];
  for (const label of STAFF_NOTICE_TYPES) {
    if (!(await enumHasLabel("NotificationType", label))) missing.push(label);
  }
  if (!missing.length) {
    await recordMigration(NOTICES_MIGRATION, NOTICES_CHECKSUM);
    return;
  }

  for (const label of missing) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS '${label}'`
      );
    } catch (err) {
      if (isAlreadyAppliedError(err)) continue;
      throw err;
    }
  }
  await recordMigration(NOTICES_MIGRATION, NOTICES_CHECKSUM);
}

async function columnExists(tableName, columnName) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "present"
  `;
  return Boolean(rows?.[0]?.present);
}

async function ensureConsolidationSettingsTable() {
  const hasTable = await tableExists("ConsolidationSettings");
  if (hasTable) {
    await recordMigration(CONSOLIDATION_MIGRATION, CONSOLIDATION_CHECKSUM);
    return;
  }

  await applyStatements(CONSOLIDATION_STATEMENTS);
  await applyStatements(CONSOLIDATION_FK_STATEMENTS);
  await recordMigration(CONSOLIDATION_MIGRATION, CONSOLIDATION_CHECKSUM);
}

async function ensureSubjectConsolidationMaxMarksColumn() {
  const hasColumn = await columnExists("Subject", "consolidationMaxMarks");
  if (hasColumn) {
    await recordMigration(SUBJECT_CONSOL_MAX_MIGRATION, SUBJECT_CONSOL_MAX_CHECKSUM);
    return;
  }

  await applyStatements(SUBJECT_CONSOL_MAX_STATEMENTS);
  await recordMigration(SUBJECT_CONSOL_MAX_MIGRATION, SUBJECT_CONSOL_MAX_CHECKSUM);
}

async function ensureSchoolGradingColumns() {
  const hasTable = await tableExists("SchoolProfile");
  if (!hasTable) {
    await applyStatements(SCHOOL_PROFILE_TABLE_STATEMENTS);
    await recordMigration(SCHOOL_GRADING_MIGRATION, SCHOOL_GRADING_CHECKSUM);
    return;
  }

  const needed = ["passPercent", "distinctionMin", "gradeBands", "examWeights"];
  const missing = [];
  for (const column of needed) {
    if (!(await columnExists("SchoolProfile", column))) missing.push(column);
  }
  if (!missing.length) {
    await recordMigration(SCHOOL_GRADING_MIGRATION, SCHOOL_GRADING_CHECKSUM);
    return;
  }

  await applyStatements(SCHOOL_GRADING_STATEMENTS);
  await recordMigration(SCHOOL_GRADING_MIGRATION, SCHOOL_GRADING_CHECKSUM);
}

/**
 * Apply schema pieces that may be missing in production when Vercel builds
 * cannot run `prisma migrate deploy` (DATABASE_URL often runtime-only).
 */
export async function ensurePendingSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      // Timetable table must exist before period uniqueness migrate.
      await ensureTimetableTables();
      await ensureMultiClassPerPeriod();
      // Remaining catch-ups are independent and can run together.
      await Promise.all([
        ensureStaffNoticeEnum(),
        ensureActivityAuditTable(),
        ensureConsolidationSettingsTable(),
        ensureSubjectConsolidationMaxMarksColumn(),
        ensureSchoolGradingColumns(),
      ]);
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

export const ensureTimetableSchema = ensurePendingSchema;
export const ensureNotificationSchema = ensurePendingSchema;
export const ensureActivityAuditSchema = ensurePendingSchema;
export const ensureConsolidationSchema = ensurePendingSchema;
export const ensureSchoolGradingSchema = ensurePendingSchema;

export const __test = {
  TIMETABLE_MIGRATION,
  TIMETABLE_CHECKSUM,
  NOTICES_MIGRATION,
  NOTICES_CHECKSUM,
  STAFF_NOTICE_TYPES,
  TIMETABLE_STATEMENTS,
  TIMETABLE_FK_STATEMENTS,
  ACTIVITY_MIGRATION,
  ACTIVITY_CHECKSUM,
  ACTIVITY_ACTIONS,
  ACTIVITY_STATEMENTS,
  ACTIVITY_FK_STATEMENTS,
  CONSOLIDATION_MIGRATION,
  CONSOLIDATION_CHECKSUM,
  CONSOLIDATION_STATEMENTS,
  CONSOLIDATION_FK_STATEMENTS,
  SUBJECT_CONSOL_MAX_MIGRATION,
  SUBJECT_CONSOL_MAX_CHECKSUM,
  SUBJECT_CONSOL_MAX_STATEMENTS,
  SCHOOL_GRADING_MIGRATION,
  SCHOOL_GRADING_CHECKSUM,
  SCHOOL_PROFILE_TABLE_STATEMENTS,
  SCHOOL_GRADING_STATEMENTS,
  MULTI_CLASS_PERIOD_MIGRATION,
  MULTI_CLASS_PERIOD_CHECKSUM,
  MULTI_CLASS_PERIOD_STATEMENTS,
};
