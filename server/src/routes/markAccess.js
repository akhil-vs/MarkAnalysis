import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, isLeadership, requireRole } from "../middleware/auth.js";
import { isPastDeadline } from "../lib/markAccess.js";
import {
  notifyLateEntryRequested,
  notifyLateEntryReviewed,
  notifyEditRequested,
  notifyEditReviewed,
} from "../lib/notifications.js";

export const markAccessRouter = Router();
markAccessRouter.use(auth);

async function decorateRequest(row) {
  const classSection = await prisma.classSection.findUnique({
    where: { id: row.classSectionId },
    select: { id: true, className: true, section: true },
  });
  const classLabel = classSection
    ? `${classSection.className}-${classSection.section}`
    : row.classSectionId;
  return { ...row, classSection, classLabel };
}

markAccessRouter.get("/", async (req, res) => {
  const { status, examId, kind } = req.query;
  const where = {};
  if (examId) where.examId = examId;
  if (status) where.status = status;
  if (kind) where.kind = kind;

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
    return res.status(403).json({ error: "Teachers request mark access here" });
  }

  const { examId, classSectionId, subjectId, message, kind: rawKind } = req.body || {};
  const kind = rawKind === "EDIT" ? "EDIT" : "LATE_ENTRY";
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

  if (kind === "LATE_ENTRY") {
    if (!isPastDeadline(exam.marksEntryDeadline)) {
      return res.status(400).json({ error: "The mark entry deadline has not passed yet" });
    }
  } else {
    const lockedCount = await prisma.mark.count({
      where: {
        examId,
        subjectId,
        enteredById: req.user.userId,
        status: { in: ["SUBMITTED", "APPROVED"] },
        student: { classSectionId },
      },
    });
    if (!lockedCount) {
      return res.status(400).json({
        error: "No submitted marks to edit. Submit the register before requesting edit access.",
      });
    }
  }

  // Use the original compound unique (without kind) — one request row per register.
  const whereUnique = {
    examId_teacherId_classSectionId_subjectId: {
      examId,
      teacherId: req.user.userId,
      classSectionId,
      subjectId,
    },
  };

  const existing = await prisma.markEntryAccessRequest.findUnique({ where: whereUnique });

  if (existing?.status === "PENDING") {
    return res.status(409).json({
      error:
        existing.kind === kind
          ? "Request already pending approval"
          : `A ${existing.kind === "EDIT" ? "edit" : "late entry"} request is already pending for this register`,
    });
  }

  if (existing?.status === "APPROVED" && existing.kind === kind) {
    return res.json(existing);
  }

  const created = await prisma.markEntryAccessRequest.upsert({
    where: whereUnique,
    create: {
      examId,
      teacherId: req.user.userId,
      classSectionId,
      subjectId,
      kind,
      message: message || null,
      status: "PENDING",
    },
    update: {
      kind,
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
    if (kind === "EDIT") await notifyEditRequested(decorated);
    else await notifyLateEntryRequested(decorated);
  } catch (err) {
    console.error("Failed to notify leadership of mark access request", err);
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

  if (status === "APPROVED" && existing.kind === "EDIT") {
    const students = await prisma.student.findMany({
      where: { classSectionId: existing.classSectionId },
      select: { id: true },
    });
    await prisma.mark.updateMany({
      where: {
        examId: existing.examId,
        subjectId: existing.subjectId,
        enteredById: existing.teacherId,
        studentId: { in: students.map((s) => s.id) },
        status: { in: ["SUBMITTED", "APPROVED"] },
      },
      data: { status: "DRAFT" },
    });
  }

  const decorated = await decorateRequest(updated);
  let notified = false;
  try {
    if (existing.kind === "EDIT") await notifyEditReviewed(decorated, status);
    else await notifyLateEntryReviewed(decorated, status);
    notified = true;
  } catch (err) {
    console.error("Failed to notify teacher of mark access review", err);
  }

  res.json({ ...decorated, notified });
});
