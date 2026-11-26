export function examLabel(exam) {
  if (!exam) return "";
  return exam.academicYear ? `${exam.name} · ${exam.academicYear}` : exam.name;
}

export function isExamOpen(exam) {
  if (!exam?.marksEntryDeadline) return true;
  const end = new Date(exam.marksEntryDeadline);
  end.setHours(23, 59, 59, 999);
  return Date.now() <= end.getTime();
}

/**
 * Default to the latest exam for every role so teachers and leadership
 * look at the same paper. Preferring only "open" deadlines made teachers
 * land on Mid-Term while principals opened Final — marks looked "approved"
 * on the teacher desk and missing on leadership views.
 */
export function defaultExamId(exams = [], { preferOpen = false } = {}) {
  if (!exams.length) return "";
  // preferOpen kept for call-site compatibility; latest exam wins so roles stay aligned.
  void preferOpen;
  return exams.at(-1).id;
}

export function yearDelta(series, examId) {
  if (!series?.length) return null;
  const current = series.find((p) => p.examId === examId) || series.at(-1);
  const idx = series.findIndex((p) => p.examId === current?.examId);
  const prev = idx > 0 ? series[idx - 1] : null;
  if (current?.average == null || prev?.average == null) return null;
  const diff = Math.round((current.average - prev.average) * 10) / 10;
  return { current, prev, diff };
}

export const EXAM_TYPE_LABEL = {
  UNIT_TEST: "Unit test",
  MID_TERM: "Mid-term",
  FINAL: "Final",
};

export function examTypeLabel(type) {
  return EXAM_TYPE_LABEL[type] || String(type || "Exam");
}

export function examIsLocked(row) {
  return Boolean(row?.consolidationLocked || row?.consolidation?.maxMarksLocked);
}

function timeValue(value) {
  if (value == null || value === "") return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/**
 * Register order: exams with a known creation time first (newest created at the top),
 * then exams that only have a window date (latest window first).
 * API lists stay date-ascending so other desks still treat the last row as the latest exam.
 */
export function compareExamsForRegister(a, b) {
  const aCreated = timeValue(a?.createdAt);
  const bCreated = timeValue(b?.createdAt);
  if (aCreated != null && bCreated != null && aCreated !== bCreated) return bCreated - aCreated;
  if (aCreated != null && bCreated == null) return -1;
  if (aCreated == null && bCreated != null) return 1;
  const aDate = timeValue(a?.firstPaperDate) ?? timeValue(a?.date) ?? 0;
  const bDate = timeValue(b?.firstPaperDate) ?? timeValue(b?.date) ?? 0;
  if (aDate !== bDate) return bDate - aDate;
  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

export function sortExamsForRegister(exams = []) {
  return [...exams].sort(compareExamsForRegister);
}

export function formatExamDate(value) {
  const t = timeValue(value);
  if (t == null) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(t));
}

export function formatExamWindow(row) {
  const first = row?.firstPaperDate || row?.date;
  const last = row?.lastPaperDate || row?.firstPaperDate || row?.date;
  const aTime = timeValue(first);
  const bTime = timeValue(last);
  if (aTime == null) return "—";
  const a = new Date(aTime);
  const b = bTime == null ? a : new Date(bTime);
  if (a.toDateString() === b.toDateString()) return formatExamDate(a);
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  if (sameMonth) {
    const month = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(a);
    return `${a.getDate()}–${b.getDate()} ${month}`;
  }
  const sameYear = a.getFullYear() === b.getFullYear();
  if (sameYear) {
    const left = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(a);
    return `${left} – ${formatExamDate(b)}`;
  }
  return `${formatExamDate(a)} – ${formatExamDate(b)}`;
}

export function examClassPreview(names = [], limit = 4) {
  const list = [...new Set((names || []).map((name) => String(name).trim()).filter(Boolean))];
  return {
    shown: list.slice(0, limit),
    extra: Math.max(0, list.length - limit),
    total: list.length,
    all: list,
  };
}

export function examEntryState(exam, now = Date.now()) {
  if (!exam?.marksEntryDeadline) {
    return { label: "No deadline", tone: "muted", detail: "Still open" };
  }
  const end = new Date(exam.marksEntryDeadline);
  if (Number.isNaN(end.getTime())) {
    return { label: "No deadline", tone: "muted", detail: "Still open" };
  }
  end.setHours(23, 59, 59, 999);
  const open = now <= end.getTime();
  return {
    label: open ? "Open" : "Closed",
    tone: open ? "open" : "closed",
    detail: formatExamDate(exam.marksEntryDeadline),
  };
}

export function examReadinessState(exam) {
  const readiness = exam?.readiness || {};
  const paperCount = Number(exam?.paperCount ?? exam?.paperSchedules?.length ?? 0) || 0;
  const missing = Number(readiness.papersMissingDates) || 0;
  const papers = missing === 1 ? "1 undated" : `${missing} undated`;
  const countLabel = `${paperCount} paper${paperCount === 1 ? "" : "s"}`;
  if (missing > 0) return { label: "Dates missing", tone: "warn", detail: papers };
  if (!readiness.hasPapers && paperCount === 0) {
    return { label: "No papers", tone: "muted", detail: "Set paper dates" };
  }
  if (examIsLocked(exam)) return { label: "Locked", tone: "good", detail: countLabel };
  return { label: "Ready", tone: "good", detail: countLabel };
}

export function examRegisterStats(exams = [], now = Date.now()) {
  let entryOpen = 0;
  let needsDates = 0;
  let locked = 0;
  for (const exam of exams) {
    const entry = examEntryState(exam, now);
    if (entry.label !== "Closed") entryOpen += 1;
    const readiness = examReadinessState(exam);
    if (readiness.label === "Dates missing" || readiness.label === "No papers") needsDates += 1;
    if (examIsLocked(exam)) locked += 1;
  }
  return {
    scheduled: exams.length,
    entryOpen,
    needsDates,
    locked,
  };
}
