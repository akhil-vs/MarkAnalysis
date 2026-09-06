import { prisma } from "./prisma.js";
import { nextAcademicYear, nextClassName } from "./stats.js";

export { nextAcademicYear, nextClassName };

export function activeStudentWhere(classSectionId) {
  return { classSectionId, status: "ACTIVE" };
}

/** Students who belong on a register for this exam (year match, with seed fallback). */
export async function studentWhereForExam(classSectionId, exam) {
  if (!exam?.academicYear) return activeStudentWhere(classSectionId);
  const matched = await prisma.student.count({
    where: { classSectionId, academicYear: exam.academicYear },
  });
  if (matched > 0) {
    return { classSectionId, academicYear: exam.academicYear };
  }
  return activeStudentWhere(classSectionId);
}

export async function collectStudentLineageIds(student) {
  const ids = [student.id];
  let cursor = student.promotedFromId;
  const seen = new Set(ids);
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    ids.push(cursor);
    const prev = await prisma.student.findUnique({
      where: { id: cursor },
      select: { promotedFromId: true },
    });
    cursor = prev?.promotedFromId || null;
  }
  return ids;
}
