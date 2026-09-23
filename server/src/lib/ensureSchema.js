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
  "MARK_MODERATED",
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
  "SCHOOL_CREATED",
  "SCHOOL_UPDATED",
  "SCHOOL_STATUS_CHANGED",
  "SCHOOL_DATA_DELETED",
  "SCHOOL_DELETED",
  "USER_UPDATED",
  "USER_DELETED",
  "USER_ASSIGNMENTS_TRANSFERRED",
  "MFA_ENABLED",
  "MFA_DISABLED",
  "REPORT_CARD_PUBLISHED",
  "REPORT_CARD_SIGNED_OFF",
  "REVALUATION_REQUESTED",
  "REVALUATION_REVIEWED",
  "BOARD_PACK_CREATED",
  "PARENT_NOTIFIED",
  "BACKUP_CREATED",
  "BACKUP_RESTORED",
  "CPD_UPDATED",
  "HALL_TICKET_CREATED",
  "HALL_TICKET_UPDATED",
  "HALL_TICKET_DELETED",
  "TEACHER_LEAVE_CREATED",
  "TEACHER_LEAVE_REQUESTED",
  "TEACHER_LEAVE_APPROVED",
  "TEACHER_LEAVE_REJECTED",
  "TEACHER_LEAVE_CANCELLED",
  "SUBSTITUTE_ASSIGNED",
  "SUBSTITUTE_REMOVED",
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

const EXAM_CONSOL_MAX_MIGRATION = "20260911213500_exam_consolidation_max_marks";
const EXAM_CONSOL_MAX_CHECKSUM =
  "d4a2a99f4bebe1af7eb65cafd97f5a6e3f71a3ae6f6ff10529ace237676dfa5d";

const EXAM_CONSOL_MAX_STATEMENTS = [
  `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "consolidationMaxMarks" INTEGER`,
  `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "consolidationLocked" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "consolidationLockedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "consolidationLockedById" TEXT`,
  `UPDATE "Exam"
SET "consolidationMaxMarks" = COALESCE(
  (
    SELECT s."consolidationMaxMarks"
    FROM "Subject" s
    WHERE s."consolidationMaxMarks" IS NOT NULL
    GROUP BY s."consolidationMaxMarks"
    ORDER BY COUNT(*) DESC, s."consolidationMaxMarks" DESC
    LIMIT 1
  ),
  100
)
WHERE "consolidationMaxMarks" IS NULL`,
  `ALTER TABLE "Exam" ALTER COLUMN "consolidationMaxMarks" SET NOT NULL`,
  `ALTER TABLE "Exam" ALTER COLUMN "consolidationMaxMarks" SET DEFAULT 100`,
  `DO $$ BEGIN
  IF to_regclass('public."ConsolidationSettings"') IS NOT NULL THEN
    UPDATE "Exam" e
    SET
      "consolidationLocked" = true,
      "consolidationLockedAt" = cs."lockedAt",
      "consolidationLockedById" = cs."lockedById"
    FROM "ConsolidationSettings" cs
    WHERE cs."maxMarksLocked" = true;
  END IF;
END $$`,
  `DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Subject' AND column_name = 'consolidationMaxMarks'
  ) THEN
    ALTER TABLE "Subject" ALTER COLUMN "consolidationMaxMarks" SET DEFAULT 100;
  END IF;
END $$`,
];

const EXAM_CONSOL_MAX_FK_STATEMENTS = [
  `ALTER TABLE "Exam" ADD CONSTRAINT "Exam_consolidationLockedById_fkey" FOREIGN KEY ("consolidationLockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
];

const SCHOOL_GRADING_MIGRATION = "20260910120000_school_grading_config";
const SCHOOL_GRADING_CHECKSUM =
  "7498ec62c90b828136b9050ef9e5bf2a215b21fec6e703b01ed71bca45c99576";

const SCHOOL_WORKING_DAYS_MIGRATION = "20260911123800_school_working_days";
const SCHOOL_WORKING_DAYS_CHECKSUM =
  "a8341203fab7f373220d136b8077369d49ba1751052cadef0eafcd5cfe890728";

const SCHOOL_PROFILE_DETAILS_MIGRATION = "20260912190000_school_profile_details";
const SCHOOL_PROFILE_DETAILS_CHECKSUM =
  "512c8bc825a14ccf4395aa57d781c8edcb90e0c28c8618cd881168da24eb1e98";

const MUST_CHANGE_PASSWORD_MIGRATION = "20260912090000_user_must_change_password";
const MUST_CHANGE_PASSWORD_CHECKSUM =
  "cde357849187ab04a5b7d0d174f5d74c14d52bfc306ee6715c7890351c42ed52";

const MUST_CHANGE_PASSWORD_STATEMENTS = [
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false`,
];

