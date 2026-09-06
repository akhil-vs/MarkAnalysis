-- CreateEnum
CREATE TYPE "MarkOutcome" AS ENUM ('SCORED', 'ABSENT', 'EXEMPT', 'WITHHELD');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'PROMOTED', 'TRANSFERRED', 'LEFT');

-- AlterTable
ALTER TABLE "Mark" ALTER COLUMN "marksObtained" DROP NOT NULL;
ALTER TABLE "Mark" ADD COLUMN "outcome" "MarkOutcome" NOT NULL DEFAULT 'SCORED';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "academicYear" TEXT NOT NULL DEFAULT '2025-26';
ALTER TABLE "Student" ADD COLUMN "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Student" ADD COLUMN "promotedFromId" TEXT;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_promotedFromId_fkey" FOREIGN KEY ("promotedFromId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Student_classSectionId_academicYear_status_idx" ON "Student"("classSectionId", "academicYear", "status");

-- CreateTable
CREATE TABLE "SchoolProfile" (
    "id" TEXT NOT NULL DEFAULT 'school',
    "name" TEXT NOT NULL,
    "board" TEXT,
    "affiliationNo" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolProfile_pkey" PRIMARY KEY ("id")
);
