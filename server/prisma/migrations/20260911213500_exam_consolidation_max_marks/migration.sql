-- Move consolidation max marks from Subject (school-wide) to Exam (per exam).
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "consolidationMaxMarks" INTEGER;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "consolidationLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "consolidationLockedAt" TIMESTAMP(3);
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "consolidationLockedById" TEXT;

UPDATE "Exam"
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
WHERE "consolidationMaxMarks" IS NULL;

ALTER TABLE "Exam" ALTER COLUMN "consolidationMaxMarks" SET NOT NULL;
ALTER TABLE "Exam" ALTER COLUMN "consolidationMaxMarks" SET DEFAULT 100;

UPDATE "Exam" e
SET
  "consolidationLocked" = true,
  "consolidationLockedAt" = cs."lockedAt",
  "consolidationLockedById" = cs."lockedById"
FROM "ConsolidationSettings" cs
WHERE cs."maxMarksLocked" = true;

-- Leftover Subject.consolidationMaxMarks is unused; default lets Prisma omit it.
ALTER TABLE "Subject" ALTER COLUMN "consolidationMaxMarks" SET DEFAULT 100;

ALTER TABLE "Exam" ADD CONSTRAINT "Exam_consolidationLockedById_fkey" FOREIGN KEY ("consolidationLockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
