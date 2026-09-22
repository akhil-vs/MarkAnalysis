/**
 * Helpers for Exam.includedClassNames — which school class names sit under a
 * given exam (paper schedule, hall tickets, mark entry scope).
 */

export function normalizeClassNameList(raw) {
  if (raw == null) return null;
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [raw];
          } catch {
            return raw.split(/[,|]/).map((s) => s.trim());
          }
        })()
      : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const name = String(item ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  out.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  return out;
}

/**
 * Parse client input for create/update. Empty / missing → error when required.
 * Returns { value: string[] } or { error }.
 */
export function parseIncludedClassNames(raw, { required = true } = {}) {
  if (raw === undefined) {
    if (required) return { error: "Select at least one class for this exam" };
    return { value: undefined };
  }
  if (raw === null) {
    if (required) return { error: "Select at least one class for this exam" };
    return { value: null };
  }
  const normalized = normalizeClassNameList(raw);
  if (!normalized || normalized.length === 0) {
    return { error: "Select at least one class for this exam" };
  }
  return { value: normalized };
}

/** Classes implied by paper schedule rows (legacy exams without includedClassNames). */
export function classNamesFromPaperSchedules(papers = []) {
  return normalizeClassNameList(
    (papers || []).map((p) => p?.className).filter((c) => c != null && String(c).trim() !== "")
  );
}

/**
 * Public list for API responses. Prefer stored includedClassNames; fall back to
 * paper schedule class names so older exams still show useful scope.
 */
export function resolveIncludedClassNames(exam, papers) {
  const stored = normalizeClassNameList(exam?.includedClassNames);
  if (stored?.length) return stored;
  const fromPapers = classNamesFromPaperSchedules(papers || exam?.paperSchedules || []);
  return fromPapers?.length ? fromPapers : [];
}

export function filterSubjectsForClasses(subjects = [], classNames) {
  const set = new Set(normalizeClassNameList(classNames) || []);
  if (!set.size) return [];
  return (subjects || []).filter((s) => set.has(String(s.className || "").trim()));
}

/**
 * Drop paper schedule rows whose className is no longer included.
 * Papers with null className are kept only when classNames is empty (legacy).
 */
export async function prunePapersOutsideClasses(prismaClient, examId, classNames) {
  const allowed = new Set(normalizeClassNameList(classNames) || []);
  if (!allowed.size) return { deleted: 0 };
  const existing = await prismaClient.examPaperSchedule.findMany({
    where: { examId },
    select: { id: true, className: true },
  });
  const toDelete = existing
    .filter((row) => {
      const cn = row.className == null ? "" : String(row.className).trim();
      if (!cn) return true;
      return !allowed.has(cn);
    })
    .map((row) => row.id);
  if (!toDelete.length) return { deleted: 0 };
  await prismaClient.examPaperSchedule.deleteMany({ where: { id: { in: toDelete } } });
  return { deleted: toDelete.length };
}
