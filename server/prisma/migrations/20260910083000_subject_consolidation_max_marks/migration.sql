-- AlterTable
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "consolidationMaxMarks" INTEGER;

UPDATE "Subject"
SET "consolidationMaxMarks" = "maxMarks"
WHERE "consolidationMaxMarks" IS NULL;

ALTER TABLE "Subject" ALTER COLUMN "consolidationMaxMarks" SET NOT NULL;
