-- AlterEnum
ALTER TYPE "MarkStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MarkEntryAccessKind" AS ENUM ('LATE_ENTRY', 'EDIT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable: add kind; keep original unique (one request per register)
ALTER TABLE "MarkEntryAccessRequest" ADD COLUMN IF NOT EXISTS "kind" "MarkEntryAccessKind" NOT NULL DEFAULT 'LATE_ENTRY';

-- AlterEnum notifications
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EDIT_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EDIT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EDIT_REJECTED';
