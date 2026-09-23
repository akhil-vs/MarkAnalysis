-- Restore kind in the unique key so LATE_ENTRY and EDIT can coexist per register.

DROP INDEX IF EXISTS "MarkEntryAccessRequest_examId_teacherId_classSectionId_subj_key";
ALTER TABLE "MarkEntryAccessRequest" DROP CONSTRAINT IF EXISTS "MarkEntryAccessRequest_examId_teacherId_classSectionId_subjectId_key";

DO $$ BEGIN
  CREATE UNIQUE INDEX "MarkEntryAccessRequest_examId_teacherId_classSectionId_subj_kind_key"
    ON "MarkEntryAccessRequest"("examId", "teacherId", "classSectionId", "subjectId", "kind");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;
