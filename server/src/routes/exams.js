import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, requireFeature, requireRole } from "../middleware/auth.js";
import { parseDeadlineInput } from "../lib/markAccess.js";
import { academicYearFromDate } from "../lib/stats.js";
import { logActivity } from "../lib/activityAudit.js";
import { ensureConsolidationSchema, ensureExamIncludedClassesColumn } from "../lib/ensureSchema.js";
import { parsePositiveInt } from "../lib/numbers.js";
import { requireSchoolTenant } from "../lib/tenant.js";
import {
  assertExamConsolidationEditable,
  examConsolidationInclude,
  getExamWithConsolidation,
  publicExamConsolidation,
  setExamConsolidationLock,
} from "../lib/consolidationMaxMarks.js";
import { invalidateExamCatalog } from "../lib/examCatalog.js";
import {
  earliestPaperDate,
  listExamPapers,
  paperScheduleSummary,
  saveExamPapers,
} from "../lib/examPapers.js";
import {
  parseIncludedClassNames,
  prunePapersOutsideClasses,
  resolveIncludedClassNames,
} from "../lib/examIncludedClasses.js";

export const examsRouter = Router();
examsRouter.use(auth);
examsRouter.use(requireSchoolTenant);

const requireRecordsWrite = [requireRole("PRINCIPAL", "EXAM_COORDINATOR"), requireFeature("records")];

const examListInclude = {
  ...examConsolidationInclude,
  paperSchedules: {
    select: { id: true, paperDate: true, subjectId: true, className: true },
    orderBy: { paperDate: "asc" },
  },
};

function examJson(exam) {
  if (!exam) return exam;
  const { consolidationLockedBy, paperSchedules, ...rest } = exam;
  const summary = paperScheduleSummary(paperSchedules || []);
  return {
    ...rest,
    includedClassNames: resolveIncludedClassNames(exam, paperSchedules),
    paperCount: summary.paperCount,
    firstPaperDate: summary.firstPaperDate,
    lastPaperDate: summary.lastPaperDate,
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

function resolveExamDate({ date, papers }) {
  if (date) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return { error: "Invalid exam date" };
    return { value: parsed };
  }
  const fromPapers = earliestPaperDate(
    (papers || [])
      .filter((p) => p?.paperDate)
      .map((p) => ({ paperDate: p.paperDate }))
  );
  if (fromPapers) return { value: fromPapers };
  return { error: "Exam date or at least one paper date is required" };
}

examsRouter.get("/", async (_req, res) => {
  await ensureConsolidationSchema();
  await ensureExamIncludedClassesColumn();
  const exams = await prisma.exam.findMany({
    orderBy: { date: "asc" },
    include: examListInclude,
  });
  res.json(exams.map(examJson));
});

examsRouter.get("/:id/papers", requireRole("PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"), async (req, res) => {
  const exam = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  const papers = await listExamPapers(exam.id);
  res.json({ papers, ...paperScheduleSummary(papers) });
});

examsRouter.put("/:id/papers", ...requireRecordsWrite, async (req, res) => {
  const exam = await prisma.exam.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, academicYear: true, date: true },
  });
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const papers = Array.isArray(req.body?.papers) ? req.body.papers : null;
  if (!papers) return res.status(400).json({ error: "papers array is required" });
  const mode = req.body?.mode === "replace" ? "replace" : "merge";

  const result = await saveExamPapers({
    tenantId: req.tenantId,
    examId: exam.id,
    papers,
    mode,
  });
  if (result.error) return res.status(400).json({ error: result.error });

  // Keep exam.date aligned with the earliest scheduled paper when papers exist.
  if (result.summary.firstPaperDate) {
    await prisma.exam.update({
      where: { id: exam.id },
      data: { date: result.summary.firstPaperDate },
    });
  }

  await logActivity({
    actorId: req.user.userId,
    action: "EXAM_UPDATED",
    summary: `Updated paper schedule for ${exam.name} (${exam.academicYear}) · ${result.summary.paperCount} paper${result.summary.paperCount === 1 ? "" : "s"}`,
    examId: exam.id,
    meta: {
      examName: exam.name,
      academicYear: exam.academicYear,
      paperCount: result.summary.paperCount,
      firstPaperDate: result.summary.firstPaperDate,
      lastPaperDate: result.summary.lastPaperDate,
    },
  });
  invalidateExamCatalog();
  res.json({
    papers: result.papers,
    paperCount: result.summary.paperCount,
    firstPaperDate: result.summary.firstPaperDate,
    lastPaperDate: result.summary.lastPaperDate,
  });
});

