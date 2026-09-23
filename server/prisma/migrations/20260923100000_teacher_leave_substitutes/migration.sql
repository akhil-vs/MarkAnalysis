-- Teacher leave overlay + dated substitutions (also applied via ensureTeacherLeaveSchema).

CREATE TABLE IF NOT EXISTS "TeacherLeave" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "leaveType" TEXT NOT NULL DEFAULT 'FULL_DAY',
  "periodIds" JSONB,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherLeave_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TeacherLeave_tenant_teacher_status_idx"
  ON "TeacherLeave" ("tenantId", "teacherId", "status");
CREATE INDEX IF NOT EXISTS "TeacherLeave_tenant_dates_idx"
  ON "TeacherLeave" ("tenantId", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "TeacherLeave_tenantId_idx"
  ON "TeacherLeave" ("tenantId");

CREATE TABLE IF NOT EXISTS "TimetableSubstitution" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "TimetableSub_slot_key"
  ON "TimetableSubstitution" ("tenantId", "date", "periodId", "classSectionId");
CREATE UNIQUE INDEX IF NOT EXISTS "TimetableSub_teacher_key"
  ON "TimetableSubstitution" ("tenantId", "date", "periodId", "substituteTeacherId");
CREATE INDEX IF NOT EXISTS "TimetableSub_date_idx"
  ON "TimetableSubstitution" ("tenantId", "date");
CREATE INDEX IF NOT EXISTS "TimetableSub_sub_idx"
  ON "TimetableSubstitution" ("tenantId", "substituteTeacherId", "date");
CREATE INDEX IF NOT EXISTS "TimetableSub_orig_idx"
  ON "TimetableSubstitution" ("tenantId", "originalTeacherId", "date");
CREATE INDEX IF NOT EXISTS "TimetableSub_tenant_idx"
  ON "TimetableSubstitution" ("tenantId");

DO $$ BEGIN
  ALTER TABLE "TeacherLeave" ADD CONSTRAINT "TeacherLeave_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TeacherLeave" ADD CONSTRAINT "TeacherLeave_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TeacherLeave" ADD CONSTRAINT "TeacherLeave_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "TeacherLeave"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_originalTeacherId_fkey" FOREIGN KEY ("originalTeacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_substituteTeacherId_fkey" FOREIGN KEY ("substituteTeacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSub_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TEACHER_LEAVE_CREATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TEACHER_LEAVE_REQUESTED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TEACHER_LEAVE_APPROVED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TEACHER_LEAVE_REJECTED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TEACHER_LEAVE_CANCELLED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSTITUTE_ASSIGNED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSTITUTE_REMOVED';
EXCEPTION WHEN others THEN NULL; END $$;
