-- Detailed school identity, address, and logo for letterheads
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "shortName" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "motto" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "logoBytes" BYTEA;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "logoMimeType" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "udiseCode" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "recognitionNo" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "establishedYear" INTEGER;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "principalName" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "pincode" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "SchoolProfile" ADD COLUMN IF NOT EXISTS "alternatePhone" TEXT;
