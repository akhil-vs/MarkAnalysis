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
    const access = {};
    for (const subjectId of subjectIds) {
      access[subjectId] = { canEnter: true, pastDeadline, deadline, requestStatus: null, requestId: null };
    }
    return { deadline, pastDeadline, bySubject: access };
  }

  const requests = pastDeadline
    ? await prisma.markEntryAccessRequest.findMany({
        where: {
          examId,
          teacherId: user.userId,
          classSectionId,
          subjectId: { in: subjectIds },
        },
      })
    : [];
  const bySubjectId = new Map(requests.map((r) => [r.subjectId, r]));

  const bySubject = {};
  for (const subjectId of subjectIds) {
    if (!pastDeadline) {
      bySubject[subjectId] = { canEnter: true, pastDeadline: false, deadline, requestStatus: null, requestId: null };
      continue;
    }
    const request = bySubjectId.get(subjectId);
    bySubject[subjectId] = {
      canEnter: request?.status === "APPROVED",
      pastDeadline: true,
      deadline,
      requestStatus: request?.status ?? null,
      requestId: request?.id ?? null,
    };
  }

  return { deadline, pastDeadline, bySubject };
}

export async function assertTeacherMarkEntryAccess(user, { examId, classSectionId, subjectId }) {
  const ok = await teacherHasMarkEntryAccess(user, { examId, classSectionId, subjectId });
  if (ok) return null;
  return "Mark entry deadline has passed. Request approval from the principal or coordinator.";
}
