-- Optional practical component alongside theory maxMarks / marksObtained.
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "practicalMaxMarks" INTEGER;
ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "practicalMarks" DOUBLE PRECISION;
