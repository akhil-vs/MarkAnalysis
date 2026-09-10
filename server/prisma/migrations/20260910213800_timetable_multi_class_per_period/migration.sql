-- Allow a teacher to teach multiple class sections in the same day/period.
-- Keep one-entry-per-class-section for a given day/period.

DROP INDEX IF EXISTS "TimetableEntry_teacherId_dayOfWeek_periodId_key";

CREATE UNIQUE INDEX "TimetableEntry_teacherId_dayOfWeek_periodId_classSectionId_key"
ON "TimetableEntry"("teacherId", "dayOfWeek", "periodId", "classSectionId");
