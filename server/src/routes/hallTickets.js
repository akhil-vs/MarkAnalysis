import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { logActivity } from "../lib/activityAudit.js";
import { ensureHallTicketsSchema } from "../lib/ensureSchema.js";
import {
  buildHallTicketPayload,
  papersHaveDateAndTime,
  parseHallTicketPatch,
  publicHallTicketIssue,
  resolvePaperRows,
  streamHallTicketsPdf,
} from "../lib/hallTickets.js";
import { getSchoolLetterhead } from "../lib/school.js";
import { requireSchoolTenant } from "../lib/tenant.js";
import {
  auth,
  getTeacherClassIds,
  isLeadership,
  requireFeature,
  requireRole,
  teacherCanAccess,
} from "../middleware/auth.js";

export const hallTicketsRouter = Router();
hallTicketsRouter.use(auth);
hallTicketsRouter.use(requireSchoolTenant);
hallTicketsRouter.use(requireFeature("hallTickets"));

async function assertCanViewClass(req, classSectionId) {
  if (isLeadership(req.user.role)) return true;
  return teacherCanAccess(req.user, { classSectionId });
}

async function loadIssueContext(examId, classSectionId) {
  const [exam, classSection] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId } }),
    prisma.classSection.findUnique({ where: { id: classSectionId } }),
  ]);
  return { exam, classSection };
}

async function buildPreviewBundle({ exam, classSection, issue, includePhotoBytes = false }) {
  const studentQuery = includePhotoBytes
    ? {
        where: { classSectionId: classSection.id, status: "ACTIVE" },
        orderBy: { rollNo: "asc" },
      }
    : {
        where: { classSectionId: classSection.id, status: "ACTIVE" },
        orderBy: { rollNo: "asc" },
        omit: { photoBytes: true },
      };

  const [students, subjects, schedules, enrollments, letterhead] = await Promise.all([
    prisma.student.findMany(studentQuery),
    prisma.subject.findMany({
      where: { className: classSection.className },
      orderBy: { name: "asc" },
    }),
    prisma.examPaperSchedule.findMany({
      where: {
        examId: exam.id,
        OR: [{ className: null }, { className: classSection.className }],
      },
      include: { subject: true },
      orderBy: { paperDate: "asc" },
    }),
    prisma.studentSubjectEnrollment.findMany({
      where: {
        student: { classSectionId: classSection.id, status: "ACTIVE" },
      },
      select: { studentId: true, subjectId: true },
    }),
    getSchoolLetterhead(),
  ]);

  const tickets = buildHallTicketPayload({
    school: letterhead,
    exam,
    classSection,
    students,
    subjects,
    schedules,
    enrollments,
    issue,
  });

  return {
    letterhead,
    students,
    subjects,
    schedules,
    tickets,
    studentCount: students.length,
    photoCount: students.filter((s) => Boolean(s.photoMimeType)).length,
    paperCount: tickets[0]?.papers?.length || 0,
    scheduleComplete: papersHaveDateAndTime(tickets[0]?.papers || []),
  };
}

