/**
 * Slim mark loads for analytics / year-series — avoid full nested includes
 * and unbounded "all APPROVED marks" scans.
 */
import { prisma } from "./prisma.js";
import { sameTypeExams } from "./stats.js";

/** Fields needed for percentsOf / yearSeries / summarize. */
export const ANALYTICS_MARK_SELECT = Object.freeze({
  studentId: true,
  subjectId: true,
  examId: true,
  marksObtained: true,
  practicalMarks: true,
  outcome: true,
  status: true,
  student: {
    select: {
      id: true,
      name: true,
      rollNo: true,
      status: true,
      classSectionId: true,
      classSection: { select: { id: true, className: true, section: true } },
    },
  },
  subject: {
    select: { id: true, name: true, className: true, maxMarks: true, practicalMaxMarks: true },
  },
});

/** Even slimmer — attach exam from catalog in memory. */
export const ANALYTICS_HISTORY_SELECT = Object.freeze({
  studentId: true,
  subjectId: true,
  examId: true,
  marksObtained: true,
  practicalMarks: true,
  outcome: true,
  student: {
    select: {
      id: true,
      status: true,
      classSectionId: true,
      classSection: { select: { id: true, className: true, section: true } },
    },
  },
  subject: {
    select: { id: true, name: true, className: true, maxMarks: true, practicalMaxMarks: true },
  },
});

/**
 * Load APPROVED marks scoped to specific exam IDs (never the whole tenant history).
 */
export async function loadApprovedMarksForExams({
  examIds,
  classSectionIds,
  subjectIds,
  subjectNames,
  classNames,
  select = ANALYTICS_MARK_SELECT,
  attachExamById = null,
} = {}) {
  const ids = [...new Set((examIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const where = {
    status: "APPROVED",
    examId: { in: ids },
  };
  if (classSectionIds?.length) {
    where.student = { ...(where.student || {}), classSectionId: { in: classSectionIds } };
  }
  if (classNames?.length) {
    where.student = {
      ...(where.student || {}),
      classSection: { className: { in: classNames } },
    };
  }
  if (subjectIds?.length) {
    where.subjectId = { in: subjectIds };
  }
  if (subjectNames?.length) {
    where.subject = { name: { in: subjectNames } };
  }

  const rows = await prisma.mark.findMany({ where, select });
  if (!attachExamById) return rows;
  return rows
    .map((m) => {
      const exam = attachExamById.get?.(m.examId) || attachExamById[m.examId];
      return exam ? { ...m, exam } : null;
    })
    .filter(Boolean);
}

/** Exam IDs for year-series (same type as current exam). */
export function sameTypeExamIds(exams, exam) {
  return sameTypeExams(exams, exam).map((e) => e.id);
}

/** All catalog exam IDs (for term trends / examPass that span types). */
export function catalogExamIds(exams) {
  return (exams || []).map((e) => e.id).filter(Boolean);
}

/**
 * Prefetch peer teacher assignments for many subject names in one query.
 * Returns Map<subjectName, assignment[]>.
 */
export async function loadPeerAssignmentsBySubjectName(subjectNames) {
  const names = [...new Set((subjectNames || []).filter(Boolean))];
  if (!names.length) return new Map();
  const peers = await prisma.teacherAssignment.findMany({
    where: { subject: { name: { in: names } } },
    select: {
      userId: true,
      classSectionId: true,
      subjectId: true,
      user: { select: { id: true, name: true } },
      classSection: { select: { id: true, className: true, section: true } },
      subject: { select: { id: true, name: true } },
    },
  });
  const byName = new Map();
  for (const row of peers) {
    const name = row.subject?.name;
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(row);
  }
  return byName;
}