const SCHOOL_PROFILE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "SchoolProfile" (
    "id" TEXT NOT NULL DEFAULT 'school',
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "motto" TEXT,
    "logoBytes" BYTEA,
    "logoMimeType" TEXT,
    "board" TEXT,
    "affiliationNo" TEXT,
    "udiseCode" TEXT,
    "recognitionNo" TEXT,
    "establishedYear" INTEGER,
    "principalName" TEXT,
    "address" TEXT,
    "city" TEXT,
    "district" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "phone" TEXT,
    "alternatePhone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "passPercent" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "distinctionMin" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "gradeBands" JSONB,
    "examWeights" JSONB,
    "workingDays" JSONB,
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

const SCHOOL_WORKING_DAYS_STATEMENTS = [
  `ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "workingDays" JSONB`,
];

const SCHOOL_PROFILE_DETAILS_STATEMENTS = [
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "shortName" TEXT`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "motto" TEXT`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "logoBytes" BYTEA`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "logoMimeType" TEXT`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "udiseCode" TEXT`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "recognitionNo" TEXT`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "establishedYear" INTEGER`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "principalName" TEXT`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "city" TEXT`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "district" TEXT`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "state" TEXT`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "pincode" TEXT`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "website" TEXT`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "alternatePhone" TEXT`,
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

/** One round-trip: which enum labels are still missing. */
async function missingEnumLabels(typeName, labels) {
  if (!labels.length) return [];
  const rows = await prisma.$queryRaw`
    SELECT e.enumlabel AS "label"
    FROM pg_catalog.pg_enum e
    JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = ${typeName}
      AND e.enumlabel = ANY(${labels})
  `;
  const present = new Set((rows || []).map((r) => r.label));
  return labels.filter((label) => !present.has(label));
}

async function ensureActivityAuditTable() {
  const hasTable = await tableExists("ActivityAudit");
  if (hasTable) {
    const missing = await missingEnumLabels("AuditAction", ACTIVITY_ACTIONS);
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
  const missing = await missingEnumLabels("NotificationType", STAFF_NOTICE_TYPES);
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

async function ensureExamConsolidationColumns() {
  const hasCeil = await columnExists("Exam", "consolidationMaxMarks");
  const hasLocked = await columnExists("Exam", "consolidationLocked");
  if (hasCeil && hasLocked) {
    if (await columnExists("Subject", "consolidationMaxMarks")) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Subject" ALTER COLUMN "consolidationMaxMarks" SET DEFAULT 100`
        );
      } catch {
        // Leftover column may already have a default, or the table may be gone.
      }
    }
    await recordMigration(EXAM_CONSOL_MAX_MIGRATION, EXAM_CONSOL_MAX_CHECKSUM);
    return;
  }

  await applyStatements(EXAM_CONSOL_MAX_STATEMENTS);
  await applyStatements(EXAM_CONSOL_MAX_FK_STATEMENTS);
  await recordMigration(EXAM_CONSOL_MAX_MIGRATION, EXAM_CONSOL_MAX_CHECKSUM);
}

async function ensureSchoolGradingColumns() {
  if (await tableExists("School")) {
    await recordMigration(SCHOOL_GRADING_MIGRATION, SCHOOL_GRADING_CHECKSUM);
    return;
  }

  const hasTable = await tableExists("SchoolProfile");
  if (!hasTable) {
    await applyStatements(SCHOOL_PROFILE_TABLE_STATEMENTS);
    await recordMigration(SCHOOL_GRADING_MIGRATION, SCHOOL_GRADING_CHECKSUM);
    await recordMigration(SCHOOL_WORKING_DAYS_MIGRATION, SCHOOL_WORKING_DAYS_CHECKSUM);
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

async function ensureSchoolWorkingDaysColumn() {
  if (await tableExists("School")) {
    await recordMigration(SCHOOL_WORKING_DAYS_MIGRATION, SCHOOL_WORKING_DAYS_CHECKSUM);
    return;
  }

  const hasTable = await tableExists("SchoolProfile");
  if (!hasTable) {
    await applyStatements(SCHOOL_PROFILE_TABLE_STATEMENTS);
    await recordMigration(SCHOOL_GRADING_MIGRATION, SCHOOL_GRADING_CHECKSUM);
    await recordMigration(SCHOOL_WORKING_DAYS_MIGRATION, SCHOOL_WORKING_DAYS_CHECKSUM);
    return;
  }

  if (await columnExists("SchoolProfile", "workingDays")) {
    await recordMigration(SCHOOL_WORKING_DAYS_MIGRATION, SCHOOL_WORKING_DAYS_CHECKSUM);
    return;
  }

  await applyStatements(SCHOOL_WORKING_DAYS_STATEMENTS);
  await recordMigration(SCHOOL_WORKING_DAYS_MIGRATION, SCHOOL_WORKING_DAYS_CHECKSUM);
}

async function ensureSchoolProfileDetailsColumns() {
  if (await tableExists("School")) {
    if (await columnExists("School", "logoMimeType")) {
      await recordMigration(SCHOOL_PROFILE_DETAILS_MIGRATION, SCHOOL_PROFILE_DETAILS_CHECKSUM);
      return;
    }
    await applyStatements(SCHOOL_PROFILE_DETAILS_STATEMENTS);
    await recordMigration(SCHOOL_PROFILE_DETAILS_MIGRATION, SCHOOL_PROFILE_DETAILS_CHECKSUM);
    return;
  }

  if (!(await tableExists("SchoolProfile"))) return;
  if (await columnExists("SchoolProfile", "logoMimeType")) {
    await recordMigration(SCHOOL_PROFILE_DETAILS_MIGRATION, SCHOOL_PROFILE_DETAILS_CHECKSUM);
    return;
  }
  await applyStatements(
    SCHOOL_PROFILE_DETAILS_STATEMENTS.map((s) => s.replaceAll('"School"', '"SchoolProfile"'))
  );
  await recordMigration(SCHOOL_PROFILE_DETAILS_MIGRATION, SCHOOL_PROFILE_DETAILS_CHECKSUM);
}

async function ensureMustChangePasswordColumn() {
  if (await columnExists("User", "mustChangePassword")) {
    await recordMigration(MUST_CHANGE_PASSWORD_MIGRATION, MUST_CHANGE_PASSWORD_CHECKSUM);
    return;
  }
  await applyStatements(MUST_CHANGE_PASSWORD_STATEMENTS);
  await recordMigration(MUST_CHANGE_PASSWORD_MIGRATION, MUST_CHANGE_PASSWORD_CHECKSUM);
}

const MARK_MODERATION_MIGRATION = "20260912093000_mark_moderation_reason";
const MARK_MODERATION_CHECKSUM =
  "800c54cd56cab0c8184af28b61465dec8aa3a191b5b328930761e6dd51e449cd";
const MARK_MODERATION_STATEMENTS = [
  `ALTER TABLE "MarkAudit" ADD COLUMN IF NOT EXISTS "reason" TEXT`,
  `DO $$ BEGIN
     ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MARK_MODERATED';
   EXCEPTION
     WHEN duplicate_object THEN null;
   END $$;`,
];

async function ensureMarkAuditReasonColumn() {
  if (await columnExists("MarkAudit", "reason")) {
    await recordMigration(MARK_MODERATION_MIGRATION, MARK_MODERATION_CHECKSUM);
    return;
  }
  await applyStatements(MARK_MODERATION_STATEMENTS);
  // Enum value is added by ensureActivityAuditTable from ACTIVITY_ACTIONS.
  await recordMigration(MARK_MODERATION_MIGRATION, MARK_MODERATION_CHECKSUM);
}

const ELECTIVE_MIGRATION = "20260912150000_elective_enrollments";
const ELECTIVE_CHECKSUM =
  "b279ae75c305c729d48e6c8b623b8f2c0d4bc7e824fcf1fcd921f8096c897f19";

const ELECTIVE_STATEMENTS = [
  `ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "isElective" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS "StudentSubjectEnrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentSubjectEnrollment_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StudentSubjectEnrollment_studentId_subjectId_key" ON "StudentSubjectEnrollment"("studentId", "subjectId")`,
  `CREATE INDEX IF NOT EXISTS "StudentSubjectEnrollment_subjectId_idx" ON "StudentSubjectEnrollment"("subjectId")`,
];

const ELECTIVE_FK_STATEMENTS = [
  `ALTER TABLE "StudentSubjectEnrollment" ADD CONSTRAINT "StudentSubjectEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "StudentSubjectEnrollment" ADD CONSTRAINT "StudentSubjectEnrollment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
];

async function ensureElectiveEnrollments() {
  const hasColumn = await columnExists("Subject", "isElective");
  const hasTable = await tableExists("StudentSubjectEnrollment");
  if (hasColumn && hasTable) {
    await recordMigration(ELECTIVE_MIGRATION, ELECTIVE_CHECKSUM);
    return;
  }

  await applyStatements(ELECTIVE_STATEMENTS);
  for (const sql of ELECTIVE_FK_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      if (!/already exists/i.test(String(err?.message || err))) throw err;
    }
  }
  await recordMigration(ELECTIVE_MIGRATION, ELECTIVE_CHECKSUM);
}

const REFRESH_TOKEN_MIGRATION = "20260912120000_refresh_tokens";
const REFRESH_TOKEN_CHECKSUM =
  "de0285fba40449e21f54ec788c497c51c99ecb74efe352c2e65883119c7d12fe";
const REFRESH_TOKEN_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash")`,
  `CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId")`,
  `CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt")`,
];
const REFRESH_TOKEN_FK_STATEMENTS = [
  `ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
];

async function ensureRefreshTokenTable() {
  if (await tableExists("RefreshToken")) {
    await recordMigration(REFRESH_TOKEN_MIGRATION, REFRESH_TOKEN_CHECKSUM);
    return;
  }
  await applyStatements(REFRESH_TOKEN_STATEMENTS);
  for (const sql of REFRESH_TOKEN_FK_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      if (!/already exists/i.test(String(err?.message || err))) throw err;
    }
  }
  await recordMigration(REFRESH_TOKEN_MIGRATION, REFRESH_TOKEN_CHECKSUM);
}

const THEORY_PRACTICAL_MIGRATION = "20260912140000_theory_practical_marks";
const THEORY_PRACTICAL_CHECKSUM =
  "9cf2f657e0d9615394beb76827c2cb170fd78d034d000fe0ecdf63f170c6c202";
const THEORY_PRACTICAL_STATEMENTS = [
  `ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "practicalMaxMarks" INTEGER`,
  `ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "practicalMarks" DOUBLE PRECISION`,
];

async function ensureTheoryPracticalColumns() {
  const hasPracticalMax = await columnExists("Subject", "practicalMaxMarks");
  const hasPracticalMarks = await columnExists("Mark", "practicalMarks");
  if (hasPracticalMax && hasPracticalMarks) {
    await recordMigration(THEORY_PRACTICAL_MIGRATION, THEORY_PRACTICAL_CHECKSUM);
    return;
  }
  await applyStatements(THEORY_PRACTICAL_STATEMENTS);
  await recordMigration(THEORY_PRACTICAL_MIGRATION, THEORY_PRACTICAL_CHECKSUM);
}


/**
 * Apply schema pieces that may be missing in production when Vercel builds
 * cannot run `prisma migrate deploy` (DATABASE_URL often runtime-only).
 */

const PORTAL_LINK_MIGRATION = "20260912160000_portal_access_links";
const PORTAL_LINK_CHECKSUM =
  "c0ffeeportalaccesslink000000000000000000000000000000000000000001";
const PORTAL_LINK_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "PortalAccessLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "studentIds" TEXT[],
    "examId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalAccessLink_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PortalAccessLink_tokenHash_key" ON "PortalAccessLink"("tokenHash")`,
  `CREATE INDEX IF NOT EXISTS "PortalAccessLink_createdById_idx" ON "PortalAccessLink"("createdById")`,
];
const PORTAL_LINK_FK_STATEMENTS = [
  `ALTER TABLE "PortalAccessLink" ADD CONSTRAINT "PortalAccessLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "PortalAccessLink" ADD CONSTRAINT "PortalAccessLink_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
];

async function ensurePortalAccessLinkTable() {
  if (await tableExists("PortalAccessLink")) {
    await recordMigration(PORTAL_LINK_MIGRATION, PORTAL_LINK_CHECKSUM);
    return;
  }
  await applyStatements(PORTAL_LINK_STATEMENTS);
  for (const sql of PORTAL_LINK_FK_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      if (!/already exists/i.test(String(err?.message || err))) throw err;
    }
  }
  await recordMigration(PORTAL_LINK_MIGRATION, PORTAL_LINK_CHECKSUM);
}

const TENANT_MIGRATION = "20260912180000_multi_tenant_schools";
const TENANT_CHECKSUM =
  "e901bb95e00c6440bdc3419d203a4be93db43bc80de3f6ace8d33ad630f9b03b";

const TENANT_TABLES = [
  "User",
  "ClassSection",
  "Subject",
  "StudentSubjectEnrollment",
  "TeacherAssignment",
  "Student",
  "PortalAccessLink",
  "Exam",
  "MarkEntryAccessRequest",
  "Mark",
  "MarkAudit",
  "ActivityAudit",
  "Notification",
  "Period",
  "TimetableEntry",
];

const TENANT_STATEMENTS = [
  `DO $$ BEGIN
     CREATE TYPE "SchoolStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
   EXCEPTION
     WHEN duplicate_object THEN null;
   END $$;`,
  `CREATE TABLE IF NOT EXISTS "School" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "board" TEXT,
    "affiliationNo" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" "SchoolStatus" NOT NULL DEFAULT 'ACTIVE',
    "passPercent" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "distinctionMin" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "gradeBands" JSONB,
    "examWeights" JSONB,
    "workingDays" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "School_slug_key" ON "School"("slug")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "School_joinCode_key" ON "School"("joinCode")`,
  ...TENANT_TABLES.map((table) => `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "tenantId" TEXT`),
];

async function ensureMultiTenantSchools() {
  const hasSchool = await tableExists("School");
  const hasTenantCol = await columnExists("User", "tenantId");
  if (hasSchool && hasTenantCol) {
    await recordMigration(TENANT_MIGRATION, TENANT_CHECKSUM);
    return;
  }

  await applyStatements(TENANT_STATEMENTS);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "School" (
      "id", "slug", "joinCode", "name", "board", "affiliationNo", "address", "phone", "email",
      "status", "passPercent", "distinctionMin", "gradeBands", "examWeights", "workingDays",
      "createdAt", "updatedAt"
    )
    SELECT
      'school',
      'greenfield-public-school',
      'DEMO-JOIN',
      COALESCE(sp."name", 'School Marks Analytics'),
      sp."board",
      sp."affiliationNo",
      sp."address",
      sp."phone",
      sp."email",
      'ACTIVE',
      COALESCE(sp."passPercent", 50),
      COALESCE(sp."distinctionMin", 90),
      sp."gradeBands",
      sp."examWeights",
      sp."workingDays",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM (SELECT 1) AS _seed
    LEFT JOIN "SchoolProfile" sp ON true
    WHERE NOT EXISTS (SELECT 1 FROM "School")
    LIMIT 1
  `).catch((err) => {
    if (!/does not exist|already exists/i.test(String(err?.message || err))) throw err;
  });

  await prisma.$executeRawUnsafe(`
    INSERT INTO "School" (
      "id", "slug", "joinCode", "name", "status", "passPercent", "distinctionMin", "createdAt", "updatedAt"
    )
    SELECT
      'school',
      'greenfield-public-school',
      'DEMO-JOIN',
      'School Marks Analytics',
      'ACTIVE',
      50,
      90,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    WHERE NOT EXISTS (SELECT 1 FROM "School")
  `);

  for (const table of TENANT_TABLES) {
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL`
    );
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "tenantId" SET NOT NULL`);
  }

  await applyStatements([
    `DROP INDEX IF EXISTS "User_schoolId_key"`,
    `DROP INDEX IF EXISTS "ClassSection_className_section_key"`,
    `DROP INDEX IF EXISTS "Subject_name_className_key"`,
    `DROP INDEX IF EXISTS "Period_sortOrder_key"`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_schoolId_key" ON "User"("tenantId", "schoolId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ClassSection_tenantId_className_section_key" ON "ClassSection"("tenantId", "className", "section")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Subject_tenantId_name_className_key" ON "Subject"("tenantId", "name", "className")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Period_tenantId_sortOrder_key" ON "Period"("tenantId", "sortOrder")`,
    ...TENANT_TABLES.map((table) => `CREATE INDEX IF NOT EXISTS "${table}_tenantId_idx" ON "${table}"("tenantId")`),
  ]);

  for (const table of TENANT_TABLES) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`
      );
    } catch (err) {
      if (!/already exists/i.test(String(err?.message || err))) throw err;
    }
  }

  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "SchoolProfile"`);
  await recordMigration(TENANT_MIGRATION, TENANT_CHECKSUM);
}

