-- CreateTable
CREATE TABLE "ConsolidationSettings" (
    "id" TEXT NOT NULL,
    "maxMarksLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsolidationSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ConsolidationSettings" ADD CONSTRAINT "ConsolidationSettings_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
