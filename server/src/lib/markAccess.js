import { prisma } from "./prisma.js";
import { isLeadership } from "../middleware/auth.js";

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function isPastDeadline(deadline) {
  if (!deadline) return false;
  return Date.now() > endOfDay(deadline).getTime();
}

export function parseDeadlineInput(value) {
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return endOfDay(d);
}

export function isLockedMarkStatus(status) {
  return status === "SUBMITTED" || status === "APPROVED";
}

export async function teacherHasMarkEntryAccess(user, { examId, classSectionId, subjectId }) {
  if (isLeadership(user.role)) return true;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { marksEntryDeadline: true },
  });
  if (!exam || !isPastDeadline(exam.marksEntryDeadline)) return true;

  const approved = await prisma.markEntryAccessRequest.findFirst({
    where: {
      examId,
      teacherId: user.userId,
      classSectionId,
      subjectId,
      kind: "LATE_ENTRY",
      status: "APPROVED",
    },
  });
  return Boolean(approved);
}

export async function teacherHasEditAccess(user, { examId, classSectionId, subjectId }) {
  if (isLeadership(user.role)) return true;

  const approved = await prisma.markEntryAccessRequest.findFirst({
    where: {
      examId,
      teacherId: user.userId,
      classSectionId,
      subjectId,
      kind: "EDIT",
      status: "APPROVED",
    },
  });
  return Boolean(approved);
}

export async function getMarkEntryAccessMap(user, examId, classSectionId, subjectIds) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { marksEntryDeadline: true },
  });
  const deadline = exam?.marksEntryDeadline ?? null;
  const pastDeadline = isPastDeadline(deadline);

  if (isLeadership(user.role)) {
    const bySubject = {};
    for (const subjectId of subjectIds) {
      bySubject[subjectId] = {
        canEnter: true,
        canEditLocked: true,
        pastDeadline,
        deadline,
        requestStatus: null,
        requestId: null,
        reviewedAt: null,
        editRequestStatus: null,
        editRequestId: null,
        editReviewedAt: null,
      };
    }
    return { deadline, pastDeadline, bySubject };
  }

  const requests = subjectIds.length
    ? await prisma.markEntryAccessRequest.findMany({
        where: {
          examId,
          teacherId: user.userId,
          classSectionId,
          subjectId: { in: subjectIds },
        },
      })
    : [];

  const lateBySubject = new Map();
  const editBySubject = new Map();
  for (const r of requests) {
    if (r.kind === "EDIT") editBySubject.set(r.subjectId, r);
    else lateBySubject.set(r.subjectId, r);
  }

  const bySubject = {};
  for (const subjectId of subjectIds) {
    const late = lateBySubject.get(subjectId);
    const edit = editBySubject.get(subjectId);
    const canEnter = !pastDeadline || late?.status === "APPROVED" || edit?.status === "APPROVED";
    bySubject[subjectId] = {
      canEnter,
      canEditLocked: edit?.status === "APPROVED",
      pastDeadline,
      deadline,
      requestStatus: pastDeadline ? late?.status ?? null : null,
      requestId: pastDeadline ? late?.id ?? null : null,
      reviewedAt: pastDeadline ? late?.reviewedAt ?? null : null,
      editRequestStatus: edit?.status ?? null,
      editRequestId: edit?.id ?? null,
      editReviewedAt: edit?.reviewedAt ?? null,
    };
  }

  return { deadline, pastDeadline, bySubject };
}

export async function assertTeacherMarkEntryAccess(user, { examId, classSectionId, subjectId }) {
  const ok = await teacherHasMarkEntryAccess(user, { examId, classSectionId, subjectId });
  if (ok) return null;
  return "Mark entry deadline has passed. Request approval from the principal or coordinator.";
}

export async function assertTeacherCanMutateMark(
  user,
  { examId, classSectionId, subjectId, existingStatus }
) {
  const deadlineBlocked = await assertTeacherMarkEntryAccess(user, {
    examId,
    classSectionId,
    subjectId,
  });
  if (deadlineBlocked) return deadlineBlocked;

  if (!isLockedMarkStatus(existingStatus)) return null;

  const canEdit = await teacherHasEditAccess(user, { examId, classSectionId, subjectId });
  if (canEdit) return null;
  return "These marks are submitted and locked. Request edit access from the principal or coordinator.";
}