const PLATFORM_ADMIN_MIGRATION = "20260912200000_platform_admin";
const PLATFORM_ADMIN_CHECKSUM =
  "4a24ba363677feed496348aa9b467ba1335b64d14323b3799f8a28e7ff0dd8d4";

const PLATFORM_ADMIN_STATEMENTS = [
  `DO $$ BEGIN
     ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN';
   EXCEPTION
     WHEN duplicate_object THEN null;
   END $$;`,
  `DO $$ BEGIN
     ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHOOL_CREATED';
   EXCEPTION
     WHEN duplicate_object THEN null;
   END $$;`,
  `DO $$ BEGIN
     ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHOOL_UPDATED';
   EXCEPTION
     WHEN duplicate_object THEN null;
   END $$;`,
  `DO $$ BEGIN
     ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHOOL_STATUS_CHANGED';
   EXCEPTION
     WHEN duplicate_object THEN null;
   END $$;`,
  `ALTER TABLE "User" ALTER COLUMN "tenantId" DROP NOT NULL`,
];

async function columnIsNullable(tableName, columnName) {
  const rows = await prisma.$queryRaw`
    SELECT is_nullable AS "nullable"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
  `;
  return String(rows?.[0]?.nullable || "").toUpperCase() === "YES";
}

async function ensurePlatformAdminRole() {
  const hasRole = await enumHasLabel("Role", "PLATFORM_ADMIN");
  const tenantNullable = await columnIsNullable("User", "tenantId");
  if (hasRole && tenantNullable) {
    await recordMigration(PLATFORM_ADMIN_MIGRATION, PLATFORM_ADMIN_CHECKSUM);
    return;
  }

  await applyStatements(PLATFORM_ADMIN_STATEMENTS);
  await recordMigration(PLATFORM_ADMIN_MIGRATION, PLATFORM_ADMIN_CHECKSUM);
}

