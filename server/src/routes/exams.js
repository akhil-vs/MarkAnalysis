import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, requireRole } from "../middleware/auth.js";
import { parseDeadlineInput } from "../lib/markAccess.js";
import { academicYearFromDate } from "../lib/stats.js";
import { logActivity } from "../lib/activityAudit.js";
import { ensureConsolidationSchema } from "../lib/ensureSchema.js";
import { parsePositiveInt } from "../lib/numbers.js";
import { requireSchoolTenant } from "../lib/tenant.js";
import {
  assertExamConsolidationEditable,
  examConsolidationInclude,
  getExamWithConsolidation,
  publicExamConsolidation,
  setExamConsolidationLock,
} from "../lib/consolidationMaxMarks.js";

export const examsRouter = Router();
examsRouter.use(auth);
examsRouter.use(requireSchoolTenant);

function examJson(exam) {
  if (!exam) return exam;
  const { consolidationLockedBy, ...rest } = exam;
  return {
    ...rest,
    consolidation: publicExamConsolidation({
      ...exam,
      consolidationLockedBy,
    }),
  };
}

async function parseConsolidationMax(raw, { required }) {
  if (raw == null || raw === "") {
    if (required) return parsePositiveInt(raw, "Max marks [consolidation]");
    return { value: undefined };
  }
  return parsePositiveInt(raw, "Max marks [consolidation]");
}

examsRouter.get("/", async (_req, res) => {
  await ensureConsolidationSchema();
  const exams = await prisma.exam.findMany({
    orderBy: { date: "asc" },
    include: examConsolidationInclude,
  });
  res.json(exams.map(examJson));
});

examsRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, term, date, type, marksEntryDeadline, academicYear, consolidationMaxMarks } =
    req.body || {};
  if (!name || !term || !date || !type) {
    return res.status(400).json({ error: "Name, term, date, and type are required" });
  }
  const deadline = marksEntryDeadline !== undefined ? parseDeadlineInput(marksEntryDeadline) : null;
  if (marksEntryDeadline !== undefined && deadline === undefined) {
    return res.status(400).json({ error: "Invalid marks entry deadline" });
  }
  const year = (academicYear && String(academicYear).trim()) || academicYearFromDate(date);
  if (!year) return res.status(400).json({ error: "Academic year is required" });
  const consol = await parseConsolidationMax(consolidationMaxMarks, { required: false });
  if (consol.error) return res.status(400).json({ error: consol.error });

  await ensureConsolidationSchema();
  const created = await prisma.exam.create({
    data: {
      name,
      term,
      academicYear: year,
      date: new Date(date),
      type,
      tenantId: req.tenantId,
      marksEntryDeadline: deadline,
      ...(consol.value != null ? { consolidationMaxMarks: consol.value } : {}),
    },
    include: examConsolidationInclude,
  });
  await logActivity({
    actorId: req.user.userId,
    action: "EXAM_CREATED",
    summary: `Created exam ${created.name} (${created.academicYear})`,
    examId: created.id,
    meta: {
      examName: created.name,
      academicYear: created.academicYear,
      type: created.type,
      consolidationMaxMarks: created.consolidationMaxMarks,
    },
  });
  res.status(201).json(examJson(created));
});

examsRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, term, date, type, marksEntryDeadline, academicYear, consolidationMaxMarks } =
    req.body || {};
  await ensureConsolidationSchema();
  const existing = await getExamWithConsolidation(req.params.id);
  if (!existing) return res.status(404).json({ error: "Exam not found" });

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
  if (consolidationMaxMarks != null && consolidationMaxMarks !== "") {
    const lockedMsg = assertExamConsolidationEditable(existing);
    if (lockedMsg) return res.status(409).json({ error: lockedMsg });
    const consol = await parseConsolidationMax(consolidationMaxMarks, { required: true });
    if (consol.error) return res.status(400).json({ error: consol.error });
    data.consolidationMaxMarks = consol.value;
  }
  const updated = await prisma.exam.update({
    where: { id: req.params.id },
    data,
    include: examConsolidationInclude,
  });
  await logActivity({
    actorId: req.user.userId,
    action: "EXAM_UPDATED",
    summary: `Updated exam ${updated.name} (${updated.academicYear})`,
    examId: updated.id,
    meta: {
      examName: updated.name,
      academicYear: updated.academicYear,
      type: updated.type,
      consolidationMaxMarks: updated.consolidationMaxMarks,
    },
  });
  res.json(examJson(updated));
});

examsRouter.post("/:id/consolidation/lock", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await ensureConsolidationSchema();
  const existing = await getExamWithConsolidation(req.params.id);
  if (!existing) return res.status(404).json({ error: "Exam not found" });
  const { consolidationMaxMarks } = req.body || {};
  if (consolidationMaxMarks != null && consolidationMaxMarks !== "") {
    const lockedMsg = assertExamConsolidationEditable(existing);
    if (lockedMsg) return res.status(409).json({ error: lockedMsg });
    const consol = await parseConsolidationMax(consolidationMaxMarks, { required: true });
    if (consol.error) return res.status(400).json({ error: consol.error });
    await prisma.exam.update({
      where: { id: existing.id },
      data: { consolidationMaxMarks: consol.value },
    });
  }
  const locked = await setExamConsolidationLock(existing.id, true, req.user.userId);
  res.json(examJson(locked));
});

examsRouter.post("/:id/consolidation/unlock", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await ensureConsolidationSchema();
  const existing = await getExamWithConsolidation(req.params.id);
  if (!existing) return res.status(404).json({ error: "Exam not found" });
  const unlocked = await setExamConsolidationLock(existing.id, false, req.user.userId);
  res.json(examJson(unlocked));
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