examsRouter.delete("/:id/papers/:paperId", ...requireRecordsWrite, async (req, res) => {
  const existing = await prisma.examPaperSchedule.findFirst({
    where: { id: req.params.paperId, examId: req.params.id },
  });
  if (!existing) return res.status(404).json({ error: "Exam paper schedule not found" });
  await prisma.examPaperSchedule.delete({ where: { id: existing.id } });
  invalidateExamCatalog();
  res.json({ ok: true });
});

examsRouter.post("/", ...requireRecordsWrite, async (req, res) => {
  const {
    name,
    term,
    date,
    type,
    marksEntryDeadline,
    academicYear,
    consolidationMaxMarks,
    papers,
    includedClassNames,
  } = req.body || {};
  if (!name || !term || !type) {
    return res.status(400).json({ error: "Name, term, and type are required" });
  }
  const classes = parseIncludedClassNames(includedClassNames, { required: true });
  if (classes.error) return res.status(400).json({ error: classes.error });

  const resolvedDate = resolveExamDate({ date, papers });
  if (resolvedDate.error) return res.status(400).json({ error: resolvedDate.error });

  const deadline = marksEntryDeadline !== undefined ? parseDeadlineInput(marksEntryDeadline) : null;
  if (marksEntryDeadline !== undefined && deadline === undefined) {
    return res.status(400).json({ error: "Invalid marks entry deadline" });
  }
  const year =
    (academicYear && String(academicYear).trim()) || academicYearFromDate(resolvedDate.value);
  if (!year) return res.status(400).json({ error: "Academic year is required" });
  const consol = await parseConsolidationMax(consolidationMaxMarks, { required: false });
  if (consol.error) return res.status(400).json({ error: consol.error });

  await ensureConsolidationSchema();
  await ensureExamIncludedClassesColumn();
  const created = await prisma.exam.create({
    data: {
      name,
      term,
      academicYear: year,
      date: resolvedDate.value,
      type,
      tenantId: req.tenantId,
      marksEntryDeadline: deadline,
      includedClassNames: classes.value,
      ...(consol.value != null ? { consolidationMaxMarks: consol.value } : {}),
    },
    include: examListInclude,
  });

  let paperResult = null;
  if (Array.isArray(papers) && papers.length) {
    const allowed = new Set(classes.value);
    const scopedPapers = papers.filter((p) => {
      const cn = p?.className == null ? "" : String(p.className).trim();
      return cn && allowed.has(cn);
    });
    paperResult = await saveExamPapers({
      tenantId: req.tenantId,
      examId: created.id,
      papers: scopedPapers,
      mode: "replace",
    });
    if (paperResult.error) {
      await prisma.exam.delete({ where: { id: created.id } });
      return res.status(400).json({ error: paperResult.error });
    }
    if (paperResult.summary.firstPaperDate) {
      await prisma.exam.update({
        where: { id: created.id },
        data: { date: paperResult.summary.firstPaperDate },
      });
    }
  }

  const fresh = await prisma.exam.findUnique({
    where: { id: created.id },
    include: examListInclude,
  });

  await logActivity({
    actorId: req.user.userId,
    action: "EXAM_CREATED",
    summary: `Created exam ${fresh.name} (${fresh.academicYear})`,
    examId: fresh.id,
    meta: {
      examName: fresh.name,
      academicYear: fresh.academicYear,
      type: fresh.type,
      consolidationMaxMarks: fresh.consolidationMaxMarks,
      includedClassNames: classes.value,
      paperCount: paperResult?.summary?.paperCount ?? 0,
    },
  });
  invalidateExamCatalog();
  res.status(201).json(examJson(fresh));
});

