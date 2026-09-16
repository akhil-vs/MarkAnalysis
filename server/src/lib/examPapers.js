import { prisma } from "./prisma.js";

export const PAPER_INCLUDE = {
  subject: { select: { id: true, name: true, className: true, maxMarks: true } },
};

export function normalizeClassName(value) {
  if (value == null || value === "") return null;
  return String(value).trim() || null;
}

export function toDateInputValue(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

/**
 * Normalize a client paper row. Returns { error } or { value }.
 * Empty paperDate means "clear / skip" when allowEmpty is true.
 */
export function normalizePaperInput(raw = {}, { allowEmpty = false } = {}) {
  const subjectId = String(raw.subjectId || "").trim();
  if (!subjectId) return { error: "Each paper needs a subject" };

  const paperDateRaw = raw.paperDate;
  if (paperDateRaw == null || paperDateRaw === "") {
    if (allowEmpty) return { value: null };
    return { error: "Each paper needs a date" };
  }
  const paperDate = new Date(paperDateRaw);
  if (Number.isNaN(paperDate.getTime())) return { error: "Invalid paper date" };

  let maxMarks = null;
  if (raw.maxMarks != null && raw.maxMarks !== "") {
    const n = Number(raw.maxMarks);
    if (!Number.isFinite(n) || n < 0) return { error: "Paper max marks must be a number" };
    maxMarks = n;
  }

  return {
    value: {
      subjectId,
      className: normalizeClassName(raw.className),
      paperDate,
      startTime: raw.startTime != null && raw.startTime !== "" ? String(raw.startTime) : null,
      endTime: raw.endTime != null && raw.endTime !== "" ? String(raw.endTime) : null,
      venue: raw.venue != null && raw.venue !== "" ? String(raw.venue) : null,
      maxMarks,
      notes: raw.notes != null && raw.notes !== "" ? String(raw.notes) : null,
    },
  };
}

export function paperScheduleSummary(papers = []) {
  const dated = (papers || [])
    .map((p) => p.paperDate)
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  return {
    paperCount: papers?.length || 0,
    firstPaperDate: dated[0] || null,
    lastPaperDate: dated.length ? dated[dated.length - 1] : null,
  };
}

export async function listExamPapers(examId) {
  return prisma.examPaperSchedule.findMany({
    where: { examId },
    include: PAPER_INCLUDE,
    orderBy: [{ paperDate: "asc" }, { startTime: "asc" }],
  });
}

/**
 * Upsert one paper schedule row for an exam.
 */
export async function upsertExamPaper({ tenantId, examId, paper }) {
  const existing = await prisma.examPaperSchedule.findFirst({
    where: {
      examId,
      subjectId: paper.subjectId,
      className: paper.className,
    },
  });

  const data = {
    paperDate: paper.paperDate,
    startTime: paper.startTime,
    endTime: paper.endTime,
    venue: paper.venue,
    maxMarks: paper.maxMarks,
    notes: paper.notes,
  };

  if (existing) {
    return prisma.examPaperSchedule.update({
      where: { id: existing.id },
      data,
      include: PAPER_INCLUDE,
    });
  }

  return prisma.examPaperSchedule.create({
    data: {
      tenantId,
      examId,
      subjectId: paper.subjectId,
      className: paper.className,
      ...data,
    },
    include: PAPER_INCLUDE,
  });
}

/**
 * Replace or merge paper schedules for an exam.
 * - mode "replace": delete papers not present in the payload (by subjectId+className)
 * - mode "merge" (default): upsert only rows with a date; skip empty dates
 */
export async function saveExamPapers({
  tenantId,
  examId,
  papers = [],
  mode = "merge",
  subjectsById = null,
}) {
  const normalized = [];
  for (const raw of papers) {
    const parsed = normalizePaperInput(raw, { allowEmpty: mode === "replace" || mode === "merge" });
    if (parsed.error) return { error: parsed.error };
    if (!parsed.value) continue;

    let className = parsed.value.className;
    if (className == null && subjectsById?.has(parsed.value.subjectId)) {
      className = normalizeClassName(subjectsById.get(parsed.value.subjectId).className);
    }
    normalized.push({ ...parsed.value, className });
  }

  if (mode === "replace") {
    const keepKeys = new Set(
      normalized.map((p) => `${p.subjectId}::${p.className == null ? "" : p.className}`)
    );
    const existing = await prisma.examPaperSchedule.findMany({
      where: { examId },
      select: { id: true, subjectId: true, className: true },
    });
    const toDelete = existing
      .filter((row) => !keepKeys.has(`${row.subjectId}::${row.className == null ? "" : row.className}`))
      .map((row) => row.id);
    if (toDelete.length) {
      await prisma.examPaperSchedule.deleteMany({ where: { id: { in: toDelete } } });
    }
  }

  const saved = [];
  for (const paper of normalized) {
    const subject = await prisma.subject.findUnique({
      where: { id: paper.subjectId },
      select: { id: true, className: true },
    });
    if (!subject) return { error: `Subject not found: ${paper.subjectId}` };
    if (paper.className == null) {
      paper.className = normalizeClassName(subject.className);
    }
    saved.push(await upsertExamPaper({ tenantId, examId, paper }));
  }

  const all = await listExamPapers(examId);
  return { papers: all, summary: paperScheduleSummary(all) };
}

/** Earliest paper date, or null. */
export function earliestPaperDate(papers = []) {
  const summary = paperScheduleSummary(papers);
  return summary.firstPaperDate;
}
