import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, isLeadership, requireRole } from "../middleware/auth.js";
import { isPastDeadline } from "../lib/markAccess.js";
import { notifyLateEntryRequested, notifyLateEntryReviewed } from "../lib/notifications.js";

export const markAccessRouter = Router();
markAccessRouter.use(auth);

async function decorateRequest(row) {
  const classSection = await prisma.classSection.findUnique({
    where: { id: row.classSectionId },
    select: { id: true, className: true, section: true },
  });
  const classLabel = classSection ? `${classSection.className}-${classSection.section}` : row.classSectionId;
  return { ...row, classSection, classLabel };
}

markAccessRouter.get("/", async (req, res) => {
  const { status, examId } = req.query;
  const where = {};
  if (examId) where.examId = examId;
  if (status) where.status = status;

  if (req.user.role === "TEACHER") {
    where.teacherId = req.user.userId;
  } else if (!isLeadership(req.user.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const rows = await prisma.markEntryAccessRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
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

  res.json(
    rows.map((row) => ({
      ...row,
      classSection: classMap.get(row.classSectionId) || null,
      classLabel: classMap.has(row.classSectionId)
        ? `${classMap.get(row.classSectionId).className}-${classMap.get(row.classSectionId).section}`
        : row.classSectionId,
    }))
  );
});

markAccessRouter.post("/", async (req, res) => {
  if (req.user.role !== "TEACHER") {
    return res.status(403).json({ error: "Teachers request late entry access here" });
  }

  const { examId, classSectionId, subjectId, message } = req.body || {};
  if (!examId || !classSectionId || !subjectId) {
    return res.status(400).json({ error: "examId, classSectionId, and subjectId are required" });
  }

  const [exam, assignment] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId } }),
    prisma.teacherAssignment.findFirst({
      where: {
        userId: req.user.userId,
        classSectionId,
        subjectId,
      },
    }),
  ]);
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  if (!assignment) return res.status(403).json({ error: "Not assigned to this register" });
  if (!isPastDeadline(exam.marksEntryDeadline)) {
    return res.status(400).json({ error: "The mark entry deadline has not passed yet" });
  }

  const existing = await prisma.markEntryAccessRequest.findUnique({
    where: {
      examId_teacherId_classSectionId_subjectId: {
        examId,
        teacherId: req.user.userId,
        classSectionId,
        subjectId,
      },
    },
  });

  if (existing?.status === "APPROVED") {
    return res.json(existing);
  }
  if (existing?.status === "PENDING") {
    return res.status(409).json({ error: "Request already pending approval" });
  }

  const created = await prisma.markEntryAccessRequest.upsert({
    where: {
      examId_teacherId_classSectionId_subjectId: {
        examId,
        teacherId: req.user.userId,
        classSectionId,
        subjectId,
      },
    },
    create: {
      examId,
      teacherId: req.user.userId,
      classSectionId,
      subjectId,
      message: message || null,
      status: "PENDING",
    },
    update: {
      message: message || null,
      status: "PENDING",
      reviewedById: null,
      reviewedAt: null,
      requestedAt: new Date(),
    },
    include: {
      exam: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
    },
  });

  const decorated = await decorateRequest(created);
  try {
    await notifyLateEntryRequested(decorated);
  } catch (err) {
    // Request is already saved — do not fail the teacher response if notify breaks.
    console.error("Failed to notify leadership of late entry request", err);
  }

  res.status(201).json(created);
});

markAccessRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { status } = req.body || {};
  if (!["APPROVED", "REJECTED"].includes(status)) {
    return res.status(400).json({ error: "status must be APPROVED or REJECTED" });
  }

  const existing = await prisma.markEntryAccessRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.markEntryAccessRequest.update({
    where: { id: req.params.id },
    data: {
      status,
      reviewedById: req.user.userId,
      reviewedAt: new Date(),
    },
    include: {
      exam: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });

  const decorated = await decorateRequest(updated);
  try {
    await notifyLateEntryReviewed(decorated, status);
  } catch (err) {
    console.error("Failed to notify teacher of late entry review", err);
  }

  res.json(decorated);
});
