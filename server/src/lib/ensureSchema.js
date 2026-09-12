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
        ensureSchoolWorkingDaysColumn(),
        ensureMustChangePasswordColumn(),
        ensureMarkAuditReasonColumn(),
        ensureElectiveEnrollments(),
        ensureRefreshTokenTable(),
        ensureTheoryPracticalColumns(),
        ensurePortalAccessLinkTable(),
      ]);
      // Exam ceilings backfill from Subject.consolidationMaxMarks and copy the
      // school-wide lock, so this must run after those catch-ups.
      await ensureExamConsolidationColumns();
      await ensureMultiTenantSchools();
      await ensureSchoolProfileDetailsColumns();
      await ensurePlatformAdminRole();
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
};