/** Migrations this catch-up owns — used to skip work when history is complete. */

const RATE_LIMIT_BUCKET_MIGRATION = "20260915120000_rate_limit_bucket";
const RATE_LIMIT_BUCKET_CHECKSUM = "rate-limit-bucket-v1";
const RATE_LIMIT_BUCKET_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
  )`,
  `CREATE INDEX IF NOT EXISTS "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt")`,
];

async function ensureRateLimitBucketTable() {
  try {
    if (await tableExists("RateLimitBucket")) {
      await recordMigration(RATE_LIMIT_BUCKET_MIGRATION, RATE_LIMIT_BUCKET_CHECKSUM);
      return;
    }
    await applyStatements(RATE_LIMIT_BUCKET_STATEMENTS);
    await recordMigration(RATE_LIMIT_BUCKET_MIGRATION, RATE_LIMIT_BUCKET_CHECKSUM);
  } catch (err) {
    // Without a DB pool (unit tests / misconfigured boot) auth can still use the memory limiter.
    console.warn("ensureRateLimitBucketTable skipped:", err?.message || err);
  }
}

const MFA_USER_MIGRATION = "20260914193000_user_mfa";
const MFA_USER_CHECKSUM = "user-mfa-totp-v1";
const MFA_USER_STATEMENTS = [
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaRecoveryHashes" JSONB`,
];

async function ensureMfaUserColumns() {
  // Do not swallow errors — a cached successful auth ensure with missing MFA
  // columns leaves every login on this isolate stuck on SCHEMA_DRIFT.
  const hasEnabled = await columnExists("User", "mfaEnabled");
  const hasSecret = await columnExists("User", "mfaSecret");
  const hasRecovery = await columnExists("User", "mfaRecoveryHashes");
  if (hasEnabled && hasSecret && hasRecovery) {
    await recordMigration(MFA_USER_MIGRATION, MFA_USER_CHECKSUM);
    return;
  }
  await applyStatements(MFA_USER_STATEMENTS);
  await recordMigration(MFA_USER_MIGRATION, MFA_USER_CHECKSUM);
}

/**
 * School digest columns are selected on full School reads during login.
 * Keep them on the auth hot path (not only background live-ops catch-up).
 */
async function ensureSchoolDigestColumns() {
  const hasEnabled = await columnExists("School", "emailDigestsEnabled");
  const hasEmail = await columnExists("School", "digestEmail");
  if (hasEnabled && hasEmail) return;
  await applyStatements(LIVE_OPS_SCHOOL_STATEMENTS);
}

const LIVE_OPS_STUDENT_STATEMENTS = [
  `ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "guardianEmail" TEXT`,
];

/**
 * Student.guardianEmail ships with board/CPD live-ops. Full Student includes
 * (coordinator analytics, /api/students) select it; missing column → SCHEMA_DRIFT
 * on Vercel ensure-only boots. Apply outside the swallowed live-ops try/catch.
 */
async function ensureStudentGuardianEmail() {
  if (await columnExists("Student", "guardianEmail")) return;
  await applyStatements(LIVE_OPS_STUDENT_STATEMENTS);
}

const LIVE_OPS_MIGRATION = "20260914191500_board_cpd_live_ops";
const LIVE_OPS_CHECKSUM = "board-cpd-live-ops-catchup-v2";

const LIVE_OPS_ENUM_LABELS = {
  ReportCardStatus: ["DRAFT", "PUBLISHED", "SIGNED_OFF"],
  RevaluationStatus: ["PENDING", "APPROVED", "REJECTED", "COMPLETED"],
  BoardPackStatus: ["PENDING", "READY", "FAILED"],
  CpdPlanStatus: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  EmailOutboxStatus: ["PENDING", "SENT", "FAILED", "SKIPPED"],
};

const LIVE_OPS_ENUM_CREATE = [
  `DO $$ BEGIN CREATE TYPE "ReportCardStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SIGNED_OFF'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "RevaluationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "BoardPackStatus" AS ENUM ('PENDING', 'READY', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "CpdPlanStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

const LIVE_OPS_SCHOOL_STATEMENTS = [
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "emailDigestsEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "digestEmail" TEXT`,
];