hallTicketsRouter.get("/", async (req, res) => {
  await ensureHallTicketsSchema();
  const examId = String(req.query.examId || "").trim();
  const where = examId ? { examId } : {};

  if (!isLeadership(req.user.role)) {
    const allowed = await getTeacherClassIds(req.user.userId);
    where.classSectionId = { in: allowed.length ? allowed : ["__none__"] };
  }

  const [issues, classes] = await Promise.all([
    prisma.hallTicketIssue.findMany({
      where,
      include: {
        exam: true,
        classSection: true,
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.classSection.findMany({
      orderBy: [{ className: "asc" }, { section: "asc" }],
      include: {
        _count: { select: { students: { where: { status: "ACTIVE" } } } },
      },
    }),
  ]);

  let visibleClasses = classes;
  if (!isLeadership(req.user.role)) {
    const allowed = new Set(await getTeacherClassIds(req.user.userId));
    visibleClasses = classes.filter((c) => allowed.has(c.id));
  }

  const issueByClass = new Map(issues.map((i) => [`${i.examId}:${i.classSectionId}`, i]));

  let scheduleCompleteByClassName = new Map();
  if (examId) {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (exam) {
      const classNames = [...new Set(visibleClasses.map((c) => c.className))];
      const [subjects, schedules] = await Promise.all([
        prisma.subject.findMany({
          where: { className: { in: classNames.length ? classNames : ["__none__"] } },
          orderBy: { name: "asc" },
        }),
        prisma.examPaperSchedule.findMany({
          where: {
            examId,
            OR: [
              { className: null },
              ...(classNames.length ? [{ className: { in: classNames } }] : []),
            ],
          },
        }),
      ]);
      const subjectsByClass = new Map();
      for (const subject of subjects) {
        if (!subjectsByClass.has(subject.className)) subjectsByClass.set(subject.className, []);
        subjectsByClass.get(subject.className).push(subject);
      }
      for (const className of classNames) {
        const papers = resolvePaperRows({
          subjects: subjectsByClass.get(className) || [],
          schedules,
          exam,
          className,
        });
        scheduleCompleteByClassName.set(className, papersHaveDateAndTime(papers));
      }
    }
  }

  res.json({
    canEdit: isLeadership(req.user.role),
    examId: examId || null,
    issues: issues.map(publicHallTicketIssue),
    classes: visibleClasses.map((cls) => {
      const issue = examId ? issueByClass.get(`${examId}:${cls.id}`) : null;
      return {
        id: cls.id,
        className: cls.className,
        section: cls.section,
        label: `${cls.className}-${cls.section}`,
        studentCount: cls._count?.students || 0,
        issue: issue ? publicHallTicketIssue(issue) : null,
        scheduleComplete: examId ? Boolean(scheduleCompleteByClassName.get(cls.className)) : false,
      };
    }),
  });
});

hallTicketsRouter.get("/preview", async (req, res) => {
  await ensureHallTicketsSchema();
  const examId = String(req.query.examId || "").trim();
  const classSectionId = String(req.query.classSectionId || "").trim();
  if (!examId || !classSectionId) {
    return res.status(400).json({ error: "examId and classSectionId are required" });
  }
  if (!(await assertCanViewClass(req, classSectionId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { exam, classSection } = await loadIssueContext(examId, classSectionId);
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  if (!classSection) return res.status(404).json({ error: "Class not found" });

  const issue = await prisma.hallTicketIssue.findUnique({
    where: {
      examId_classSectionId: { examId, classSectionId },
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });

  const bundle = await buildPreviewBundle({ exam, classSection, issue });
  res.json({
    canEdit: isLeadership(req.user.role),
    exam: {
      id: exam.id,
      name: exam.name,
      term: exam.term,
      type: exam.type,
      academicYear: exam.academicYear,
      date: exam.date,
    },
    classSection: {
      id: classSection.id,
      className: classSection.className,
      section: classSection.section,
      label: `${classSection.className}-${classSection.section}`,
    },
    issue: publicHallTicketIssue(issue),
    studentCount: bundle.studentCount,
    photoCount: bundle.photoCount,
    paperCount: bundle.paperCount,
    scheduleComplete: bundle.scheduleComplete,
    canDownloadPdf: bundle.scheduleComplete,
    students: bundle.students.map((s) => ({
      id: s.id,
      name: s.name,
      rollNo: s.rollNo,
      admissionNo: s.admissionNo || null,
      hasPhoto: Boolean(s.photoMimeType),
      paperCount: bundle.tickets.find((t) => t.student.id === s.id)?.papers?.length || 0,
    })),
    papers: bundle.tickets[0]?.papers || [],
    defaults: {
      title: `${exam.name} — Hall Ticket`,
      instructions:
        issue?.instructions ||
        "Bring this hall ticket and your school ID to every paper. Electronic devices are not allowed in the examination hall. Follow the invigilator’s instructions at all times.",
    },
  });
});

hallTicketsRouter.get("/pdf", async (req, res) => {
  await ensureHallTicketsSchema();
  const examId = String(req.query.examId || "").trim();
  const classSectionId = String(req.query.classSectionId || "").trim();
  if (!examId || !classSectionId) {
    return res.status(400).json({ error: "examId and classSectionId are required" });
  }
  if (!(await assertCanViewClass(req, classSectionId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { exam, classSection } = await loadIssueContext(examId, classSectionId);
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  if (!classSection) return res.status(404).json({ error: "Class not found" });

  const issue = await prisma.hallTicketIssue.findUnique({
    where: { examId_classSectionId: { examId, classSectionId } },
  });

  const bundle = await buildPreviewBundle({ exam, classSection, issue, includePhotoBytes: true });
  if (!bundle.scheduleComplete) {
    return res.status(400).json({
      error: "Set a date and start time for every paper under Records → Exams before downloading hall tickets.",
    });
  }
  const stem = `hall-tickets-${classSection.className}${classSection.section}-${exam.name}`
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  streamHallTicketsPdf(res, {
    letterhead: bundle.letterhead,
    tickets: bundle.tickets,
    filename: `${stem}.pdf`,
  });
});

hallTicketsRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await ensureHallTicketsSchema();
  const examId = String(req.body?.examId || "").trim();
  const classSectionId = String(req.body?.classSectionId || "").trim();
  if (!examId || !classSectionId) {
    return res.status(400).json({ error: "examId and classSectionId are required" });
  }

  const { exam, classSection } = await loadIssueContext(examId, classSectionId);
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  if (!classSection) return res.status(404).json({ error: "Class not found" });

  const existing = await prisma.hallTicketIssue.findUnique({
    where: { examId_classSectionId: { examId, classSectionId } },
  });
  if (existing) {
    return res.status(409).json({ error: "Hall tickets already created for this class and exam. Edit the existing batch instead." });
  }

  const patch = parseHallTicketPatch(req.body || {});
  const created = await prisma.hallTicketIssue.create({
    data: {
      tenantId: req.tenantId,
      examId,
      classSectionId,
      createdById: req.user.userId,
      updatedById: req.user.userId,
      includePhoto: patch.includePhoto !== undefined ? patch.includePhoto : true,
      title: patch.title ?? null,
      instructions: patch.instructions ?? null,
      defaultVenue: patch.defaultVenue ?? null,
      examCentre: patch.examCentre ?? null,
      internalNotes: patch.internalNotes ?? null,
    },
    include: {
      exam: true,
      classSection: true,
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });

  await logActivity({
    actorId: req.user.userId,
    action: "HALL_TICKET_CREATED",
    summary: `Hall tickets created for ${classSection.className}-${classSection.section} · ${exam.name}`,
    examId: exam.id,
    meta: { classSectionId, issueId: created.id },
  });

  res.status(201).json(publicHallTicketIssue(created));
});

hallTicketsRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await ensureHallTicketsSchema();
  const existing = await prisma.hallTicketIssue.findUnique({
    where: { id: req.params.id },
    include: { exam: true, classSection: true },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const patch = parseHallTicketPatch(req.body || {});
  const updated = await prisma.hallTicketIssue.update({
    where: { id: existing.id },
    data: {
      ...patch,
      updatedById: req.user.userId,
    },
    include: {
      exam: true,
      classSection: true,
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });

  await logActivity({
    actorId: req.user.userId,
    action: "HALL_TICKET_UPDATED",
    summary: `Hall tickets updated for ${existing.classSection.className}-${existing.classSection.section} · ${existing.exam.name}`,
    examId: existing.examId,
    meta: { classSectionId: existing.classSectionId, issueId: existing.id },
  });

  res.json(publicHallTicketIssue(updated));
});

hallTicketsRouter.delete("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await ensureHallTicketsSchema();
  const existing = await prisma.hallTicketIssue.findUnique({
    where: { id: req.params.id },
    include: { exam: true, classSection: true },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.hallTicketIssue.delete({ where: { id: existing.id } });
  await logActivity({
    actorId: req.user.userId,
    action: "HALL_TICKET_DELETED",
    summary: `Hall tickets removed for ${existing.classSection.className}-${existing.classSection.section} · ${existing.exam.name}`,
    examId: existing.examId,
    meta: { classSectionId: existing.classSectionId, issueId: existing.id },
  });
  res.json({ ok: true });
});
