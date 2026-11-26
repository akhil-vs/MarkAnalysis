/**
 * Attach the earliest EXAM_CREATED timestamp to each exam.
 * Later edits must not change where a created exam sits in the register.
 */
export function withExamCreatedAt(exams = [], audits = []) {
  const createdAt = new Map();
  const rows = [...audits].sort((a, b) => {
    const ta = Date.parse(a?.timestamp ?? "") || 0;
    const tb = Date.parse(b?.timestamp ?? "") || 0;
    if (ta !== tb) return ta - tb;
    return String(a?.examId || "").localeCompare(String(b?.examId || ""));
  });
  for (const row of rows) {
    if (!row?.examId || row.timestamp == null || row.timestamp === "") continue;
    if (createdAt.has(row.examId)) continue;
    createdAt.set(row.examId, row.timestamp);
  }
  return exams.map((exam) => ({
    ...exam,
    createdAt: createdAt.has(exam.id) ? createdAt.get(exam.id) : (exam.createdAt ?? null),
  }));
}
