import { isScoredMark } from "./markCodes.js";

/** Theory + optional practical ceiling for entry and percentages. */
export function subjectEntryMax(subject) {
  if (!subject) return null;
  const theory = subject.maxMarks == null ? null : Number(subject.maxMarks);
  if (theory == null || !Number.isFinite(theory)) return null;
  const practical =
    subject.practicalMaxMarks == null ? 0 : Number(subject.practicalMaxMarks);
  const extra = Number.isFinite(practical) && practical > 0 ? practical : 0;
  return theory + extra;
}

export function subjectHasPractical(subject) {
  const practical = subject?.practicalMaxMarks;
  return practical != null && Number(practical) > 0;
}

/** Combined obtained marks for a scored paper (theory + practical). */
export function markObtainedTotal(mark) {
  if (!mark || !isScoredMark(mark)) return null;
  const theory = mark.marksObtained == null ? 0 : Number(mark.marksObtained);
  const practical = mark.practicalMarks == null ? 0 : Number(mark.practicalMarks);
  const t = Number.isFinite(theory) ? theory : 0;
  const p = Number.isFinite(practical) ? practical : 0;
  return t + p;
}

export function formatSubjectMaxLabel(subject) {
  if (!subject) return "";
  if (!subjectHasPractical(subject)) return String(subject.maxMarks ?? "");
  return `${subject.maxMarks}+${subject.practicalMaxMarks}`;
}
