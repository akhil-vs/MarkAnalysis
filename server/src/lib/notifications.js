import { prisma } from "./prisma.js";

export async function createNotification({ userId, type, title, body, link = null, meta = null }) {
  return prisma.notification.create({
    data: { userId, type, title, body, link, meta },
  });
}

export async function notifyUsers(userIds, payload) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return [];

  await prisma.notification.createMany({
    data: uniqueIds.map((userId) => ({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: payload.link ?? null,
      meta: payload.meta ?? undefined,
    })),
  });

  return uniqueIds;
}

export async function notifyRoles(roles, payload, { excludeUserId } = {}) {
  const users = await prisma.user.findMany({
    where: {
      role: { in: roles },
      status: "ACTIVE",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return notifyUsers(
    users.map((u) => u.id),
    payload
  );
}

export async function notifyLateEntryRequested(request) {
  const teacherName = request.teacher?.name || "A teacher";
  const examName = request.exam?.name || "an exam";
  const subjectName = request.subject?.name || "a subject";
  const classLabel = request.classLabel || request.classSectionId;

  return notifyRoles(["PRINCIPAL", "EXAM_COORDINATOR"], {
    type: "LATE_ENTRY_REQUESTED",
    title: "Late mark entry requested",
    body: `${teacherName} requested late entry for ${examName} · ${classLabel} · ${subjectName}.`,
    link: request.examId
      ? `/late-entry?status=PENDING&examId=${encodeURIComponent(request.examId)}`
      : "/late-entry?status=PENDING",
    meta: {
      requestId: request.id,
      examId: request.examId,
      teacherId: request.teacherId,
      classSectionId: request.classSectionId,
      subjectId: request.subjectId,
    },
  });
}

export async function notifyLateEntryReviewed(request, status) {
  const teacherUserId = request.teacherId || request.teacher?.id;
  if (!teacherUserId) {
    throw new Error("Cannot notify teacher: missing teacherId on late entry request");
  }

  const examName = request.exam?.name || "an exam";
  const subjectName = request.subject?.name || "a subject";
  const classLabel = request.classLabel || request.classSectionId;
  const approved = status === "APPROVED";
  const marksLink = request.classSectionId && request.subjectId && request.examId
    ? `/marks?classSectionId=${encodeURIComponent(request.classSectionId)}&examId=${encodeURIComponent(request.examId)}&subjectId=${encodeURIComponent(request.subjectId)}`
    : "/marks";

  return createNotification({
    userId: teacherUserId,
    type: approved ? "LATE_ENTRY_APPROVED" : "LATE_ENTRY_REJECTED",
    title: approved ? "Late mark entry approved" : "Late mark entry rejected",
    body: approved
      ? `Your late entry request for ${examName} · ${classLabel} · ${subjectName} was approved. You can enter marks now.`
      : `Your late entry request for ${examName} · ${classLabel} · ${subjectName} was rejected.`,
    link: marksLink,
    meta: {
      requestId: request.id,
      examId: request.examId,
      classSectionId: request.classSectionId,
      subjectId: request.subjectId,
      status,
    },
  });
}


export async function notifyEditRequested(request) {
  const teacherName = request.teacher?.name || "A teacher";
  const examName = request.exam?.name || "an exam";
  const subjectName = request.subject?.name || "a subject";
  const classLabel = request.classLabel || request.classSectionId;

  return notifyRoles(["PRINCIPAL", "EXAM_COORDINATOR"], {
    type: "EDIT_REQUESTED",
    title: "Mark edit requested",
    body: `${teacherName} requested edit access for ${examName} · ${classLabel} · ${subjectName}.`,
    link: request.examId
      ? `/late-entry?status=PENDING&kind=EDIT&examId=${encodeURIComponent(request.examId)}`
      : "/late-entry?status=PENDING&kind=EDIT",
    meta: {
      requestId: request.id,
      kind: "EDIT",
      examId: request.examId,
      teacherId: request.teacherId,
      classSectionId: request.classSectionId,
      subjectId: request.subjectId,
    },
  });
}

export async function notifyEditReviewed(request, status) {
  const teacherUserId = request.teacherId || request.teacher?.id;
  if (!teacherUserId) {
    throw new Error("Cannot notify teacher: missing teacherId on edit request");
  }

  const examName = request.exam?.name || "an exam";
  const subjectName = request.subject?.name || "a subject";
  const classLabel = request.classLabel || request.classSectionId;
  const approved = status === "APPROVED";
  const marksLink = request.classSectionId && request.subjectId && request.examId
    ? `/marks?classSectionId=${encodeURIComponent(request.classSectionId)}&examId=${encodeURIComponent(request.examId)}&subjectId=${encodeURIComponent(request.subjectId)}`
    : "/marks";

  return createNotification({
    userId: teacherUserId,
    type: approved ? "EDIT_APPROVED" : "EDIT_REJECTED",
    title: approved ? "Mark edit approved" : "Mark edit rejected",
    body: approved
      ? `Your edit request for ${examName} · ${classLabel} · ${subjectName} was approved. Marks are unlocked as draft — edit and submit again.`
      : `Your edit request for ${examName} · ${classLabel} · ${subjectName} was rejected.`,
    link: marksLink,
    meta: {
      requestId: request.id,
      kind: "EDIT",
      examId: request.examId,
      classSectionId: request.classSectionId,
      subjectId: request.subjectId,
      status,
    },
  });
}

export async function notifyMarksSubmitted({
  examId,
  examName,
  classSectionId,
  classLabel,
  subjectId,
  subjectName,
  teacherId,
  teacherName,
  submittedCount,
}) {
  const label = classLabel || classSectionId;
  const exam = examName || "an exam";
  const subject = subjectName || "a subject";
  const teacher = teacherName || "A teacher";
  const count = submittedCount ?? 0;

  return notifyRoles(
    ["PRINCIPAL", "EXAM_COORDINATOR"],
    {
      type: "MARKS_SUBMITTED",
      title: "Marks submitted for approval",
      body: `${teacher} submitted ${count} mark${count === 1 ? "" : "s"} for ${exam} · ${label} · ${subject}.`,
      link:
        examId && classSectionId && subjectId
          ? `/marks?examId=${encodeURIComponent(examId)}&classSectionId=${encodeURIComponent(classSectionId)}&subjectId=${encodeURIComponent(subjectId)}`
          : examId
            ? `/pending-uploads?examId=${encodeURIComponent(examId)}`
            : "/pending-uploads",
      meta: {
        examId,
        classSectionId,
        subjectId,
        teacherId,
        submittedCount: count,
      },
    },
    { excludeUserId: teacherId }
  );
}
