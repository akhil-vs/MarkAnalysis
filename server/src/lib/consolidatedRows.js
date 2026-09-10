import { gradeFromPercent, percentOf, round1 } from "./grades.js";
import { formatMarkCell, isScoredMark } from "./markCodes.js";
import { applyTiedRanks } from "./stats.js";

/**
 * Ceiling used for consolidated totals and percentages.
 * Falls back to entry maxMarks when the consolidation field is missing.
 */
export function subjectConsolidationMax(subject) {
  if (!subject) return null;
  const value = subject.consolidationMaxMarks ?? subject.maxMarks;
  return value == null ? null : Number(value);
}

/**
 * Convert an entered score onto the consolidation ceiling.
 * Percent is obtained / entry max, so it stays within 0–100 when the
 * register rejected scores above Max marks — even if the consolidation
 * ceiling is lower (the Chemistry / dual-ceiling case).
 */
export function scaleMarksToConsolidation(marksObtained, subject) {
  if (marksObtained == null) return null;
  const obtained = Number(marksObtained);
  if (!Number.isFinite(obtained)) return null;
  const entryMax = subject?.maxMarks == null ? null : Number(subject.maxMarks);
  const ceil = subjectConsolidationMax(subject);
  if (entryMax == null || entryMax <= 0 || ceil == null) {
    return ceil == null ? obtained : round1(Math.min(ceil, Math.max(0, obtained)));
  }
  if (entryMax === ceil) return round1(Math.min(ceil, Math.max(0, obtained)));
  return round1(Math.min(ceil, Math.max(0, (obtained / entryMax) * ceil)));
}

function scoredConsolidated(mark, subject) {
  if (!isScoredMark(mark) || mark?.marksObtained == null) return null;
  const ceil = subjectConsolidationMax(subject);
  const scaled = scaleMarksToConsolidation(mark.marksObtained, subject);
  const percent = percentOf(mark.marksObtained, subject?.maxMarks ?? ceil);
  return { scaled, percent, ceil };
}

/**
 * Build per-student totals, percents, grades, and tied ranks from entered marks.
 * Draft/submitted papers count toward provisional totals so bulk uploads and
 * incomplete previews still show standing; "ready" remains approval-gated.
 */
export function buildConsolidatedStudentRows(students, subjects, marks) {
  const rows = students.map((student) => {
    const bySubject = {};
    let obtained = 0;
    let maxForEntered = 0;
    let papers = 0;
    let approvedPapers = 0;
    for (const subject of subjects) {
      const mark = marks.find((m) => m.studentId === student.id && m.subjectId === subject.id);
      const scored = mark ? scoredConsolidated(mark, subject) : null;
      const ceil = scored?.ceil ?? subjectConsolidationMax(subject);
      const percent = scored?.percent ?? null;
      const scaled = scored?.scaled ?? null;
      const display =
        mark && !isScoredMark(mark) ? formatMarkCell(mark) : scaled == null ? "" : String(scaled);
      bySubject[subject.id] = {
        marks: scaled,
        display,
        outcome: mark?.outcome || null,
        max: ceil,
        percent,
        grade: gradeFromPercent(percent),
        status: mark ? mark.status : "MISSING",
      };
      if (mark) {
        if (mark.status === "APPROVED") approvedPapers += 1;
        papers += 1;
        if (scored) {
          obtained += scaled || 0;
          maxForEntered += ceil || 0;
        }
      }
    }
    const percent = maxForEntered > 0 ? Math.min(100, round1((obtained / maxForEntered) * 100)) : null;
    return {
      studentId: student.id,
      rollNo: student.rollNo,
      name: student.name,
      bySubject,
      total: papers ? round1(obtained) : null,
      maxTotal: papers
        ? maxForEntered
        : subjects.reduce((s, x) => s + (subjectConsolidationMax(x) || 0), 0),
      percent,
      grade: gradeFromPercent(percent),
      papers,
      approvedPapers,
    };
  });

  const ranked = applyTiedRanks(rows);
  const rankById = Object.fromEntries(ranked.map((r) => [r.studentId, r.rank]));
  for (const row of rows) row.rank = rankById[row.studentId];
  return rows;
}
