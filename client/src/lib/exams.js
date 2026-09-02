export function examLabel(exam) {
  if (!exam) return "";
  return exam.academicYear ? `${exam.name} · ${exam.academicYear}` : exam.name;
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
