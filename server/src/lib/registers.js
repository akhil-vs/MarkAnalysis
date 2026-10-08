import { prisma } from "./prisma.js";
import { getAssignments, isLeadership } from "../middleware/auth.js";
import { summarizeRegister } from "./registerStatus.js";
import { groupBy } from "./stats.js";
import { loadExams } from "./examCatalog.js";
import { resolveWorkspace } from "./workspace.js";
import {
  classNameInSchoolSection,
  normalizeSchoolSection,
} from "./schoolSections.js";
import { isPastDeadline } from "./markAccess.js";

export function registerKey({ examId, classSectionId, subjectId, teacherId }) {
  return `${examId}:${classSectionId}:${subjectId}:${teacherId}`;
}

export function parseRegisterKey(key) {
  const parts = String(key || "").split(":");
  if (parts.length !== 4 || parts.some((p) => !p)) return null;
  const [examId, classSectionId, subjectId, teacherId] = parts;
  return { examId, classSectionId, subjectId, teacherId };
}

/** Derive FE/BE action list from register progress + role. */
export function registerActions(progress, { role, isOwner, pastDeadline } = {}) {
  const actions = ["VIEW"];
  const status = progress.status;
  const leadership = isLeadership(role);
  const canEnter = (role === "TEACHER" && isOwner) || role === "EXAM_COORDINATOR";

  if (canEnter) {
    if (status === "MISSING" || status === "PARTIAL") {
      if (!pastDeadline) actions.unshift("ENTER");
      else actions.unshift("REQUEST_LATE");
      if (progress.draft > 0 && progress.missing === 0) actions.push("SUBMIT");
    } else if (status === "AWAITING_APPROVAL" || status === "APPROVED") {
      if (isOwner && role === "TEACHER") actions.push("REQUEST_EDIT");
    }
  }

  if (
    leadership &&
    (status === "AWAITING_APPROVAL" ||
      ((progress.submitted ?? 0) > 0 && (progress.approved ?? 0) < (progress.expected ?? 0)))
  ) {
    actions.push("APPROVE");
  }

  return [...new Set(actions)];
}

function nextActionFor(actions, progress) {
  if (actions.includes("ENTER")) return "ENTER";
  if (actions.includes("SUBMIT")) return "SUBMIT";
  if (actions.includes("APPROVE")) return "APPROVE";
  if (actions.includes("REQUEST_LATE")) return "REQUEST_LATE";
  if (actions.includes("REQUEST_EDIT")) return "REQUEST_EDIT";
  return actions[0] || "VIEW";
}

/**
 * Build register DTOs for the current user and exam.
 * Teachers see own assignments; leadership sees all (optionally section-filtered).
 */
