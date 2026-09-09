-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
  'MARK_CHANGED',
  'MARK_DELETED',
  'MARK_SUBMITTED',
  'MARK_APPROVED',
  'MARK_UNAPPROVED',
  'ACCESS_REQUESTED',
  'ACCESS_APPROVED',
  'ACCESS_REJECTED',
  'USER_CREATED',
  'USER_STATUS_CHANGED',
  'USER_ROLE_CHANGED',
  'USER_PASSWORD_RESET',
  'EXAM_CREATED',
  'EXAM_UPDATED',
  'EXAM_DELETED'
);

-- CreateTable
CREATE TABLE "ActivityAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "examId" TEXT,
    "meta" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityAudit_timestamp_idx" ON "ActivityAudit"("timestamp");

-- CreateIndex
CREATE INDEX "ActivityAudit_actorId_timestamp_idx" ON "ActivityAudit"("actorId", "timestamp");

-- CreateIndex
CREATE INDEX "ActivityAudit_examId_timestamp_idx" ON "ActivityAudit"("examId", "timestamp");

-- AddForeignKey
ALTER TABLE "ActivityAudit" ADD CONSTRAINT "ActivityAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
