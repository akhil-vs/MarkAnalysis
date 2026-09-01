-- CreateEnum
CREATE TYPE "MarkEntryAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "marksEntryDeadline" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MarkEntryAccessRequest" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" "MarkEntryAccessStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "MarkEntryAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarkEntryAccessRequest_examId_teacherId_classSectionId_subj_key" ON "MarkEntryAccessRequest"("examId", "teacherId", "classSectionId", "subjectId");

-- AddForeignKey
ALTER TABLE "MarkEntryAccessRequest" ADD CONSTRAINT "MarkEntryAccessRequest_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkEntryAccessRequest" ADD CONSTRAINT "MarkEntryAccessRequest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkEntryAccessRequest" ADD CONSTRAINT "MarkEntryAccessRequest_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkEntryAccessRequest" ADD CONSTRAINT "MarkEntryAccessRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
