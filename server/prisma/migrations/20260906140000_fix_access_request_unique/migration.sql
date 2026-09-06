-- Restore original unique key (one access request per register).
-- kind remains a normal column with default LATE_ENTRY.

DROP INDEX IF EXISTS "MarkEntryAccessRequest_examId_teacherId_classSectionId_subj_kind_key";
ALTER TABLE "MarkEntryAccessRequest" DROP CONSTRAINT IF EXISTS "MarkEntryAccessRequest_examId_teacherId_classSectionId_subjectId_kind_key";

DO $$ BEGIN
  CREATE UNIQUE INDEX "MarkEntryAccessRequest_examId_teacherId_classSectionId_subj_key"
    ON "MarkEntryAccessRequest"("examId", "teacherId", "classSectionId", "subjectId");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;
