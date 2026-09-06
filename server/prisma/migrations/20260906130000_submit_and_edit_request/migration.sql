-- AlterEnum
ALTER TYPE "MarkStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MarkEntryAccessKind" AS ENUM ('LATE_ENTRY', 'EDIT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "MarkEntryAccessRequest" ADD COLUMN IF NOT EXISTS "kind" "MarkEntryAccessKind" NOT NULL DEFAULT 'LATE_ENTRY';

-- DropIndex / recreate unique with kind
DROP INDEX IF EXISTS "MarkEntryAccessRequest_examId_teacherId_classSectionId_subj_key";
ALTER TABLE "MarkEntryAccessRequest" DROP CONSTRAINT IF EXISTS "MarkEntryAccessRequest_examId_teacherId_classSectionId_subjectId_key";
ALTER TABLE "MarkEntryAccessRequest" DROP CONSTRAINT IF EXISTS "MarkEntryAccessRequest_examId_teacherId_classSectionId_subj_key";

CREATE UNIQUE INDEX "MarkEntryAccessRequest_examId_teacherId_classSectionId_subj_kind_key"
  ON "MarkEntryAccessRequest"("examId", "teacherId", "classSectionId", "subjectId", "kind");

-- AlterEnum notifications
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EDIT_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EDIT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EDIT_REJECTED';
