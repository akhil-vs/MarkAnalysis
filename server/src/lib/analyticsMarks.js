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
 * Minimal columns for termTrend / yearSeries / examPass history scans.
 * Omits student names and subject names (not needed for percent aggregates).
 */
export const ANALYTICS_TREND_SELECT = Object.freeze({
  studentId: true,
  subjectId: true,
  examId: true,
  marksObtained: true,
  practicalMarks: true,
  outcome: true,
  student: {
    select: {
      status: true,
      classSectionId: true,
      classSection: { select: { className: true } },
    },
  },
  subject: {
    select: { maxMarks: true, practicalMaxMarks: true, className: true },
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
 * Bound history scans for school detail (termTrend + yearComparison).
 * Includes every peer exam in the same academic year, plus a capped set of
 * same-type exams from other years (newest first). Avoids loading the entire
 * catalog's APPROVED marks on cold detail.
 */
export function historyExamIdsForDetail(exams, exam, { maxSameTypePrior = 4 } = {}) {
  if (!exam?.id) return [];
  const others = (exams || []).filter((e) => e?.id && e.id !== exam.id);
  const ids = new Set();
  for (const e of others) {
    if (exam.academicYear && e.academicYear === exam.academicYear) ids.add(e.id);
  }
  const sameTypePrior = sameTypeExams(exams, exam)
    .filter((e) => e.id !== exam.id)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, Math.max(0, maxSameTypePrior));
  for (const e of sameTypePrior) ids.add(e.id);
  return [...ids];
}

/** Default history depth for school detail (overridable via env). */
export const SCHOOL_DETAIL_HISTORY_PRIOR =
  Number(process.env.SCHOOL_DETAIL_HISTORY_PRIOR) >= 0
    ? Number(process.env.SCHOOL_DETAIL_HISTORY_PRIOR)
    : 2;

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
