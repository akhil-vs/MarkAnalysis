-- AlterEnum
ALTER TYPE "MarkStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MarkEntryAccessKind" AS ENUM ('LATE_ENTRY', 'EDIT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable: add kind without changing the existing unique key
ALTER TABLE "MarkEntryAccessRequest" ADD COLUMN IF NOT EXISTS "kind" "MarkEntryAccessKind" NOT NULL DEFAULT 'LATE_ENTRY';

-- If a previous attempt already replaced the unique index to include kind, restore the original unique.
DROP INDEX IF EXISTS "MarkEntryAccessRequest_examId_teacherId_classSectionId_subj_kind_key";

DO $$ BEGIN
  CREATE UNIQUE INDEX "MarkEntryAccessRequest_examId_teacherId_classSectionId_subj_key"
    ON "MarkEntryAccessRequest"("examId", "teacherId", "classSectionId", "subjectId");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;

-- AlterEnum notifications
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EDIT_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EDIT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EDIT_REJECTED';