const LIVE_OPS_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "ExamPaperSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "className" TEXT,
    "paperDate" TIMESTAMPTZ NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "venue" TEXT,
    "maxMarks" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamPaperSchedule_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ExamPaperSchedule_examId_subjectId_className_key"
    ON "ExamPaperSchedule" ("examId", "subjectId", "className")`,
  `CREATE INDEX IF NOT EXISTS "ExamPaperSchedule_tenantId_examId_paperDate_idx"
    ON "ExamPaperSchedule" ("tenantId", "examId", "paperDate")`,
  `CREATE TABLE IF NOT EXISTS "ReportCardRelease" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "status" "ReportCardStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ,
    "signedOffAt" TIMESTAMPTZ,
    "signedOffById" TEXT,
    "parentsNotifiedAt" TIMESTAMPTZ,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportCardRelease_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ReportCardRelease_examId_classSectionId_key"
    ON "ReportCardRelease" ("examId", "classSectionId")`,
  `CREATE INDEX IF NOT EXISTS "ReportCardRelease_tenantId_status_idx"
    ON "ReportCardRelease" ("tenantId", "status")`,
  `CREATE TABLE IF NOT EXISTS "RevaluationRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" "RevaluationStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "reviewNotes" TEXT,
    "originalMarks" DOUBLE PRECISION,
    "revisedMarks" DOUBLE PRECISION,
    "feePaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RevaluationRequest_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "RevaluationRequest_examId_studentId_subjectId_key"
    ON "RevaluationRequest" ("examId", "studentId", "subjectId")`,
  `CREATE INDEX IF NOT EXISTS "RevaluationRequest_tenantId_status_idx"
    ON "RevaluationRequest" ("tenantId", "status")`,
  `CREATE TABLE IF NOT EXISTS "BoardPack" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "label" TEXT,
    "status" "BoardPackStatus" NOT NULL DEFAULT 'PENDING',
    "manifest" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMPTZ,
    "error" TEXT,
    CONSTRAINT "BoardPack_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "BoardPack_tenantId_examId_idx" ON "BoardPack" ("tenantId", "examId")`,
  `CREATE TABLE IF NOT EXISTS "CpdTrainingPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "academicYear" TEXT NOT NULL,
    "status" "CpdPlanStatus" NOT NULL DEFAULT 'PLANNED',
    "targetHours" DOUBLE PRECISION,
    "completedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CpdTrainingPlan_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CpdTrainingPlan_tenantId_teacherId_idx" ON "CpdTrainingPlan" ("tenantId", "teacherId")`,
  `CREATE INDEX IF NOT EXISTS "CpdTrainingPlan_tenantId_academicYear_idx" ON "CpdTrainingPlan" ("tenantId", "academicYear")`,
  `CREATE TABLE IF NOT EXISTS "CpdObservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "observerId" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ NOT NULL,
    "classLabel" TEXT,
    "subjectLabel" TEXT,
    "rating" INTEGER,
    "strengths" TEXT,
    "developmentAreas" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CpdObservation_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CpdObservation_tenantId_teacherId_idx" ON "CpdObservation" ("tenantId", "teacherId")`,
  `CREATE TABLE IF NOT EXISTS "CpdAppraisal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "appraiserId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "periodLabel" TEXT,
    "overallRating" INTEGER,
    "goalsMet" TEXT,
    "nextGoals" TEXT,
    "comments" TEXT,
    "signedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CpdAppraisal_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CpdAppraisal_teacherId_academicYear_periodLabel_key"
    ON "CpdAppraisal" ("teacherId", "academicYear", "periodLabel")`,
  `CREATE INDEX IF NOT EXISTS "CpdAppraisal_tenantId_academicYear_idx" ON "CpdAppraisal" ("tenantId", "academicYear")`,
  `CREATE TABLE IF NOT EXISTS "CpdCertificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "hours" DOUBLE PRECISION,
    "earnedAt" TIMESTAMPTZ NOT NULL,
    "expiresAt" TIMESTAMPTZ,
    "certificateNo" TEXT,
    "notes" TEXT,
    "issuedById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CpdCertificate_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CpdCertificate_tenantId_teacherId_idx" ON "CpdCertificate" ("tenantId", "teacherId")`,
  `CREATE TABLE IF NOT EXISTS "EmailOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "kind" TEXT NOT NULL,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "meta" JSONB,
    "error" TEXT,
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "EmailOutbox_status_createdAt_idx" ON "EmailOutbox" ("status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "EmailOutbox_tenantId_createdAt_idx" ON "EmailOutbox" ("tenantId", "createdAt")`,
];

const LIVE_OPS_FK_STATEMENTS = [
  `ALTER TABLE "ExamPaperSchedule" ADD CONSTRAINT "ExamPaperSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "ExamPaperSchedule" ADD CONSTRAINT "ExamPaperSchedule_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "ExamPaperSchedule" ADD CONSTRAINT "ExamPaperSchedule_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "ReportCardRelease" ADD CONSTRAINT "ReportCardRelease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "ReportCardRelease" ADD CONSTRAINT "ReportCardRelease_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "ReportCardRelease" ADD CONSTRAINT "ReportCardRelease_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "ReportCardRelease" ADD CONSTRAINT "ReportCardRelease_signedOffById_fkey" FOREIGN KEY ("signedOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "RevaluationRequest" ADD CONSTRAINT "RevaluationRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "RevaluationRequest" ADD CONSTRAINT "RevaluationRequest_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "RevaluationRequest" ADD CONSTRAINT "RevaluationRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "RevaluationRequest" ADD CONSTRAINT "RevaluationRequest_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "RevaluationRequest" ADD CONSTRAINT "RevaluationRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "RevaluationRequest" ADD CONSTRAINT "RevaluationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "BoardPack" ADD CONSTRAINT "BoardPack_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "BoardPack" ADD CONSTRAINT "BoardPack_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "BoardPack" ADD CONSTRAINT "BoardPack_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdTrainingPlan" ADD CONSTRAINT "CpdTrainingPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdTrainingPlan" ADD CONSTRAINT "CpdTrainingPlan_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdTrainingPlan" ADD CONSTRAINT "CpdTrainingPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdObservation" ADD CONSTRAINT "CpdObservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdObservation" ADD CONSTRAINT "CpdObservation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdObservation" ADD CONSTRAINT "CpdObservation_observerId_fkey" FOREIGN KEY ("observerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdAppraisal" ADD CONSTRAINT "CpdAppraisal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdAppraisal" ADD CONSTRAINT "CpdAppraisal_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdAppraisal" ADD CONSTRAINT "CpdAppraisal_appraiserId_fkey" FOREIGN KEY ("appraiserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdCertificate" ADD CONSTRAINT "CpdCertificate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdCertificate" ADD CONSTRAINT "CpdCertificate_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "CpdCertificate" ADD CONSTRAINT "CpdCertificate_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
];

async function ensureLiveOpsBoardCpdSchema() {
  try {
    await applyStatements(LIVE_OPS_ENUM_CREATE);
    for (const [typeName, labels] of Object.entries(LIVE_OPS_ENUM_LABELS)) {
      const missing = await missingEnumLabels(typeName, labels);
      for (const label of missing) {
        try {
          await prisma.$executeRawUnsafe(
            `ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS '${label}'`
          );
        } catch (err) {
          if (isAlreadyAppliedError(err)) continue;
          throw err;
        }
      }
    }
    // New audit actions for MFA / board / CPD / backup.
    const missingActions = await missingEnumLabels("AuditAction", ACTIVITY_ACTIONS);
    for (const label of missingActions) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS '${label}'`
        );
      } catch (err) {
        if (isAlreadyAppliedError(err)) continue;
        throw err;
      }
    }
    await applyStatements(LIVE_OPS_SCHOOL_STATEMENTS);
    await applyStatements(LIVE_OPS_STUDENT_STATEMENTS);
    await applyStatements(LIVE_OPS_TABLE_STATEMENTS);
    await applyStatements(LIVE_OPS_FK_STATEMENTS);
    await recordMigration(LIVE_OPS_MIGRATION, LIVE_OPS_CHECKSUM);
  } catch (err) {
    console.warn("ensureLiveOpsBoardCpdSchema skipped:", err?.message || err);
  }
}

const CUSTOM_STAFF_ROLES_MIGRATION = "20260914215900_custom_staff_roles";
const CUSTOM_STAFF_ROLES_CHECKSUM = "custom-staff-roles-catchup-v1";

const CUSTOM_STAFF_ROLES_STATEMENTS = [
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "customStaffRoles" JSONB`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roleTitle" TEXT`,
];

/**
 * School-defined staff role titles (Assigned Role dropdown).
 * Additive columns — safe to ensure even when migrations already recorded.
 */
