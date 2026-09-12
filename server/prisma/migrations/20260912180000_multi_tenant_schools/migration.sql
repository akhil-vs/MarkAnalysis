-- CreateEnum
CREATE TYPE "SchoolStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "School" (
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
);

CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");
CREATE UNIQUE INDEX "School_joinCode_key" ON "School"("joinCode");

-- Seed the first tenant from the legacy singleton profile (or a placeholder).
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
LIMIT 1;

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
WHERE NOT EXISTS (SELECT 1 FROM "School");

-- Add nullable tenant columns, then backfill from the migrated school.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ClassSection" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "StudentSubjectEnrollment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "TeacherAssignment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PortalAccessLink" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MarkEntryAccessRequest" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "MarkAudit" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ActivityAudit" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Period" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "TimetableEntry" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "User" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "ClassSection" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "Subject" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "StudentSubjectEnrollment" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "TeacherAssignment" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "Student" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "PortalAccessLink" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "Exam" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "MarkEntryAccessRequest" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "Mark" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "MarkAudit" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "ActivityAudit" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "Notification" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "Period" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "TimetableEntry" SET "tenantId" = (SELECT "id" FROM "School" ORDER BY "createdAt" ASC LIMIT 1) WHERE "tenantId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ClassSection" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Subject" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "StudentSubjectEnrollment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "TeacherAssignment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Student" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PortalAccessLink" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Exam" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MarkEntryAccessRequest" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Mark" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MarkAudit" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ActivityAudit" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Period" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "TimetableEntry" ALTER COLUMN "tenantId" SET NOT NULL;

-- Replace global uniqueness with per-school uniqueness.
DROP INDEX IF EXISTS "User_schoolId_key";
DROP INDEX IF EXISTS "ClassSection_className_section_key";
DROP INDEX IF EXISTS "Subject_name_className_key";
DROP INDEX IF EXISTS "Period_sortOrder_key";

CREATE UNIQUE INDEX "User_tenantId_schoolId_key" ON "User"("tenantId", "schoolId");
CREATE UNIQUE INDEX "ClassSection_tenantId_className_section_key" ON "ClassSection"("tenantId", "className", "section");
CREATE UNIQUE INDEX "Subject_tenantId_name_className_key" ON "Subject"("tenantId", "name", "className");
CREATE UNIQUE INDEX "Period_tenantId_sortOrder_key" ON "Period"("tenantId", "sortOrder");

CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX "ClassSection_tenantId_idx" ON "ClassSection"("tenantId");
CREATE INDEX "Subject_tenantId_idx" ON "Subject"("tenantId");
CREATE INDEX "StudentSubjectEnrollment_tenantId_idx" ON "StudentSubjectEnrollment"("tenantId");
CREATE INDEX "TeacherAssignment_tenantId_idx" ON "TeacherAssignment"("tenantId");
CREATE INDEX "Student_tenantId_idx" ON "Student"("tenantId");
CREATE INDEX "PortalAccessLink_tenantId_idx" ON "PortalAccessLink"("tenantId");
CREATE INDEX "Exam_tenantId_idx" ON "Exam"("tenantId");
CREATE INDEX "MarkEntryAccessRequest_tenantId_idx" ON "MarkEntryAccessRequest"("tenantId");
CREATE INDEX "Mark_tenantId_idx" ON "Mark"("tenantId");
CREATE INDEX "MarkAudit_tenantId_idx" ON "MarkAudit"("tenantId");
CREATE INDEX "ActivityAudit_tenantId_idx" ON "ActivityAudit"("tenantId");
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");
CREATE INDEX "Period_tenantId_idx" ON "Period"("tenantId");
CREATE INDEX "TimetableEntry_tenantId_idx" ON "TimetableEntry"("tenantId");

ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentSubjectEnrollment" ADD CONSTRAINT "StudentSubjectEnrollment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Student" ADD CONSTRAINT "Student_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalAccessLink" ADD CONSTRAINT "PortalAccessLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarkEntryAccessRequest" ADD CONSTRAINT "MarkEntryAccessRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarkAudit" ADD CONSTRAINT "MarkAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityAudit" ADD CONSTRAINT "ActivityAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Period" ADD CONSTRAINT "Period_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "SchoolProfile";
