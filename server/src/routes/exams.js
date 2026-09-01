import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, requireRole } from "../middleware/auth.js";
import { parseDeadlineInput } from "../lib/markAccess.js";
import { academicYearFromDate } from "../lib/stats.js";

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
  res.json(updated);
});

examsRouter.delete("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await prisma.exam.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