export async function listRegisters(user, { examId, schoolSection } = {}) {
  const resolved = await resolveWorkspace({
    userId: user.userId || user.id,
    examId,
    schoolSection,
  });
  const exam = resolved.exam;
  const exams = resolved.exams;
  const section = normalizeSchoolSection(resolved.schoolSection);

  if (!exam) {
    return {
      empty: true,
      reason: "NO_EXAM",
      exam: null,
      exams,
      schoolSection: section,
      registers: [],
      nextActions: [],
    };
  }

  const pastDeadline = isPastDeadline(exam.marksEntryDeadline);
  const role = user.role;
  const userId = user.userId || user.id;

  let assignmentRows;
  if (role === "TEACHER") {
    const mine = await getAssignments(userId);
    assignmentRows = mine.map((a) => ({
      teacherId: userId,
      teacherName: user.name || null,
      teacherEmail: user.email || null,
      classSectionId: a.classSectionId,
      className: a.classSection.className,
      section: a.classSection.section,
      classLabel: `${a.classSection.className}-${a.classSection.section}`,
      subjectId: a.subjectId,
      subject: a.subject.name,
      assignmentId: a.id,
    }));
  } else if (isLeadership(role)) {
    const rows = await prisma.teacherAssignment.findMany({
      select: {
        id: true,
        userId: true,
        classSectionId: true,
        subjectId: true,
        user: { select: { id: true, name: true, email: true } },
        classSection: { select: { id: true, className: true, section: true } },
        subject: { select: { id: true, name: true } },
      },
    });
    assignmentRows = rows
      .filter((a) => classNameInSchoolSection(a.classSection.className, section))
      .map((a) => ({
        teacherId: a.userId,
        teacherName: a.user.name,
        teacherEmail: a.user.email,
        classSectionId: a.classSectionId,
        className: a.classSection.className,
        section: a.classSection.section,
        classLabel: `${a.classSection.className}-${a.classSection.section}`,
        subjectId: a.subjectId,
        subject: a.subject.name,
        assignmentId: a.id,
      }));
  } else {
    return {
      empty: true,
      reason: "FORBIDDEN",
      exam,
      exams,
      schoolSection: section,
      registers: [],
      nextActions: [],
    };
  }

  if (!assignmentRows.length) {
    return {
      empty: true,
      reason: role === "TEACHER" ? "NO_ASSIGNMENTS" : "NO_ASSIGNMENTS",
      exam,
      exams,
      schoolSection: section,
      registers: [],
      nextActions: [],
    };
  }

  const classIds = [...new Set(assignmentRows.map((a) => a.classSectionId))];
  const subjectIds = [...new Set(assignmentRows.map((a) => a.subjectId))];

  const [students, marks] = await Promise.all([
    prisma.student.findMany({
      where: { classSectionId: { in: classIds }, status: "ACTIVE" },
      select: { id: true, classSectionId: true },
    }),
    prisma.mark.findMany({
      where: {
        examId: exam.id,
        subjectId: { in: subjectIds },
        student: { classSectionId: { in: classIds } },
      },
      select: {
        studentId: true,
        subjectId: true,
        status: true,
        enteredById: true,
        student: { select: { classSectionId: true } },
      },
    }),
  ]);

  const studentsByClass = groupBy(students, (s) => s.classSectionId);
  const marksByPaperTeacher = new Map();
  for (const mark of marks) {
    const classSectionId = mark.student?.classSectionId;
    if (!classSectionId) continue;
    const key = `${mark.subjectId}|${classSectionId}|${mark.enteredById}`;
    if (!marksByPaperTeacher.has(key)) marksByPaperTeacher.set(key, []);
    marksByPaperTeacher.get(key).push(mark);
  }
  // Also index without teacher for expected counting (all marks on paper)
  const marksByPaper = new Map();
  for (const mark of marks) {
    const classSectionId = mark.student?.classSectionId;
    if (!classSectionId) continue;
    const key = `${mark.subjectId}|${classSectionId}`;
    if (!marksByPaper.has(key)) marksByPaper.set(key, []);
    marksByPaper.get(key).push(mark);
  }

  const registers = assignmentRows.map((a) => {
    const expected = studentsByClass.get(a.classSectionId) || [];
    // Prefer marks entered by this teacher; fall back to all marks on the paper
    // so class-teacher / leadership views stay accurate when enteredBy differs.
    const owned =
      marksByPaperTeacher.get(`${a.subjectId}|${a.classSectionId}|${a.teacherId}`) || [];
    const allOnPaper = marksByPaper.get(`${a.subjectId}|${a.classSectionId}`) || [];
    const registerMarks = owned.length ? owned : allOnPaper;
    const progress = summarizeRegister(expected.length, registerMarks);
    const isOwner = a.teacherId === userId;
    const actions = registerActions(progress, {
      role,
      isOwner: isOwner || role === "EXAM_COORDINATOR",
      pastDeadline,
    });
    const key = registerKey({
      examId: exam.id,
      classSectionId: a.classSectionId,
      subjectId: a.subjectId,
      teacherId: a.teacherId,
    });
    return {
      key,
      id: a.assignmentId,
      examId: exam.id,
      classSectionId: a.classSectionId,
      subjectId: a.subjectId,
      teacherId: a.teacherId,
      teacherName: a.teacherName,
      teacherEmail: a.teacherEmail,
      classLabel: a.classLabel,
      className: a.className,
      subject: a.subject,
      ...progress,
      actions,
      nextAction: nextActionFor(actions, progress),
      marksPath: `/marks?examId=${encodeURIComponent(exam.id)}&classSectionId=${encodeURIComponent(a.classSectionId)}&subjectId=${encodeURIComponent(a.subjectId)}`,
    };
  });

  registers.sort(
    (a, b) =>
      priority(a) - priority(b) ||
      a.classLabel.localeCompare(b.classLabel) ||
      a.subject.localeCompare(b.subject)
  );

  const nextActions = registers
    .filter((r) => ["ENTER", "SUBMIT", "APPROVE", "REQUEST_LATE"].includes(r.nextAction))
    .slice(0, 12)
    .map((r) => ({
      key: r.key,
      label: actionLabel(r),
      action: r.nextAction,
      classLabel: r.classLabel,
      subject: r.subject,
      teacherName: r.teacherName,
      marksPath: r.marksPath,
      status: r.status,
    }));

  return {
    empty: false,
    exam,
    exams,
    schoolSection: section,
    registers,
    nextActions,
    kpis: {
      total: registers.length,
      missing: registers.filter((r) => r.status === "MISSING" || r.missing > 0).length,
      awaitingApproval: registers.filter((r) => r.status === "AWAITING_APPROVAL").length,
      approved: registers.filter((r) => r.status === "APPROVED").length,
    },
  };
}

function priority(r) {
  if (r.nextAction === "APPROVE") return 0;
  if (r.nextAction === "ENTER" || r.nextAction === "SUBMIT") return 1;
  if (r.nextAction === "REQUEST_LATE") return 2;
  if (r.status === "PARTIAL") return 3;
  if (r.status === "AWAITING_APPROVAL") return 4;
  return 5;
}

function actionLabel(r) {
  switch (r.nextAction) {
    case "ENTER":
      return r.missing === r.expected ? `Start ${r.classLabel} · ${r.subject}` : `Finish ${r.classLabel} · ${r.subject}`;
    case "SUBMIT":
      return `Submit ${r.classLabel} · ${r.subject}`;
    case "APPROVE":
      return `Approve ${r.teacherName || "teacher"} · ${r.classLabel} · ${r.subject}`;
    case "REQUEST_LATE":
      return `Request late entry · ${r.classLabel} · ${r.subject}`;
    case "REQUEST_EDIT":
      return `Request edit · ${r.classLabel} · ${r.subject}`;
    default:
      return `Open ${r.classLabel} · ${r.subject}`;
  }
}

/** Re-export loadExams helper for callers that only need catalog. */
export { loadExams };
