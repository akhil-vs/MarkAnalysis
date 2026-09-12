-- Platform console: multiple schools (tenants) + PLATFORM_ADMIN.

DO $$ BEGIN
  CREATE TYPE "SchoolStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHOOL_CREATED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHOOL_UPDATED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHOOL_STATUS_CHANGED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "status" "SchoolStatus";
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3);

INSERT INTO "SchoolProfile" ("id", "name", "slug", "status", "createdAt", "updatedAt")
SELECT 'school', 'School Marks Analytics', 'greenfield', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SchoolProfile");

UPDATE "SchoolProfile"
SET
  "slug" = COALESCE(NULLIF(BTRIM("slug"), ''), 'greenfield'),
  "status" = COALESCE("status", 'ACTIVE'),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP);

-- Unique slugs if a collision somehow exists
UPDATE "SchoolProfile" sp
SET "slug" = "slug" || '-' || SUBSTRING(sp."id", 1, 6)
WHERE sp."id" <> (
  SELECT sp2."id" FROM "SchoolProfile" sp2 WHERE sp2."slug" = sp."slug" ORDER BY sp2."createdAt" ASC LIMIT 1
);

ALTER TABLE "SchoolProfile" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "SchoolProfile" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "SchoolProfile" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER TABLE "SchoolProfile" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "SchoolProfile" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "SchoolProfile_slug_key" ON "SchoolProfile"("slug");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ClassSection" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Period" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "User"
SET "tenantId" = (SELECT "id" FROM "SchoolProfile" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "tenantId" IS NULL AND "role"::text <> 'PLATFORM_ADMIN';

UPDATE "ClassSection"
SET "tenantId" = (SELECT "id" FROM "SchoolProfile" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "tenantId" IS NULL;

UPDATE "Subject"
SET "tenantId" = (SELECT "id" FROM "SchoolProfile" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "tenantId" IS NULL;

UPDATE "Student"
SET "tenantId" = (SELECT "id" FROM "SchoolProfile" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "tenantId" IS NULL;

UPDATE "Exam"
SET "tenantId" = (SELECT "id" FROM "SchoolProfile" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "tenantId" IS NULL;

UPDATE "Period"
SET "tenantId" = (SELECT "id" FROM "SchoolProfile" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "tenantId" IS NULL;

ALTER TABLE "ClassSection" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Subject" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Student" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Exam" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Period" ALTER COLUMN "tenantId" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "SchoolProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "SchoolProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "Subject" ADD CONSTRAINT "Subject_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "SchoolProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "Student" ADD CONSTRAINT "Student_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "SchoolProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "Exam" ADD CONSTRAINT "Exam_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "SchoolProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "Period" ADD CONSTRAINT "Period_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "SchoolProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DROP INDEX IF EXISTS "ClassSection_className_section_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ClassSection_tenantId_className_section_key"
  ON "ClassSection"("tenantId", "className", "section");

DROP INDEX IF EXISTS "Subject_name_className_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Subject_tenantId_name_className_key"
  ON "Subject"("tenantId", "name", "className");

DROP INDEX IF EXISTS "Period_sortOrder_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Period_tenantId_sortOrder_key"
  ON "Period"("tenantId", "sortOrder");

CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX IF NOT EXISTS "ClassSection_tenantId_idx" ON "ClassSection"("tenantId");
CREATE INDEX IF NOT EXISTS "Subject_tenantId_idx" ON "Subject"("tenantId");
CREATE INDEX IF NOT EXISTS "Student_tenantId_idx" ON "Student"("tenantId");
CREATE INDEX IF NOT EXISTS "Exam_tenantId_idx" ON "Exam"("tenantId");
CREATE INDEX IF NOT EXISTS "Period_tenantId_idx" ON "Period"("tenantId");