async function ensureCustomStaffRolesColumns() {
  const hasSchool = await columnExists("School", "customStaffRoles");
  const hasUser = await columnExists("User", "roleTitle");
  if (hasSchool && hasUser) return;
  await applyStatements(CUSTOM_STAFF_ROLES_STATEMENTS);
  await recordMigration(CUSTOM_STAFF_ROLES_MIGRATION, CUSTOM_STAFF_ROLES_CHECKSUM);
}

const ROLE_FEATURE_ACCESS_MIGRATION = "20260915110000_role_feature_access";
const ROLE_FEATURE_ACCESS_CHECKSUM = "role-feature-access-catchup-v1";

const ROLE_FEATURE_ACCESS_STATEMENTS = [
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "roleFeatureAccess" JSONB`,
];

/** Principal-managed per-role feature toggles. */
async function ensureRoleFeatureAccessColumn() {
  const hasCol = await columnExists("School", "roleFeatureAccess");
  if (hasCol) return;
  await applyStatements(ROLE_FEATURE_ACCESS_STATEMENTS);
  await recordMigration(ROLE_FEATURE_ACCESS_MIGRATION, ROLE_FEATURE_ACCESS_CHECKSUM);
}

const OPTIONAL_MODULES_MIGRATION = "20260915120000_optional_modules";
const OPTIONAL_MODULES_CHECKSUM = "optional-modules-catchup-v1";

const OPTIONAL_MODULES_STATEMENTS = [
  `ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "optionalModules" JSONB`,
];

/** School-wide optional module visibility (Board ops, CPD). */
async function ensureOptionalModulesColumn() {
  const hasCol = await columnExists("School", "optionalModules");
  if (hasCol) return;
  await applyStatements(OPTIONAL_MODULES_STATEMENTS);
  await recordMigration(OPTIONAL_MODULES_MIGRATION, OPTIONAL_MODULES_CHECKSUM);
}

const HALL_TICKETS_MIGRATION = "20260916153100_hall_tickets";
const HALL_TICKETS_CHECKSUM = "hall-tickets-catchup-v1";

const HALL_TICKETS_STUDENT_STATEMENTS = [
  `ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "admissionNo" TEXT`,
  `ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "photoBytes" BYTEA`,
  `ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "photoMimeType" TEXT`,
];

const HALL_TICKETS_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "HallTicketIssue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "title" TEXT,
    "instructions" TEXT,
    "defaultVenue" TEXT,
    "examCentre" TEXT,
    "includePhoto" BOOLEAN NOT NULL DEFAULT true,
    "internalNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HallTicketIssue_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "HallTicketIssue_examId_classSectionId_key"
    ON "HallTicketIssue" ("examId", "classSectionId")`,
  `CREATE INDEX IF NOT EXISTS "HallTicketIssue_tenantId_examId_idx"
    ON "HallTicketIssue" ("tenantId", "examId")`,
  `CREATE INDEX IF NOT EXISTS "HallTicketIssue_classSectionId_idx"
    ON "HallTicketIssue" ("classSectionId")`,
  `CREATE INDEX IF NOT EXISTS "HallTicketIssue_createdById_idx"
    ON "HallTicketIssue" ("createdById")`,
  `CREATE INDEX IF NOT EXISTS "HallTicketIssue_updatedById_idx"
    ON "HallTicketIssue" ("updatedById")`,
];

const HALL_TICKETS_FK_STATEMENTS = [
  `ALTER TABLE "HallTicketIssue" ADD CONSTRAINT "HallTicketIssue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "HallTicketIssue" ADD CONSTRAINT "HallTicketIssue_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "HallTicketIssue" ADD CONSTRAINT "HallTicketIssue_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "HallTicketIssue" ADD CONSTRAINT "HallTicketIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "HallTicketIssue" ADD CONSTRAINT "HallTicketIssue_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
];

/**
 * Hall-ticket batches + student admission/photo columns.
 * Safe to call repeatedly; used by the hall-tickets API and ensurePendingSchema.
 */
export async function ensureHallTicketsSchema() {
  const hasTable = await tableExists("HallTicketIssue");
  const hasAdmission = await columnExists("Student", "admissionNo");
  const hasPhoto = await columnExists("Student", "photoBytes");
  if (hasTable && hasAdmission && hasPhoto) {
    const missingActions = await missingEnumLabels("AuditAction", [
      "HALL_TICKET_CREATED",
      "HALL_TICKET_UPDATED",
      "HALL_TICKET_DELETED",
    ]);
    if (missingActions.length) {
      for (const value of missingActions) {
        await applyStatements([
          `ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS '${value}'`,
        ]);
      }
    }
    return;
  }

  await applyStatements(HALL_TICKETS_STUDENT_STATEMENTS);
  await applyStatements(HALL_TICKETS_TABLE_STATEMENTS);
  for (const value of ["HALL_TICKET_CREATED", "HALL_TICKET_UPDATED", "HALL_TICKET_DELETED"]) {
    await applyStatements([`ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS '${value}'`]);
  }
  for (const stmt of HALL_TICKETS_FK_STATEMENTS) {
    try {
      await applyStatements([stmt]);
    } catch {
      // Constraint may already exist from a prior partial catch-up.
    }
  }
  await recordMigration(HALL_TICKETS_MIGRATION, HALL_TICKETS_CHECKSUM);
}

const SUBJECT_POOL_MIGRATION = "20260922003600_subject_pool";
const SUBJECT_POOL_CHECKSUM = "subject-pool-catchup-v1";

const SUBJECT_POOL_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "SubjectPoolItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxMarks" INTEGER NOT NULL,
    "isElective" BOOLEAN NOT NULL DEFAULT false,
    "practicalMaxMarks" INTEGER,
    CONSTRAINT "SubjectPoolItem_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SubjectPoolItem_tenantId_name_key"
    ON "SubjectPoolItem" ("tenantId", "name")`,
  `CREATE INDEX IF NOT EXISTS "SubjectPoolItem_tenantId_idx"
    ON "SubjectPoolItem" ("tenantId")`,
];

