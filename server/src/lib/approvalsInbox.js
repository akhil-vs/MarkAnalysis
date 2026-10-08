import { prisma } from "./prisma.js";
import { getTenantId } from "./tenant.js";
import { registerKey } from "./registers.js";
import { invalidateInsightsCache } from "./insightsCache.js";
import { logRegisterActivity } from "./activityAudit.js";

const BATCH_MAX = 25;

export async function loadRegisterApprovalItems({ examId } = {}) {
  const tenantId = getTenantId();
  if (!tenantId) {
    const err = new Error("Missing tenant context");
    err.status = 500;
    throw err;
  }

  const rows = examId
    ? await prisma.$queryRaw`
        SELECT
          m."examId" AS "examId",
          e.name AS "examName",
          e.date AS "examDate",
          s."classSectionId" AS "classSectionId",
          cs."className" AS "className",
          cs.section AS "section",
          m."subjectId" AS "subjectId",
          sub.name AS "subjectName",
          m."enteredById" AS "teacherId",
          u.name AS "teacherName",
          u.email AS "teacherEmail",
          COUNT(*)::int AS "submittedCount"
        FROM "Mark" m
        INNER JOIN "Student" s ON s.id = m."studentId"
        INNER JOIN "ClassSection" cs ON cs.id = s."classSectionId"
        INNER JOIN "Exam" e ON e.id = m."examId"
        INNER JOIN "Subject" sub ON sub.id = m."subjectId"
        INNER JOIN "User" u ON u.id = m."enteredById"
        WHERE m.status = 'SUBMITTED'::"MarkStatus"
          AND m."tenantId" = ${tenantId}
          AND m."examId" = ${examId}
        GROUP BY
          m."examId", e.name, e.date,
          s."classSectionId", cs."className", cs.section,
          m."subjectId", sub.name,
          m."enteredById", u.name, u.email
      `
    : await prisma.$queryRaw`
        SELECT
          m."examId" AS "examId",
          e.name AS "examName",
          e.date AS "examDate",
          s."classSectionId" AS "classSectionId",
          cs."className" AS "className",
          cs.section AS "section",
          m."subjectId" AS "subjectId",
          sub.name AS "subjectName",
          m."enteredById" AS "teacherId",
          u.name AS "teacherName",
          u.email AS "teacherEmail",
          COUNT(*)::int AS "submittedCount"
        FROM "Mark" m
        INNER JOIN "Student" s ON s.id = m."studentId"
        INNER JOIN "ClassSection" cs ON cs.id = s."classSectionId"
        INNER JOIN "Exam" e ON e.id = m."examId"
        INNER JOIN "Subject" sub ON sub.id = m."subjectId"
        INNER JOIN "User" u ON u.id = m."enteredById"
        WHERE m.status = 'SUBMITTED'::"MarkStatus"
          AND m."tenantId" = ${tenantId}
        GROUP BY
          m."examId", e.name, e.date,
          s."classSectionId", cs."className", cs.section,
          m."subjectId", sub.name,
          m."enteredById", u.name, u.email
      `;

  return (rows || []).map((row) => {
    const classLabel =
      row.className && row.section ? `${row.className}-${row.section}` : row.classSectionId;
    const item = {
      kind: "register",
      id: registerKey({
        examId: row.examId,
        classSectionId: row.classSectionId,
        subjectId: row.subjectId,
        teacherId: row.teacherId,
      }),
      examId: row.examId,
      examName: row.examName || "Exam",
      examDate: row.examDate || null,
      classSectionId: row.classSectionId,
      classLabel,
      subjectId: row.subjectId,
      subjectName: row.subjectName || "Subject",
      teacherId: row.teacherId,
      teacherName: row.teacherName || "Teacher",
      teacherEmail: row.teacherEmail || null,
      submittedCount: Number(row.submittedCount) || 0,
      marksPath: `/marks?examId=${encodeURIComponent(row.examId)}&classSectionId=${encodeURIComponent(row.classSectionId)}&subjectId=${encodeURIComponent(row.subjectId)}`,
    };
    return item;
  });
}

