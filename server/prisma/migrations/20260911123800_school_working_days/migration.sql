-- Working week (5 or 6 ISO weekdays) on school profile
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "workingDays" JSONB;