const SUBJECT_POOL_FK_STATEMENTS = [
  `ALTER TABLE "SubjectPoolItem" ADD CONSTRAINT "SubjectPoolItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
];

/**
 * School-wide subject pool (catalogue with marks) for class selection.
 * Safe to call repeatedly; used by subjects API and ensurePendingSchema.
 */
export async function ensureSubjectPoolSchema() {
  const hasTable = await tableExists("SubjectPoolItem");
  if (hasTable) {
    await recordMigration(SUBJECT_POOL_MIGRATION, SUBJECT_POOL_CHECKSUM);
    return;
  }

  await applyStatements(SUBJECT_POOL_TABLE_STATEMENTS);
  for (const stmt of SUBJECT_POOL_FK_STATEMENTS) {
    try {
      await applyStatements([stmt]);
    } catch {
      // Constraint may already exist from a prior partial catch-up.
    }
  }
  await recordMigration(SUBJECT_POOL_MIGRATION, SUBJECT_POOL_CHECKSUM);
}

const EXAM_INCLUDED_CLASSES_MIGRATION = "20260922014100_exam_included_classes";
const EXAM_INCLUDED_CLASSES_CHECKSUM = "exam-included-classes-catchup-v1";

const EXAM_INCLUDED_CLASSES_STATEMENTS = [
  `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "includedClassNames" JSONB`,
];

/**
 * Per-exam included class names (principal / coordinator scope for the schedule).
 * Safe to call repeatedly; used by exams API and ensurePendingSchema.
 */
export async function ensureExamIncludedClassesColumn() {
  const hasColumn = await columnExists("Exam", "includedClassNames");
  if (hasColumn) {
    await recordMigration(EXAM_INCLUDED_CLASSES_MIGRATION, EXAM_INCLUDED_CLASSES_CHECKSUM);
    return;
  }
  await applyStatements(EXAM_INCLUDED_CLASSES_STATEMENTS);
  await recordMigration(EXAM_INCLUDED_CLASSES_MIGRATION, EXAM_INCLUDED_CLASSES_CHECKSUM);
}

const TEACHER_LEAVE_MIGRATION = "20260922024500_teacher_leave_substitutes";
const TEACHER_LEAVE_CHECKSUM = "teacher-leave-substitutes-catchup-v1";

const TEACHER_LEAVE_AUDIT_ACTIONS = [
  "TEACHER_LEAVE_CREATED",
  "TEACHER_LEAVE_REQUESTED",
  "TEACHER_LEAVE_APPROVED",
  "TEACHER_LEAVE_REJECTED",
  "TEACHER_LEAVE_CANCELLED",
  "SUBSTITUTE_ASSIGNED",
  "SUBSTITUTE_REMOVED",
];

const TEACHER_LEAVE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "TeacherLeave" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL DEFAULT 'FULL_DAY',
    "periodIds" JSONB,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherLeave_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "TeacherLeave_tenant_teacher_status_idx"
    ON "TeacherLeave" ("tenantId", "teacherId", "status")`,
  `CREATE INDEX IF NOT EXISTS "TeacherLeave_tenant_dates_idx"
    ON "TeacherLeave" ("tenantId", "startDate", "endDate")`,
  `CREATE INDEX IF NOT EXISTS "TeacherLeave_tenantId_idx"
    ON "TeacherLeave" ("tenantId")`,
  `CREATE TABLE IF NOT EXISTS "TimetableSubstitution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaveId" TEXT,
    "date" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "originalTeacherId" TEXT NOT NULL,
    "substituteTeacherId" TEXT NOT NULL,
    "sourceTimetableEntryId" TEXT,
    "assignedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimetableSubstitution_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TimetableSub_slot_key"
    ON "TimetableSubstitution" ("tenantId", "date", "periodId", "classSectionId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TimetableSub_teacher_key"
    ON "TimetableSubstitution" ("tenantId", "date", "periodId", "substituteTeacherId")`,
  `CREATE INDEX IF NOT EXISTS "TimetableSub_date_idx"
    ON "TimetableSubstitution" ("tenantId", "date")`,
  `CREATE INDEX IF NOT EXISTS "TimetableSub_sub_idx"
    ON "TimetableSubstitution" ("tenantId", "substituteTeacherId", "date")`,
  `CREATE INDEX IF NOT EXISTS "TimetableSub_orig_idx"
    ON "TimetableSubstitution" ("tenantId", "originalTeacherId", "date")`,
  `CREATE INDEX IF NOT EXISTS "TimetableSub_tenant_idx"
    ON "TimetableSubstitution" ("tenantId")`,
];

const TEACHER_LEAVE_FK_STATEMENTS = [
  `ALTER TABLE "TeacherLeave" ADD CONSTRAINT "TeacherLeave_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TeacherLeave" ADD CONSTRAINT "TeacherLeave_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TeacherLeave" ADD CONSTRAINT "TeacherLeave_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "TeacherLeave"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_originalTeacherId_fkey" FOREIGN KEY ("originalTeacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_substituteTeacherId_fkey" FOREIGN KEY ("substituteTeacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
];

/**
 * Teacher leave overlay + dated substitutions for timetable cover.
 * Safe to call repeatedly; used by timetable API and ensurePendingSchema.
 */
export async function ensureTeacherLeaveSchema() {
  const hasLeave = await tableExists("TeacherLeave");
  const hasSub = await tableExists("TimetableSubstitution");
  if (hasLeave && hasSub) {
    const missingActions = await missingEnumLabels("AuditAction", TEACHER_LEAVE_AUDIT_ACTIONS);
    if (missingActions.length) {
      for (const value of missingActions) {
        await applyStatements([`ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS '${value}'`]);
      }
    }
    await recordMigration(TEACHER_LEAVE_MIGRATION, TEACHER_LEAVE_CHECKSUM);
    return;
  }

  await applyStatements(TEACHER_LEAVE_TABLE_STATEMENTS);
  for (const value of TEACHER_LEAVE_AUDIT_ACTIONS) {
    await applyStatements([`ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS '${value}'`]);
  }
  for (const stmt of TEACHER_LEAVE_FK_STATEMENTS) {
    try {
      await applyStatements([stmt]);
    } catch {
      // Constraint may already exist from a prior partial catch-up.
    }
  }
  await recordMigration(TEACHER_LEAVE_MIGRATION, TEACHER_LEAVE_CHECKSUM);
}

export const CATCHUP_MIGRATION_NAMES = [
  TIMETABLE_MIGRATION,
  MULTI_CLASS_PERIOD_MIGRATION,
  NOTICES_MIGRATION,
  ACTIVITY_MIGRATION,
  CONSOLIDATION_MIGRATION,
  SUBJECT_CONSOL_MAX_MIGRATION,
  EXAM_CONSOL_MAX_MIGRATION,
  SCHOOL_GRADING_MIGRATION,
  SCHOOL_WORKING_DAYS_MIGRATION,
  MUST_CHANGE_PASSWORD_MIGRATION,
  MARK_MODERATION_MIGRATION,
  ELECTIVE_MIGRATION,
  REFRESH_TOKEN_MIGRATION,
  RATE_LIMIT_BUCKET_MIGRATION,
  THEORY_PRACTICAL_MIGRATION,
  PORTAL_LINK_MIGRATION,
  TENANT_MIGRATION,
  MFA_USER_MIGRATION,
  LIVE_OPS_MIGRATION,
  SCHOOL_PROFILE_DETAILS_MIGRATION,
  PLATFORM_ADMIN_MIGRATION,
];

/** Subset required before login / refresh / me can safely query User + RefreshToken. */
export const AUTH_CATCHUP_MIGRATION_NAMES = [
  RATE_LIMIT_BUCKET_MIGRATION,
  MUST_CHANGE_PASSWORD_MIGRATION,
  REFRESH_TOKEN_MIGRATION,
  TENANT_MIGRATION,
  PLATFORM_ADMIN_MIGRATION,
  MFA_USER_MIGRATION,
];

async function catchupsAlreadyApplied(names = CATCHUP_MIGRATION_NAMES) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS "n"
      FROM "_prisma_migrations"
      WHERE "migration_name" = ANY(${names})
    `;
    return Number(rows?.[0]?.n || 0) >= names.length;
  } catch {
    return false;
  }
}

let authEnsurePromise = null;

/**
 * Auth-critical catch-up only (login / refresh / me).
 * Avoids logo, timetable, analytics, and other catch-ups that blow the Vercel
 * cold-start budget and turn sign-in into a 504.
 */
/** Clear the auth ensure memo so the next request can retry after SCHEMA_DRIFT. */
export function resetAuthSchemaEnsure() {
  authEnsurePromise = null;
}

