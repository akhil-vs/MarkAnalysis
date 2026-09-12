import { prisma } from "./prisma.js";
import { describeAuditValue } from "./markCodes.js";
import { ensureActivityAuditSchema } from "./ensureSchema.js";

export const AUDIT_LIMIT = 200;

export const ACTION_LABELS = {
  MARK_CHANGED: "Mark edited",
  MARK_DELETED: "Mark deleted",
  MARK_SUBMITTED: "Marks submitted",
  MARK_APPROVED: "Marks approved",
  MARK_UNAPPROVED: "Approval reverted",
  MARK_MODERATED: "Mark moderated",
  ACCESS_REQUESTED: "Access requested",
  ACCESS_APPROVED: "Access approved",
  ACCESS_REJECTED: "Access rejected",
  USER_CREATED: "Staff created",
  USER_STATUS_CHANGED: "Staff status",
  USER_ROLE_CHANGED: "Staff role",
  USER_PASSWORD_RESET: "Password reset",
  EXAM_CREATED: "Exam created",
  EXAM_UPDATED: "Exam updated",
  EXAM_DELETED: "Exam deleted",
  SCHOOL_CREATED: "School created",
  SCHOOL_UPDATED: "School updated",
  SCHOOL_STATUS_CHANGED: "School status",
};

const ROLE_LABELS = {
  PLATFORM_ADMIN: "Platform admin",
  PRINCIPAL: "Principal",
  EXAM_COORDINATOR: "Exam coordinator",
  TEACHER: "Teacher",
};

export function actionLabel(action) {
  return ACTION_LABELS[action] || action;
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

/** Principal sees every actor, including exam coordinators. Coordinators only see teachers. */
export function actorVisibleToViewer(viewerRole, actorRole) {
  if (viewerRole === "PRINCIPAL") return true;
  if (viewerRole === "EXAM_COORDINATOR") return actorRole === "TEACHER";
  return false;
}

export function actorFilterForViewer(viewerRole, requestedRole, actorId) {
  const allowed =
    viewerRole === "PRINCIPAL"
      ? ["PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"]
      : viewerRole === "EXAM_COORDINATOR"
        ? ["TEACHER"]
        : [];

  let role = requestedRole && allowed.includes(requestedRole) ? requestedRole : undefined;
  if (viewerRole === "EXAM_COORDINATOR") role = "TEACHER";

  const where = {};
  if (role) where.role = role;
  if (actorId) where.id = actorId;
  return Object.keys(where).length ? where : undefined;
}

export function mapMarkAudit(row) {
  const deleted = row.newValue === -1;
  const moderated = Boolean(row.reason);
  const action = deleted ? "MARK_DELETED" : moderated ? "MARK_MODERATED" : "MARK_CHANGED";
  const student = row.mark?.student;
  const subject = row.mark?.subject;
  const exam = row.mark?.exam;
  const studentLabel = student ? `${student.rollNo} ${student.name}`.trim() : "—";
  const subjectName = subject?.name || "—";
  const oldLabel = describeAuditValue(row.oldValue);
  const newLabel = describeAuditValue(row.newValue);
  return {
    id: `mark:${row.id}`,
    source: "mark",
    timestamp: row.timestamp,
    action,
    actionLabel: actionLabel(action),
    summary: deleted
      ? `Deleted ${subjectName} for ${studentLabel}`
      : moderated
        ? `Moderated ${subjectName} for ${studentLabel} (${oldLabel ?? "—"} → ${newLabel}): ${row.reason}`
        : `Changed ${subjectName} for ${studentLabel} (${oldLabel ?? "—"} → ${newLabel})`,
    actor: row.changedBy
      ? {
          id: row.changedBy.id,
          name: row.changedBy.name,
          role: row.changedBy.role,
          roleLabel: roleLabel(row.changedBy.role),
        }
      : null,
    exam: exam ? { id: exam.id, name: exam.name } : null,
    student: student ? { name: student.name, rollNo: student.rollNo } : null,
    subject: subject ? { name: subject.name } : null,
    oldValue: row.oldValue,
    newValue: row.newValue,
    reason: row.reason || null,
    oldLabel: oldLabel ?? "—",
    newLabel: newLabel ?? "—",
  };
}

export function mapActivityAudit(row) {
  return {
    id: `activity:${row.id}`,
    source: "activity",
    timestamp: row.timestamp,
    action: row.action,
    actionLabel: actionLabel(row.action),
    summary: row.summary,
    actor: row.actor
      ? {
          id: row.actor.id,
          name: row.actor.name,
          role: row.actor.role,
          roleLabel: roleLabel(row.actor.role),
        }
      : null,
    exam: row.examId ? { id: row.examId, name: row.meta?.examName || null } : null,
    student: null,
    subject: row.meta?.subjectName ? { name: row.meta.subjectName } : null,
    oldValue: null,
    newValue: null,
    oldLabel: "—",
    newLabel: "—",
    meta: row.meta || null,
  };
}

export function mergeAuditFeeds(markRows, activityRows, limit = AUDIT_LIMIT) {
  return [...markRows, ...activityRows]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export async function logActivity({ actorId, action, summary, examId = null, meta = undefined, tenantId = undefined }) {
  if (!actorId || !action || !summary) return;
  try {
    await ensureActivityAuditSchema();
    const { getTenantId, runWithTenant } = await import("./tenant.js");
    const data = {
      actorId,
      action,
      summary,
      examId: examId || null,
      meta: meta ?? undefined,
      ...(tenantId ? { tenantId } : {}),
    };
    const write = () => prisma.activityAudit.create({ data });
    if (tenantId && !getTenantId()) {
      await runWithTenant(tenantId, write);
    } else {
      await write();
    }
  } catch (err) {
    console.error("Failed to write activity audit", err);
  }
}

export function classLabel(classSection) {
  if (!classSection) return "";
  return `${classSection.className}-${classSection.section}`;
}

const REGISTER_VERBS = {
  MARK_SUBMITTED: (count) => `Submitted ${count != null ? `${count} ` : ""}marks`,
  MARK_APPROVED: (count) => `Approved ${count != null ? `${count} ` : ""}submitted marks`,
  MARK_UNAPPROVED: (count) => `Reverted approval of ${count != null ? `${count} ` : ""}marks`,
};

export async function logRegisterActivity({
  actorId,
  action,
  examId,
  classSectionId,
  subjectId,
  teacherId,
  count,
}) {
  const [exam, subject, classSection, teacher] = await Promise.all([
    examId ? prisma.exam.findUnique({ where: { id: examId }, select: { name: true } }) : null,
    subjectId ? prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } }) : null,
    classSectionId
      ? prisma.classSection.findUnique({
          where: { id: classSectionId },
          select: { className: true, section: true },
        })
      : null,
    teacherId ? prisma.user.findUnique({ where: { id: teacherId }, select: { name: true } }) : null,
  ]);
  const label = classLabel(classSection);
  const bits = [label, subject?.name, exam?.name].filter(Boolean).join(" · ");
  const verb = (REGISTER_VERBS[action] || (() => action))(count);
  const teacherBit = teacher?.name ? ` for ${teacher.name}` : "";
  await logActivity({
    actorId,
    action,
    summary: `${verb}${teacherBit}${bits ? ` · ${bits}` : ""}`.replace(/\s+/g, " ").trim(),
    examId,
    meta: {
      teacherId,
      teacherName: teacher?.name,
      classSectionId,
      classLabel: label,
      subjectId,
      subjectName: subject?.name,
      examName: exam?.name,
      count,
    },
  });
}
