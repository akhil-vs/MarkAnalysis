import { prisma } from "./prisma.js";
import { marksRegisterLink } from "./appLinks.js";
import { notifyUsers } from "./notifications.js";
import { summarizeRegister } from "./registerStatus.js";

export const NOTICE_KINDS = ["DEADLINE", "INCOMPLETE", "CUSTOM"];
export const NOTICE_AUDIENCES = ["PENDING", "ALL", "SELECTED"];

export const KIND_TO_TYPE = {
  DEADLINE: "DEADLINE_REMINDER",
  INCOMPLETE: "INCOMPLETE_MARKLIST",
  CUSTOM: "STAFF_NOTICE",
};

const MAX_MESSAGE_LENGTH = 500;
const RECENT_MS = 30 * 60 * 1000;

export function isIncompleteAssignment(assignment) {
  if (!assignment) return false;
  if ((assignment.missing ?? 0) > 0) return true;
  return assignment.status === "MISSING" || assignment.status === "PARTIAL";
}

export function formatNoticeDeadline(deadline) {
  if (!deadline) return null;
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function assignmentLabel(assignment) {
  const cls = assignment?.classLabel || assignment?.classSectionId || "class";
  const subject = assignment?.subject || "subject";
  return `${cls} ${subject}`;
}

export function summarizeOutstanding(assignments, limit = 4) {
  const labels = (assignments || []).map(assignmentLabel);
  if (!labels.length) return "";
  if (labels.length <= limit) return labels.join(", ");
  return `${labels.slice(0, limit).join(", ")} and ${labels.length - limit} more`;
}

export function marksLink(examId, outstanding = []) {
  if (!examId) return marksRegisterLink();
  if (outstanding.length === 1) {
    const a = outstanding[0];
    return marksRegisterLink({
      examId,
      classSectionId: a.classSectionId || undefined,
      subjectId: a.subjectId || undefined,
    });
  }
  return marksRegisterLink({ examId });
}

export function defaultAudienceForKind(kind) {
  if (kind === "DEADLINE") return "ALL";
  if (kind === "INCOMPLETE") return "PENDING";
  return "SELECTED";
}

export function normalizeMessage(message) {
  if (message == null) return "";
  return String(message).trim().slice(0, MAX_MESSAGE_LENGTH);
}

export function filterTeachersForNotice(teachers, { audience, teacherIds, classSectionId } = {}) {
  let list = Array.isArray(teachers) ? teachers.map((t) => ({ ...t, assignments: [...(t.assignments || [])] })) : [];

  if (classSectionId) {
    list = list
      .map((t) => ({
        ...t,
        assignments: t.assignments.filter((a) => a.classSectionId === classSectionId),
      }))
      .filter((t) => t.assignments.length > 0 || audience === "SELECTED");
  }

  const selected = new Set((teacherIds || []).filter(Boolean));
  if (audience === "SELECTED" || (selected.size && audience !== "ALL" && audience !== "PENDING")) {
    list = list.filter((t) => selected.has(t.teacherId));
  } else if (audience === "PENDING") {
    list = list.filter((t) => (t.assignments || []).some(isIncompleteAssignment));
  }

  return list;
}

export function buildNoticeContent({ kind, exam, senderName, message, teacher, pastDeadline }) {
  const examName = exam?.name || "the exam";
  const sender = senderName || "Leadership";
  const extra = normalizeMessage(message);
  const outstanding = (teacher?.assignments || []).filter(isIncompleteAssignment);
  const deadlineLabel = formatNoticeDeadline(exam?.marksEntryDeadline);
  const examId = exam?.id;

  if (kind === "DEADLINE") {
    const title = `Mark entry deadline: ${examName}`;
    let body;
    if (pastDeadline && deadlineLabel) {
      body = `${sender} reminds you that the mark entry deadline for ${examName} was ${deadlineLabel}.`;
    } else if (deadlineLabel) {
      body = `${sender} reminds you that marks for ${examName} are due by ${deadlineLabel}.`;
    } else {
      body = `${sender} asked you to complete mark entry for ${examName}.`;
    }
    if (outstanding.length) {
      body += ` Outstanding: ${summarizeOutstanding(outstanding)}.`;
    }
    if (extra) body += ` ${extra}`;
    return {
      type: KIND_TO_TYPE.DEADLINE,
      title,
      body,
      link: marksLink(examId, outstanding),
    };
  }

  if (kind === "INCOMPLETE") {
    const papers = outstanding.length ? summarizeOutstanding(outstanding) : "your assigned registers";
    let body = `${sender} asked you to complete the marklist for ${examName} (${papers}).`;
    if (extra) body += ` ${extra}`;
    return {
      type: KIND_TO_TYPE.INCOMPLETE,
      title: `Incomplete marklist: ${examName}`,
      body,
      link: marksLink(examId, outstanding),
    };
  }

  let body = extra || `${sender} sent you a notice.`;
  if (exam?.name && extra) body = `${examName}: ${extra}`;
  else if (exam?.name && !extra) body = `${sender} sent you a notice about ${examName}.`;
  return {
    type: KIND_TO_TYPE.CUSTOM,
    title: `Notice from ${sender}`,
    body,
    link: examId ? marksLink(examId, outstanding) : marksRegisterLink(),
  };
}

export function validateNoticeRequest({ kind, examId, audience, teacherIds, message, preview = false }) {
  if (!NOTICE_KINDS.includes(kind)) {
    return "Choose a notice type: deadline, incomplete marklist, or custom";
  }
  if ((kind === "DEADLINE" || kind === "INCOMPLETE") && !examId) {
    return "An exam is required for this notice";
  }
  const resolvedAudience = audience || defaultAudienceForKind(kind);
  if (!NOTICE_AUDIENCES.includes(resolvedAudience)) {
    return "Invalid audience";
  }
  if (kind === "CUSTOM" && !normalizeMessage(message) && !preview) {
    return "Write a short message for the teachers";
  }
  if (resolvedAudience === "SELECTED" && !(teacherIds || []).length) {
    return "Select at least one teacher";
  }
  return null;
}

export async function loadTeacherProgress(exam) {
  const [assignments, students, marks] = await Promise.all([
    prisma.teacherAssignment.findMany({
      include: { user: true, classSection: true, subject: true },
    }),
    prisma.student.findMany({ where: { status: "ACTIVE" }, select: { id: true, classSectionId: true } }),
    exam?.id
      ? prisma.mark.findMany({
          where: { examId: exam.id },
          select: { studentId: true, subjectId: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  const studentsByClass = new Map();
  for (const student of students) {
    const list = studentsByClass.get(student.classSectionId) || [];
    list.push(student);
    studentsByClass.set(student.classSectionId, list);
  }

  const byTeacher = new Map();
  for (const assignment of assignments) {
    if (assignment.user?.status && assignment.user.status !== "ACTIVE") continue;
    const expected = studentsByClass.get(assignment.classSectionId) || [];
    const registerMarks = exam?.id
      ? marks.filter(
          (m) => m.subjectId === assignment.subjectId && expected.some((s) => s.id === m.studentId)
        )
      : [];
    const progress = summarizeRegister(expected.length, registerMarks);
    if (!byTeacher.has(assignment.userId)) {
      byTeacher.set(assignment.userId, {
        teacherId: assignment.userId,
        name: assignment.user?.name || "Teacher",
        email: assignment.user?.email || null,
        assignments: [],
      });
    }
    byTeacher.get(assignment.userId).assignments.push({
      classSectionId: assignment.classSectionId,
      classLabel: `${assignment.classSection.className}-${assignment.classSection.section}`,
      subject: assignment.subject.name,
      subjectId: assignment.subjectId,
      ...progress,
    });
  }

  return [...byTeacher.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function attachSelectedTeachers(teachers, teacherIds) {
  const known = new Set(teachers.map((t) => t.teacherId));
  const missing = (teacherIds || []).filter((id) => id && !known.has(id));
  if (!missing.length) return teachers;
  const users = await prisma.user.findMany({
    where: { id: { in: missing }, role: "TEACHER", status: "ACTIVE" },
    select: { id: true, name: true, email: true },
  });
  return [
    ...teachers,
    ...users.map((u) => ({
      teacherId: u.id,
      name: u.name,
      email: u.email,
      assignments: [],
    })),
  ];
}

function previewTeachers(teachers) {
  return teachers.map((t) => ({
    teacherId: t.teacherId,
    name: t.name,
    email: t.email,
    outstanding: (t.assignments || []).filter(isIncompleteAssignment).map((a) => ({
      classSectionId: a.classSectionId,
      classLabel: a.classLabel,
      subject: a.subject,
      subjectId: a.subjectId,
      missing: a.missing,
      status: a.status,
    })),
  }));
}

async function recentlyNotifiedIds(teacherIds, type, examId) {
  if (!teacherIds.length) return new Set();
  const since = new Date(Date.now() - RECENT_MS);
  const rows = await prisma.notification.findMany({
    where: {
      userId: { in: teacherIds },
      type,
      createdAt: { gte: since },
    },
    select: { userId: true, meta: true },
  });
  return new Set(
    rows
      .filter((r) => !examId || r.meta?.examId === examId)
      .map((r) => r.userId)
  );
}

export async function sendTeacherNotices({
  kind,
  examId,
  audience,
  teacherIds,
  classSectionId,
  message,
  sender,
  preview = false,
  force = false,
}) {
  const resolvedAudience = audience || defaultAudienceForKind(kind);
  const error = validateNoticeRequest({
    kind,
    examId,
    audience: resolvedAudience,
    teacherIds,
    message,
    preview,
  });
  if (error) {
    const err = new Error(error);
    err.status = 400;
    throw err;
  }

  let exam = null;
  if (examId) {
    exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      const err = new Error("Exam not found");
      err.status = 404;
      throw err;
    }
  }

  let teachers = await loadTeacherProgress(exam);
  if (resolvedAudience === "SELECTED") {
    teachers = await attachSelectedTeachers(teachers, teacherIds);
  } else if (kind === "CUSTOM" && resolvedAudience === "ALL") {
    const extras = await prisma.user.findMany({
      where: { role: "TEACHER", status: "ACTIVE" },
      select: { id: true, name: true, email: true },
    });
    const known = new Set(teachers.map((t) => t.teacherId));
    for (const u of extras) {
      if (!known.has(u.id)) {
        teachers.push({ teacherId: u.id, name: u.name, email: u.email, assignments: [] });
      }
    }
  }

  const recipients = filterTeachersForNotice(teachers, {
    audience: resolvedAudience,
    teacherIds,
    classSectionId,
  });

  const pastDeadline = exam?.marksEntryDeadline
    ? Date.now() > new Date(exam.marksEntryDeadline).getTime()
    : false;
  const type = KIND_TO_TYPE[kind];
  const payloadTeachers = previewTeachers(recipients);

  if (preview) {
    return {
      preview: true,
      kind,
      audience: resolvedAudience,
      exam: exam ? { id: exam.id, name: exam.name, marksEntryDeadline: exam.marksEntryDeadline } : null,
      count: payloadTeachers.length,
      teachers: payloadTeachers,
    };
  }

  if (!recipients.length) {
    const err = new Error("No matching teachers to notify");
    err.status = 400;
    throw err;
  }

  let toNotify = recipients;
  let skippedRecent = [];
  if (!force) {
    const recent = await recentlyNotifiedIds(
      recipients.map((t) => t.teacherId),
      type,
      exam?.id
    );
    skippedRecent = recipients.filter((t) => recent.has(t.teacherId));
    toNotify = recipients.filter((t) => !recent.has(t.teacherId));
  }

  const senderName = sender?.name || "Leadership";
  const senderId = sender?.userId || sender?.id || null;

  for (const teacher of toNotify) {
    const content = buildNoticeContent({
      kind,
      exam,
      senderName,
      message,
      teacher,
      pastDeadline,
    });
    await notifyUsers([teacher.teacherId], {
      ...content,
      meta: {
        kind,
        examId: exam?.id || null,
        classSectionId: classSectionId || null,
        senderId,
        senderName,
      },
    });
  }

  return {
    preview: false,
    kind,
    audience: resolvedAudience,
    exam: exam ? { id: exam.id, name: exam.name, marksEntryDeadline: exam.marksEntryDeadline } : null,
    sent: toNotify.length,
    skipped: skippedRecent.length,
    recentlyNotified: skippedRecent.length > 0 && toNotify.length === 0,
    teachers: previewTeachers(toNotify),
    skippedTeachers: previewTeachers(skippedRecent),
  };
}
