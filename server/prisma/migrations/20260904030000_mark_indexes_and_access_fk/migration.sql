-- AlterTable
ALTER TABLE "MarkEntryAccessRequest" ADD CONSTRAINT "MarkEntryAccessRequest_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Mark_examId_status_idx" ON "Mark"("examId", "status");

-- CreateIndex
CREATE INDEX "Mark_studentId_idx" ON "Mark"("studentId");
