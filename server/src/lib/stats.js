import {
  GRADE_BANDS,
  PASS_PERCENT,
  gradeFromPercent,
  mean,
  median,
  percentOf,
  round1,
} from "./grades.js";
import { isScoredMark } from "./markCodes.js";

export function toPercent(mark) {
  if (!isScoredMark(mark)) return null;
  return percentOf(mark.marksObtained, mark.subject.maxMarks);
}

export function percentsOf(marks) {
  return marks.map(toPercent).filter((p) => p != null);
}

export function meanOf(values) {
  return mean((values || []).filter((v) => v != null && !Number.isNaN(v)));
}

export function summarize(percents) {
  return {
    average: round1(mean(percents)),
    median: round1(median(percents)),
    highest: percents.length ? round1(Math.max(...percents)) : null,
    lowest: percents.length ? round1(Math.min(...percents)) : null,
    passRate: percents.length
      ? round1((percents.filter((p) => p >= PASS_PERCENT).length / percents.length) * 100)
      : 0,
    count: percents.length,
  };
}

export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function studentTotals(marksByStudent) {
  return [...marksByStudent.entries()].map(([studentId, marks]) => {
    const scored = marks.filter(isScoredMark);
    const percents = percentsOf(scored);
    const avg = mean(percents);
    return {
      studentId,
      student: marks[0].student,
      avg: round1(avg),
      grade: gradeFromPercent(avg),
      total: scored.reduce((s, m) => s + (m.marksObtained || 0), 0),
      count: scored.length,
    };
  });
}

export function applyTiedRanks(rows, getScore = (r) => r.percent) {
  const ranked = [...rows].sort((a, b) => (getScore(b) ?? -1) - (getScore(a) ?? -1));
  let lastScore = null;
  let lastRank = 0;
  ranked.forEach((row, i) => {
    const score = getScore(row);
    if (score == null) {
      row.rank = null;
      return;
    }
    if (score === lastScore) row.rank = lastRank;
    else {
      row.rank = i + 1;
      lastRank = row.rank;
      lastScore = score;
    }
  });
  return ranked;
}

export function gradeDistFromStudents(studentAvgs) {
  const gradeDist = Object.fromEntries(GRADE_BANDS.map((b) => [b.grade, 0]));
  for (const s of studentAvgs) {
    if (s.grade) gradeDist[s.grade] += 1;
  }
  return gradeDist;
}

export function examLabel(exam) {
  if (!exam) return "";
  return exam.academicYear ? `${exam.name} · ${exam.academicYear}` : exam.name;
}

export function nextAcademicYear(year) {
  const m = String(year || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function nextClassName(className) {
  const n = Number(className);
  if (!Number.isFinite(n)) return null;
  return String(n + 1);
}

export function academicYearFromDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function pickExam(exams, examId) {
  if (!exams.length) return null;
  if (examId) return exams.find((e) => e.id === examId) || exams[exams.length - 1];
  return exams[exams.length - 1];
}

export function sameTypeExams(exams, exam) {
  return exams
    .filter((e) => e.type === exam.type)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function yearSeries(allMarks, exams, exam, filterFn) {
  return sameTypeExams(exams, exam).map((e) => {
    const list = allMarks.filter((m) => m.examId === e.id && (!filterFn || filterFn(m)));
    return {
      examId: e.id,
      examName: e.name,
      academicYear: e.academicYear,
      label: examLabel(e),
      type: e.type,
      ...summarize(percentsOf(list)),
    };
  });
}

export function withTeacherDeltas(rows) {
  const avgs = rows.map((r) => r.average).filter((v) => v != null);
  const mid = mean(avgs);
  const ranked = [...rows].sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  return {
    teachers: rows.map((r) => ({
      ...r,
      delta: r.average != null && mid != null ? round1(r.average - mid) : null,
    })),
    spread:
      avgs.length >= 2 ? round1(Math.max(...avgs) - Math.min(...avgs)) : 0,
    leader: ranked[0] || null,
    trailer: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    comparable: rows.filter((r) => r.average != null).length >= 2,
  };
}

export function classLabel(cls) {
  return `${cls.className}-${cls.section}`;
}

export function compareClassNames(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function sectionLabel(student) {
  return `${student.classSection.className}-${student.classSection.section}`;
}
