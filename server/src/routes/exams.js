import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, requireRole } from "../middleware/auth.js";
import { parseDeadlineInput } from "../lib/markAccess.js";
import { academicYearFromDate } from "../lib/stats.js";
import { logActivity } from "../lib/activityAudit.js";

export const examsRouter = Router();
examsRouter.use(auth);

examsRouter.get("/", async (_req, res) => {
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  res.json(exams);
});

examsRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, term, date, type, marksEntryDeadline, academicYear } = req.body || {};
  if (!name || !term || !date || !type) {
    return res.status(400).json({ error: "Name, term, date, and type are required" });
  }
  const deadline = marksEntryDeadline !== undefined ? parseDeadlineInput(marksEntryDeadline) : null;
  if (marksEntryDeadline !== undefined && deadline === undefined) {
    return res.status(400).json({ error: "Invalid marks entry deadline" });
  }
  const year = (academicYear && String(academicYear).trim()) || academicYearFromDate(date);
  if (!year) return res.status(400).json({ error: "Academic year is required" });
  const created = await prisma.exam.create({
    data: {
      name,
      term,
      academicYear: year,
      date: new Date(date),
      type,
      marksEntryDeadline: deadline,
    },
  });
  await logActivity({
    actorId: req.user.userId,
    action: "EXAM_CREATED",
    summary: `Created exam ${created.name} (${created.academicYear})`,
    examId: created.id,
    meta: { examName: created.name, academicYear: created.academicYear, type: created.type },
  });
  res.status(201).json(created);
});

examsRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, term, date, type, marksEntryDeadline, academicYear } = req.body || {};
  const data = {
    ...(name && { name }),
    ...(term && { term }),
    ...(date && { date: new Date(date) }),
    ...(type && { type }),
    ...(academicYear && { academicYear: String(academicYear).trim() }),
  };
  if (marksEntryDeadline !== undefined) {
    const deadline = parseDeadlineInput(marksEntryDeadline);
    if (marksEntryDeadline !== null && marksEntryDeadline !== "" && deadline === undefined) {
      return res.status(400).json({ error: "Invalid marks entry deadline" });
    }
    data.marksEntryDeadline = deadline;
  }
  const updated = await prisma.exam.update({
    where: { id: req.params.id },
    data,
  });
  await logActivity({
    actorId: req.user.userId,
    action: "EXAM_UPDATED",
    summary: `Updated exam ${updated.name} (${updated.academicYear})`,
    examId: updated.id,
    meta: { examName: updated.name, academicYear: updated.academicYear, type: updated.type },
  });
  res.json(updated);
});

examsRouter.delete("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const existing = await prisma.exam.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, academicYear: true },
  });
  await prisma.exam.delete({ where: { id: req.params.id } });
  if (existing) {
    await logActivity({
      actorId: req.user.userId,
      action: "EXAM_DELETED",
      summary: `Deleted exam ${existing.name} (${existing.academicYear})`,
      meta: { examName: existing.name, academicYear: existing.academicYear },
    });
  }
  res.json({ ok: true });
});
