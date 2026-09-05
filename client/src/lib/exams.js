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