export async function loadAccessApprovalItems({ examId, status = "PENDING" } = {}) {
  const where = { status };
  if (examId) where.examId = examId;

  const rows = await prisma.markEntryAccessRequest.findMany({
    where,
    orderBy: [{ requestedAt: "desc" }],
    include: {
      exam: { select: { id: true, name: true, marksEntryDeadline: true } },
      teacher: { select: { id: true, name: true, email: true } },
      subject: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });

  const classIds = [...new Set(rows.map((r) => r.classSectionId))];
  const classes = await prisma.classSection.findMany({
    where: { id: { in: classIds } },
    select: { id: true, className: true, section: true },
  });
  const classMap = new Map(classes.map((c) => [c.id, c]));

  return rows.map((row) => {
    const cs = classMap.get(row.classSectionId);
    const classLabel = cs ? `${cs.className}-${cs.section}` : row.classSectionId;
    return {
      kind: "access",
      id: `access:${row.id}`,
      requestId: row.id,
      accessKind: row.kind,
      status: row.status,
      examId: row.examId,
      examName: row.exam?.name || "Exam",
      classSectionId: row.classSectionId,
      classLabel,
      subjectId: row.subjectId,
      subjectName: row.subject?.name || "Subject",
      teacherId: row.teacherId,
      teacherName: row.teacher?.name || "Teacher",
      teacherEmail: row.teacher?.email || null,
      message: row.message || null,
      requestedAt: row.requestedAt,
      marksPath: `/marks?examId=${encodeURIComponent(row.examId)}&classSectionId=${encodeURIComponent(row.classSectionId)}&subjectId=${encodeURIComponent(row.subjectId)}`,
    };
  });
}

export async function buildApprovalsInbox({ tab = "registers", examId, status } = {}) {
  if (tab === "access") {
    const items = await loadAccessApprovalItems({ examId, status: status || "PENDING" });
    return { tab: "access", count: items.length, items };
  }
  const items = await loadRegisterApprovalItems({ examId });
  items.sort((a, b) => {
    const dateA = a.examDate ? new Date(a.examDate).getTime() : 0;
    const dateB = b.examDate ? new Date(b.examDate).getTime() : 0;
    return (
      dateB - dateA ||
      a.teacherName.localeCompare(b.teacherName) ||
      a.classLabel.localeCompare(b.classLabel)
    );
  });
  return { tab: "registers", count: items.length, items };
}

/** Approve one or more submitted registers (capped). */
export async function approveRegisterItems(actorId, items = []) {
  if (!Array.isArray(items) || !items.length) {
    const err = new Error("items[] is required");
    err.status = 400;
    err.code = "ITEMS_REQUIRED";
    throw err;
  }
  if (items.length > BATCH_MAX) {
    const err = new Error(`Approve at most ${BATCH_MAX} registers at a time`);
    err.status = 400;
    err.code = "BATCH_TOO_LARGE";
    throw err;
  }

  const results = [];
  for (const raw of items) {
    const examId = raw.examId;
    const teacherId = raw.teacherId;
    const classSectionId = raw.classSectionId || undefined;
    const subjectId = raw.subjectId || undefined;
    if (!examId || !teacherId) {
      results.push({ ok: false, error: "examId and teacherId are required", item: raw });
      continue;
    }

    const studentFilter = classSectionId ? { classSectionId } : undefined;
    const students = studentFilter
      ? await prisma.student.findMany({ where: studentFilter, select: { id: true } })
      : null;

    const result = await prisma.mark.updateMany({
      where: {
        examId,
        status: "SUBMITTED",
        enteredById: teacherId,
        ...(subjectId && { subjectId }),
        ...(students && { studentId: { in: students.map((s) => s.id) } }),
      },
      data: { status: "APPROVED" },
    });

    if (result.count) {
      await logRegisterActivity({
        actorId,
        action: "MARK_APPROVED",
        examId,
        classSectionId,
        subjectId,
        teacherId,
        count: result.count,
      });
    }
    results.push({ ok: true, approved: result.count, teacherId, examId, classSectionId, subjectId });
  }

  if (results.some((r) => r.ok && r.approved > 0)) {
    invalidateInsightsCache();
  }

  return {
    approvedTotal: results.reduce((sum, r) => sum + (r.approved || 0), 0),
    results,
  };
}
