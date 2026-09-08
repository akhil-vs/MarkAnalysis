import { gradeFromPercent, percentOf, round1 } from "./grades.js";
import { formatMarkCell, isScoredMark } from "./markCodes.js";
import { applyTiedRanks } from "./stats.js";

function markPercent(mark, subject) {
  if (!isScoredMark(mark)) return null;
  return percentOf(mark?.marksObtained, subject.maxMarks);
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
      const percent = mark ? markPercent(mark, subject) : null;
      bySubject[subject.id] = {
        marks: mark && isScoredMark(mark) ? mark.marksObtained : null,
        display: formatMarkCell(mark),
        outcome: mark?.outcome || null,
        max: subject.maxMarks,
        percent,
        grade: gradeFromPercent(percent),
        status: mark ? mark.status : "MISSING",
      };
      if (mark) {
        if (mark.status === "APPROVED") approvedPapers += 1;
        papers += 1;
        if (isScoredMark(mark)) {
          obtained += mark.marksObtained || 0;
          maxForEntered += subject.maxMarks;
        }
      }
    }
    const percent = maxForEntered > 0 ? round1((obtained / maxForEntered) * 100) : null;
    return {
      studentId: student.id,
      rollNo: student.rollNo,
      name: student.name,
      bySubject,
      total: papers ? round1(obtained) : null,
      maxTotal: papers ? maxForEntered : subjects.reduce((s, x) => s + x.maxMarks, 0),
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