examsRouter.patch("/:id", ...requireRecordsWrite, async (req, res) => {
  const {
    name,
    term,
    date,
    type,
    marksEntryDeadline,
    academicYear,
    consolidationMaxMarks,
    papers,
    includedClassNames,
  } = req.body || {};
  await ensureConsolidationSchema();
  await ensureExamIncludedClassesColumn();
  const existing = await getExamWithConsolidation(req.params.id);
  if (!existing) return res.status(404).json({ error: "Exam not found" });

  const data = {
    ...(name && { name }),
    ...(term && { term }),
    ...(type && { type }),
    ...(academicYear && { academicYear: String(academicYear).trim() }),
  };
  if (date) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: "Invalid exam date" });
    data.date = parsed;
  }
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

  let nextClasses = null;
  if (includedClassNames !== undefined) {
    const parsed = parseIncludedClassNames(includedClassNames, { required: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    data.includedClassNames = parsed.value;
    nextClasses = parsed.value;
  }

  await prisma.exam.update({
    where: { id: req.params.id },
    data,
  });

  if (nextClasses) {
    await prunePapersOutsideClasses(prisma, req.params.id, nextClasses);
  }

  if (Array.isArray(papers)) {
    const allowedList =
      nextClasses ||
      resolveIncludedClassNames(
        { includedClassNames: data.includedClassNames ?? existing.includedClassNames },
        []
      );
    const allowed = new Set(allowedList || []);
    const scopedPapers =
      allowed.size > 0
        ? papers.filter((p) => {
            const cn = p?.className == null ? "" : String(p.className).trim();
            return cn && allowed.has(cn);
          })
        : papers;
    const paperResult = await saveExamPapers({
      tenantId: req.tenantId,
      examId: req.params.id,
      papers: scopedPapers,
      mode: "replace",
    });
    if (paperResult.error) return res.status(400).json({ error: paperResult.error });
    if (paperResult.summary.firstPaperDate && !date) {
      await prisma.exam.update({
        where: { id: req.params.id },
        data: { date: paperResult.summary.firstPaperDate },
      });
    }
  }

  const updated = await prisma.exam.findUnique({
    where: { id: req.params.id },
    include: examListInclude,
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
      includedClassNames: resolveIncludedClassNames(updated),
      paperCount: updated.paperSchedules?.length || 0,
    },
  });
  invalidateExamCatalog();
  res.json(examJson(updated));
});

examsRouter.post("/:id/consolidation/lock", ...requireRecordsWrite, async (req, res) => {
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
  invalidateExamCatalog();
  res.json(examJson({ ...locked, paperSchedules: await listExamPapers(locked.id) }));
});

examsRouter.post("/:id/consolidation/unlock", ...requireRecordsWrite, async (req, res) => {
  await ensureConsolidationSchema();
  const existing = await getExamWithConsolidation(req.params.id);
  if (!existing) return res.status(404).json({ error: "Exam not found" });
  const unlocked = await setExamConsolidationLock(existing.id, false, req.user.userId);
  invalidateExamCatalog();
  res.json(examJson({ ...unlocked, paperSchedules: await listExamPapers(unlocked.id) }));
});

examsRouter.delete("/:id", ...requireRecordsWrite, async (req, res) => {
  const existing = await prisma.exam.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, academicYear: true },
  });
  await prisma.exam.delete({ where: { id: req.params.id } });
  invalidateExamCatalog();
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
