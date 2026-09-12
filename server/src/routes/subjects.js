import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ensureConsolidationSchema } from "../lib/ensureSchema.js";
import { parseOptionalPositiveInt, parsePositiveInt } from "../lib/numbers.js";
import { auth, requireRole } from "../middleware/auth.js";
import { requireSchoolTenant } from "../lib/tenant.js";

export const subjectsRouter = Router();
subjectsRouter.use(auth);
subjectsRouter.use(requireSchoolTenant);

subjectsRouter.get("/", async (req, res) => {
  await ensureConsolidationSchema();
  const className = req.query.className;
  const subjects = await prisma.subject.findMany({
    where: className ? { className } : undefined,
    orderBy: [{ className: "asc" }, { name: "asc" }],
  });
  res.json(subjects);
});

subjectsRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, className, maxMarks, isElective, practicalMaxMarks } = req.body || {};
  if (!name || !className) {
    return res.status(400).json({ error: "Name and class are required" });
  }
  const entry = parsePositiveInt(maxMarks, "Max marks");
  if (entry.error) return res.status(400).json({ error: entry.error });
  const practical = parseOptionalPositiveInt(practicalMaxMarks, "Practical max marks");
  if (practical.error) return res.status(400).json({ error: practical.error });

  try {
    await ensureConsolidationSchema();
    const created = await prisma.subject.create({
      data: {
        name,
        className,
        maxMarks: entry.value,
        tenantId: req.tenantId,
        ...(typeof isElective === "boolean" ? { isElective } : {}),
        practicalMaxMarks: practical.value,
      },
    });
    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: "Subject already exists for this class" });
  }
});

subjectsRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, className, maxMarks, isElective, practicalMaxMarks } = req.body || {};
  await ensureConsolidationSchema();

  const data = {
    ...(name && { name }),
    ...(className && { className }),
    ...(typeof isElective === "boolean" ? { isElective } : {}),
  };

  if (maxMarks != null && maxMarks !== "") {
    const entry = parsePositiveInt(maxMarks, "Max marks");
    if (entry.error) return res.status(400).json({ error: entry.error });
    data.maxMarks = entry.value;
  }

  if (practicalMaxMarks !== undefined) {
    const practical = parseOptionalPositiveInt(practicalMaxMarks, "Practical max marks");
    if (practical.error) return res.status(400).json({ error: practical.error });
    data.practicalMaxMarks = practical.value;
  }

  const updated = await prisma.subject.update({
    where: { id: req.params.id },
    data,
  });
  res.json(updated);
});

subjectsRouter.get("/:id/enrollments", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await ensureConsolidationSchema();
  const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
  if (!subject) return res.status(404).json({ error: "Subject not found" });

  const rows = await prisma.studentSubjectEnrollment.findMany({
    where: { subjectId: subject.id },
    select: { studentId: true },
  });
  res.json({ studentIds: rows.map((r) => r.studentId) });
});

subjectsRouter.put("/:id/enrollments", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await ensureConsolidationSchema();
  const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
  if (!subject) return res.status(404).json({ error: "Subject not found" });
  if (!subject.isElective) {
    return res.status(400).json({ error: "Subject is not elective" });
  }

  const rawIds = req.body?.studentIds;
  if (!Array.isArray(rawIds)) {
    return res.status(400).json({ error: "studentIds array is required" });
  }
  const studentIds = [...new Set(rawIds.map((id) => String(id)).filter(Boolean))];

  if (studentIds.length) {
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: { classSection: { select: { className: true } } },
    });
    if (students.length !== studentIds.length) {
      return res.status(400).json({ error: "One or more students not found" });
    }
    const mismatched = students.filter((s) => s.classSection?.className !== subject.className);
    if (mismatched.length) {
      return res.status(400).json({ error: "Students must belong to the subject's class" });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.studentSubjectEnrollment.deleteMany({ where: { subjectId: subject.id } });
    if (studentIds.length) {
      await tx.studentSubjectEnrollment.createMany({
        data: studentIds.map((studentId) => ({ studentId, subjectId: subject.id })),
      });
    }
  });

  res.json({ studentIds });
});

subjectsRouter.delete("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await prisma.subject.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
