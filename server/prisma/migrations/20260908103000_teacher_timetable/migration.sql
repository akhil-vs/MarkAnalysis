-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableEntry" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "room" TEXT,

    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Period_sortOrder_key" ON "Period"("sortOrder");

-- CreateIndex
CREATE INDEX "TimetableEntry_teacherId_dayOfWeek_idx" ON "TimetableEntry"("teacherId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "TimetableEntry_dayOfWeek_periodId_idx" ON "TimetableEntry"("dayOfWeek", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_teacherId_dayOfWeek_periodId_key" ON "TimetableEntry"("teacherId", "dayOfWeek", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_classSectionId_dayOfWeek_periodId_key" ON "TimetableEntry"("classSectionId", "dayOfWeek", "periodId");

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE CASCADE ON UPDATE CASCADE;
