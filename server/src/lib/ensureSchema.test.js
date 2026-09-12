import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { __test } from "./ensureSchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "../../prisma/migrations");

describe("ensureSchema bootstrap", () => {
  it("embeds timetable statements matching the prisma migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260908103000_teacher_timetable/migration.sql")
    );
    assert.equal(__test.TIMETABLE_CHECKSUM, createHash("sha256").update(file).digest("hex"));
    assert.equal(__test.TIMETABLE_MIGRATION, "20260908103000_teacher_timetable");
    assert.ok(__test.TIMETABLE_STATEMENTS[0].includes('CREATE TABLE IF NOT EXISTS "Period"'));
    assert.ok(__test.TIMETABLE_STATEMENTS[1].includes('CREATE TABLE IF NOT EXISTS "TimetableEntry"'));
    assert.equal(__test.TIMETABLE_FK_STATEMENTS.length, 4);
  });

  it("tracks staff notice enum migration checksum and labels", () => {
    const file = readFileSync(
      join(migrationsDir, "20260908153000_teacher_staff_notices/migration.sql")
    );
    assert.equal(__test.NOTICES_CHECKSUM, createHash("sha256").update(file).digest("hex"));
    assert.equal(__test.NOTICES_MIGRATION, "20260908153000_teacher_staff_notices");
    assert.deepEqual(__test.STAFF_NOTICE_TYPES, [
      "DEADLINE_REMINDER",
      "INCOMPLETE_MARKLIST",
      "STAFF_NOTICE",
    ]);
  });

  it("embeds activity audit statements matching the prisma migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260909120000_activity_audit/migration.sql")
    );
    assert.equal(__test.ACTIVITY_CHECKSUM, createHash("sha256").update(file).digest("hex"));
    assert.equal(__test.ACTIVITY_MIGRATION, "20260909120000_activity_audit");
    assert.ok(__test.ACTIVITY_STATEMENTS[1].includes('CREATE TABLE IF NOT EXISTS "ActivityAudit"'));
    assert.equal(__test.ACTIVITY_FK_STATEMENTS.length, 1);
    assert.ok(__test.ACTIVITY_ACTIONS.includes("MARK_APPROVED"));
    assert.ok(__test.ACTIVITY_ACTIONS.includes("USER_STATUS_CHANGED"));
  });

  it("embeds consolidation settings migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260909220000_consolidation_max_marks_lock/migration.sql")
    );
    assert.equal(__test.CONSOLIDATION_CHECKSUM, createHash("sha256").update(file).digest("hex"));
    assert.equal(__test.CONSOLIDATION_MIGRATION, "20260909220000_consolidation_max_marks_lock");
    assert.ok(__test.CONSOLIDATION_STATEMENTS[0].includes('CREATE TABLE IF NOT EXISTS "ConsolidationSettings"'));
    assert.equal(__test.CONSOLIDATION_FK_STATEMENTS.length, 1);
  });

  it("embeds subject consolidationMaxMarks migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260910083000_subject_consolidation_max_marks/migration.sql")
    );
    assert.equal(__test.SUBJECT_CONSOL_MAX_CHECKSUM, createHash("sha256").update(file).digest("hex"));
    assert.equal(__test.SUBJECT_CONSOL_MAX_MIGRATION, "20260910083000_subject_consolidation_max_marks");
    assert.ok(__test.SUBJECT_CONSOL_MAX_STATEMENTS[0].includes("consolidationMaxMarks"));
  });

  it("embeds exam consolidationMaxMarks migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260911213500_exam_consolidation_max_marks/migration.sql")
    );
    assert.equal(__test.EXAM_CONSOL_MAX_CHECKSUM, createHash("sha256").update(file).digest("hex"));
    assert.equal(__test.EXAM_CONSOL_MAX_MIGRATION, "20260911213500_exam_consolidation_max_marks");
    assert.ok(__test.EXAM_CONSOL_MAX_STATEMENTS[0].includes('ALTER TABLE "Exam"'));
    assert.ok(__test.EXAM_CONSOL_MAX_STATEMENTS.some((s) => s.includes("consolidationMaxMarks")));
    assert.ok(__test.EXAM_CONSOL_MAX_FK_STATEMENTS[0].includes("Exam_consolidationLockedById_fkey"));
  });

  it("embeds school grading config migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260910120000_school_grading_config/migration.sql")
    );
    assert.equal(__test.SCHOOL_GRADING_CHECKSUM, createHash("sha256").update(file).digest("hex"));
    assert.equal(__test.SCHOOL_GRADING_MIGRATION, "20260910120000_school_grading_config");
    assert.ok(__test.SCHOOL_GRADING_STATEMENTS[0].includes("passPercent"));
    assert.ok(__test.SCHOOL_GRADING_STATEMENTS[1].includes("distinctionMin"));
    assert.ok(__test.SCHOOL_PROFILE_TABLE_STATEMENTS[0].includes('CREATE TABLE IF NOT EXISTS "SchoolProfile"'));
  });

  it("embeds school working days migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260911123800_school_working_days/migration.sql")
    );
    assert.equal(
      __test.SCHOOL_WORKING_DAYS_CHECKSUM,
      createHash("sha256").update(file).digest("hex")
    );
    assert.equal(__test.SCHOOL_WORKING_DAYS_MIGRATION, "20260911123800_school_working_days");
    assert.ok(__test.SCHOOL_WORKING_DAYS_STATEMENTS[0].includes("workingDays"));
    assert.ok(__test.SCHOOL_PROFILE_TABLE_STATEMENTS[0].includes("workingDays"));
  });

  it("embeds multi-class-per-period timetable migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260910213800_timetable_multi_class_per_period/migration.sql")
    );
    assert.equal(
      __test.MULTI_CLASS_PERIOD_CHECKSUM,
      createHash("sha256").update(file).digest("hex")
    );
    assert.equal(__test.MULTI_CLASS_PERIOD_MIGRATION, "20260910213800_timetable_multi_class_per_period");
    assert.ok(
      __test.MULTI_CLASS_PERIOD_STATEMENTS[0].includes(
        'DROP INDEX IF EXISTS "TimetableEntry_teacherId_dayOfWeek_periodId_key"'
      )
    );
    assert.ok(
      __test.MULTI_CLASS_PERIOD_STATEMENTS[1].includes(
        "TimetableEntry_teacherId_dayOfWeek_periodId_classSectionId_key"
      )
    );
    assert.ok(
      __test.TIMETABLE_STATEMENTS.some((s) =>
        s.includes("TimetableEntry_teacherId_dayOfWeek_periodId_classSectionId_key")
      )
    );
  });

  it("embeds mustChangePassword user column migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260912090000_user_must_change_password/migration.sql")
    );
    assert.equal(
      __test.MUST_CHANGE_PASSWORD_CHECKSUM,
      createHash("sha256").update(file).digest("hex")
    );
    assert.equal(__test.MUST_CHANGE_PASSWORD_MIGRATION, "20260912090000_user_must_change_password");
    assert.ok(__test.MUST_CHANGE_PASSWORD_STATEMENTS[0].includes('"mustChangePassword"'));
  });

  it("embeds elective enrollment migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260912150000_elective_enrollments/migration.sql")
    );
    assert.equal(
      __test.ELECTIVE_CHECKSUM,
      createHash("sha256").update(file).digest("hex")
    );
    assert.equal(__test.ELECTIVE_MIGRATION, "20260912150000_elective_enrollments");
    assert.ok(__test.ELECTIVE_STATEMENTS[0].includes('"isElective"'));
    assert.ok(
      __test.ELECTIVE_STATEMENTS.some((s) =>
        s.includes('CREATE TABLE IF NOT EXISTS "StudentSubjectEnrollment"')
      )
    );
    assert.equal(__test.ELECTIVE_FK_STATEMENTS.length, 2);
  });

  it("embeds multi-tenant school migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260912180000_multi_tenant_schools/migration.sql")
    );
    assert.equal(__test.TENANT_CHECKSUM, createHash("sha256").update(file).digest("hex"));
    assert.equal(__test.TENANT_MIGRATION, "20260912180000_multi_tenant_schools");
    assert.ok(__test.TENANT_STATEMENTS.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "School"')));
    assert.ok(__test.TENANT_STATEMENTS.some((s) => s.includes('"joinCode"')));
  });
});
