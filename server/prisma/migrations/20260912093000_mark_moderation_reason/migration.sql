-- Grace / moderation adjustments carry an audit reason.
ALTER TABLE "MarkAudit" ADD COLUMN IF NOT EXISTS "reason" TEXT;

DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MARK_MODERATED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
