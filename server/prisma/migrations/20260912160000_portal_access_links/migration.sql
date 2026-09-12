CREATE TABLE IF NOT EXISTS "PortalAccessLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "studentIds" TEXT[],
    "examId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalAccessLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PortalAccessLink_tokenHash_key" ON "PortalAccessLink"("tokenHash");
CREATE INDEX IF NOT EXISTS "PortalAccessLink_createdById_idx" ON "PortalAccessLink"("createdById");
DO $$ BEGIN
  ALTER TABLE "PortalAccessLink" ADD CONSTRAINT "PortalAccessLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PortalAccessLink" ADD CONSTRAINT "PortalAccessLink_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