export async function ensureAuthSchema() {
  if (!authEnsurePromise) {
    authEnsurePromise = (async () => {
      // Always ensure rate-limit + MFA + school digest columns — they may land after
      // older catchups were recorded. Login selects mfaEnabled and full School rows;
      // missing columns surface as SCHEMA_DRIFT on Vercel ensure-only boots.
      await ensureRateLimitBucketTable();
      await ensureMfaUserColumns();
      await ensureSchoolDigestColumns();
      // Session + staff edit load User.roleTitle and School.roleFeatureAccess. Keep these
      // on the auth path so a failed/empty migrate (or lagging ensurePendingSchema) cannot
      // turn login, /me, or PATCH /api/users into SCHEMA_DRIFT.
      await ensureCustomStaffRolesColumns();
      await ensureRoleFeatureAccessColumn();
      await ensureOptionalModulesColumn();
      if (await catchupsAlreadyApplied(AUTH_CATCHUP_MIGRATION_NAMES)) return;
      await Promise.all([ensureMustChangePasswordColumn(), ensureRefreshTokenTable()]);
      await ensureMultiTenantSchools();
      await ensurePlatformAdminRole();
    })().catch((err) => {
      authEnsurePromise = null;
      throw err;
    });
  }
  return authEnsurePromise;
}

export async function ensurePendingSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (await catchupsAlreadyApplied()) {
        // Still apply MFA / board / CPD catch-ups that shipped after the catchup list was frozen.
        await ensureAuthSchema();
        // guardianEmail before swallowed live-ops — coordinator desk selects full Student rows.
        await ensureStudentGuardianEmail();
        await ensureLiveOpsBoardCpdSchema();
        await ensureCustomStaffRolesColumns();
        await ensureRoleFeatureAccessColumn();
        await ensureOptionalModulesColumn();
        await ensureHallTicketsSchema();
        await ensureSubjectPoolSchema();
        await ensureExamIncludedClassesColumn();
        await ensureTeacherLeaveSchema();
        return { skipped: true, reason: "migrations-present" };
      }
      // Auth pieces first so concurrent login can finish while the rest runs.
      await ensureAuthSchema();
      await ensureStudentGuardianEmail();
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
        ensureSchoolWorkingDaysColumn(),
        ensureMarkAuditReasonColumn(),
        ensureElectiveEnrollments(),
        ensureTheoryPracticalColumns(),
        ensurePortalAccessLinkTable(),
        ensureLiveOpsBoardCpdSchema(),
        ensureCustomStaffRolesColumns(),
        ensureRoleFeatureAccessColumn(),
        ensureOptionalModulesColumn(),
        ensureHallTicketsSchema(),
        ensureSubjectPoolSchema(),
        ensureExamIncludedClassesColumn(),
        ensureTeacherLeaveSchema(),
      ]);
      // Exam ceilings backfill from Subject.consolidationMaxMarks and copy the
      // school-wide lock, so this must run after those catch-ups.
      await ensureExamConsolidationColumns();
      await ensureSchoolProfileDetailsColumns();
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
  CATCHUP_MIGRATION_NAMES,
  AUTH_CATCHUP_MIGRATION_NAMES,
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
  EXAM_CONSOL_MAX_MIGRATION,
  EXAM_CONSOL_MAX_CHECKSUM,
  EXAM_CONSOL_MAX_STATEMENTS,
  EXAM_CONSOL_MAX_FK_STATEMENTS,
  SCHOOL_GRADING_MIGRATION,
  SCHOOL_GRADING_CHECKSUM,
  SCHOOL_PROFILE_TABLE_STATEMENTS,
  SCHOOL_GRADING_STATEMENTS,
  SCHOOL_WORKING_DAYS_MIGRATION,
  SCHOOL_WORKING_DAYS_CHECKSUM,
  SCHOOL_WORKING_DAYS_STATEMENTS,
  SCHOOL_PROFILE_DETAILS_MIGRATION,
  SCHOOL_PROFILE_DETAILS_CHECKSUM,
  SCHOOL_PROFILE_DETAILS_STATEMENTS,
  MUST_CHANGE_PASSWORD_MIGRATION,
  MUST_CHANGE_PASSWORD_CHECKSUM,
  MUST_CHANGE_PASSWORD_STATEMENTS,
  MARK_MODERATION_MIGRATION,
  MARK_MODERATION_CHECKSUM,
  MARK_MODERATION_STATEMENTS,
  PORTAL_LINK_MIGRATION,
  PORTAL_LINK_CHECKSUM,
  PORTAL_LINK_STATEMENTS,
  REFRESH_TOKEN_MIGRATION,
  REFRESH_TOKEN_CHECKSUM,
  REFRESH_TOKEN_STATEMENTS,
  RATE_LIMIT_BUCKET_MIGRATION,
  RATE_LIMIT_BUCKET_CHECKSUM,
  RATE_LIMIT_BUCKET_STATEMENTS,
  THEORY_PRACTICAL_MIGRATION,
  THEORY_PRACTICAL_CHECKSUM,
  THEORY_PRACTICAL_STATEMENTS,
  MULTI_CLASS_PERIOD_MIGRATION,
  MULTI_CLASS_PERIOD_CHECKSUM,
  MULTI_CLASS_PERIOD_STATEMENTS,
  ELECTIVE_MIGRATION,
  ELECTIVE_CHECKSUM,
  ELECTIVE_STATEMENTS,
  ELECTIVE_FK_STATEMENTS,
  TENANT_MIGRATION,
  TENANT_CHECKSUM,
  TENANT_STATEMENTS,
  PLATFORM_ADMIN_MIGRATION,
  PLATFORM_ADMIN_CHECKSUM,
  PLATFORM_ADMIN_STATEMENTS,
  MFA_USER_MIGRATION,
  MFA_USER_CHECKSUM,
  MFA_USER_STATEMENTS,
  LIVE_OPS_MIGRATION,
  LIVE_OPS_CHECKSUM,
  LIVE_OPS_SCHOOL_STATEMENTS,
  LIVE_OPS_STUDENT_STATEMENTS,
  CUSTOM_STAFF_ROLES_MIGRATION,
  CUSTOM_STAFF_ROLES_CHECKSUM,
  CUSTOM_STAFF_ROLES_STATEMENTS,
  ROLE_FEATURE_ACCESS_MIGRATION,
  ROLE_FEATURE_ACCESS_CHECKSUM,
  ROLE_FEATURE_ACCESS_STATEMENTS,
  OPTIONAL_MODULES_MIGRATION,
  OPTIONAL_MODULES_CHECKSUM,
  OPTIONAL_MODULES_STATEMENTS,
  HALL_TICKETS_MIGRATION,
  HALL_TICKETS_CHECKSUM,
  HALL_TICKETS_STUDENT_STATEMENTS,
  HALL_TICKETS_TABLE_STATEMENTS,
  SUBJECT_POOL_MIGRATION,
  SUBJECT_POOL_CHECKSUM,
  SUBJECT_POOL_TABLE_STATEMENTS,
  ensureMfaUserColumns,
  ensureSchoolDigestColumns,
  ensureStudentGuardianEmail,
  ensureCustomStaffRolesColumns,
  ensureRoleFeatureAccessColumn,
  ensureOptionalModulesColumn,
  ensureHallTicketsSchema,
  ensureSubjectPoolSchema,
  ensureExamIncludedClassesColumn,
  EXAM_INCLUDED_CLASSES_MIGRATION,
  EXAM_INCLUDED_CLASSES_CHECKSUM,
  EXAM_INCLUDED_CLASSES_STATEMENTS,
  resetAuthSchemaEnsure,
};
