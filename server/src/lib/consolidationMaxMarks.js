import { prisma } from "./prisma.js";

export const CONSOLIDATION_LOCKED_MESSAGE =
  "Consolidation max marks are locked for this exam. Unlock them before changing the consolidation ceiling.";

const LOCK_INCLUDE = {
  consolidationLockedBy: { select: { id: true, name: true } },
};

export function isExamConsolidationLocked(exam) {
  return Boolean(exam?.consolidationLocked);
}

/**
 * Reject consolidation maxMarks edits once this exam’s ceiling is locked.
 * Entry maxMarks on subjects remain editable.
 * @returns {string|null} error message or null when allowed
 */
export function assertExamConsolidationEditable(exam) {
  if (isExamConsolidationLocked(exam)) return CONSOLIDATION_LOCKED_MESSAGE;
  return null;
}

export function publicExamConsolidation(exam) {
  if (!exam) {
    return {
      consolidationMaxMarks: null,
      maxMarksLocked: false,
      lockedAt: null,
      lockedBy: null,
    };
  }
  return {
    consolidationMaxMarks:
      exam.consolidationMaxMarks == null ? null : Number(exam.consolidationMaxMarks),
    maxMarksLocked: Boolean(exam.consolidationLocked),
    lockedAt: exam.consolidationLockedAt || null,
    lockedBy: exam.consolidationLockedBy
      ? { id: exam.consolidationLockedBy.id, name: exam.consolidationLockedBy.name }
      : null,
  };
}

export async function getExamWithConsolidation(id) {
  return prisma.exam.findUnique({
    where: { id },
    include: LOCK_INCLUDE,
  });
}

export async function setExamConsolidationLock(examId, locked, userId) {
  return prisma.exam.update({
    where: { id: examId },
    data: locked
      ? {
          consolidationLocked: true,
          consolidationLockedAt: new Date(),
          consolidationLockedById: userId,
        }
      : {
          consolidationLocked: false,
          consolidationLockedAt: null,
          consolidationLockedById: null,
        },
    include: LOCK_INCLUDE,
  });
}

export const examConsolidationInclude = LOCK_INCLUDE;
