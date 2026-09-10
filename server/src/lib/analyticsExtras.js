import {
  gradeFromPercent as defaultGradeFromPercent,
  mean,
  median,
  percentOf,
  round1,
} from "./grades.js";
import { isScoredMark, OUTCOME_LABELS } from "./markCodes.js";
import {
  applyTiedRanks,
  classLabel,
  groupBy,
  nextAcademicYear,
  nextClassName,
  sectionLabel,
  studentTotals,
} from "./stats.js";
import { summarizeRegister } from "./registerStatus.js";

export function toPercentWith(mark, maxField = "maxMarks") {
  if (!isScoredMark(mark)) return null;
  const max = mark.subject?.[maxField] ?? mark.subject?.maxMarks;
  return percentOf(mark.marksObtained, max);
}

export function outcomeBreakdown(marks = []) {
  const counts = { SCORED: 0, ABSENT: 0, EXEMPT: 0, WITHHELD: 0, total: marks.length };
  for (const m of marks) {
    const key = m.outcome && m.outcome !== "SCORED" ? m.outcome : "SCORED";
    counts[key] = (counts[key] || 0) + 1;
  }
  const total = marks.length || 1;
  return {
    ...counts,
    rates: {
      scored: round1((counts.SCORED / total) * 100),
      absent: round1((counts.ABSENT / total) * 100),
      exempt: round1((counts.EXEMPT / total) * 100),
      withheld: round1((counts.WITHHELD / total) * 100),
    },
    labels: OUTCOME_LABELS,
  };
}

/** Percent bands 0–9, 10–19, …, 90–100 for scored marks. */
export function markBandHistogram(marks = []) {
  const bands = Array.from({ length: 10 }, (_, i) => {
    const min = i * 10;
    const max = i === 9 ? 100 : min + 9;
    return { key: `${min}-${max}`, min, max: i === 9 ? 100 : max, count: 0 };
  });
  for (const m of marks) {
    const p = toPercentWith(m);
    if (p == null) continue;
    const idx = Math.min(9, Math.floor(p / 10));
    bands[idx].count += 1;
  }
  return bands;
}

export function distinctionFailLists(marks, { passPercent = 50, distinctionMin = 90, gradeFn = defaultGradeFromPercent } = {}) {
  const studentAvgs = studentTotals(groupBy(marks, (m) => m.studentId));
  const ranked = applyTiedRanks(
    studentAvgs.map((s) => ({
      ...s,
      percent: s.avg,
      name: s.student?.name,
      rollNo: s.student?.rollNo,
      classLabel: s.student ? sectionLabel(s.student) : "—",
      grade: gradeFn(s.avg),
    })),
    (r) => r.percent
  );

  const distinction = ranked.filter((s) => (s.avg ?? -1) >= distinctionMin);
  const fail = ranked.filter((s) => s.avg != null && s.avg < passPercent).reverse();

  const bySubjectFail = [];
  const bySubject = groupBy(marks.filter(isScoredMark), (m) => m.subject.name);
  for (const [subject, list] of bySubject.entries()) {
    const fails = list
      .map((m) => ({
        studentId: m.studentId,
        name: m.student?.name,
        rollNo: m.student?.rollNo,
        classLabel: m.student ? sectionLabel(m.student) : "—",
        percent: toPercentWith(m),
        marks: m.marksObtained,
        max: m.subject.maxMarks,
      }))
      .filter((r) => r.percent != null && r.percent < passPercent)
      .sort((a, b) => a.percent - b.percent);
    if (fails.length) bySubjectFail.push({ subject, count: fails.length, students: fails.slice(0, 25) });
  }

  return {
    counts: {
      distinction: distinction.length,
      pass: ranked.filter((s) => s.avg != null && s.avg >= passPercent).length,
      fail: fail.length,
      students: ranked.filter((s) => s.avg != null).length,
    },
    distinction: distinction.slice(0, 50),
    fail: fail.slice(0, 50),
    bySubjectFail: bySubjectFail.sort((a, b) => b.count - a.count),
  };
}

export function consistencyScore(subjectPercents = []) {
  const vals = subjectPercents.filter((v) => v != null);
  if (vals.length < 2) return null;
  const avg = mean(vals);
  const variance = mean(vals.map((v) => (v - avg) ** 2));
  const stdev = Math.sqrt(variance);
  // Higher = more consistent (invert capped stdev)
  const score = Math.max(0, Math.min(100, round1(100 - stdev * 2)));
  return { score, stdev: round1(stdev), average: round1(avg), subjects: vals.length };
}

export function divisionGapMatrix(marks, sections, subjectNames) {
  const matrix = [];
  const gaps = [];
  for (const subject of subjectNames) {
    const row = { subject, sections: {} };
    const avgs = [];
    for (const sec of sections) {
      const list = marks.filter(
        (m) => m.subject.name === subject && m.student.classSectionId === sec.id
      );
      const percents = list.map(toPercentWith).filter((p) => p != null);
      const average = percents.length ? round1(mean(percents)) : null;
      row.sections[sec.section] = { average, count: percents.length, classSectionId: sec.id };
      if (average != null) avgs.push({ section: sec.section, average, id: sec.id });
    }
    if (avgs.length >= 2) {
      const sorted = [...avgs].sort((a, b) => b.average - a.average);
      const gap = round1(sorted[0].average - sorted[sorted.length - 1].average);
      row.gap = gap;
      row.leader = sorted[0];
      row.trailer = sorted[sorted.length - 1];
      gaps.push({ subject, gap, leader: sorted[0], trailer: sorted[sorted.length - 1] });
    } else {
      row.gap = null;
    }
    matrix.push(row);
  }
  gaps.sort((a, b) => b.gap - a.gap);
  return { matrix, largestGaps: gaps.slice(0, 10), sections: sections.map((s) => s.section) };
}

export function passFailMatrix(marks, subjects, { passPercent = 50 } = {}) {
  return subjects.map((subject) => {
    const list = marks.filter((m) => (typeof subject === "string" ? m.subject.name === subject : m.subjectId === subject.id));
    const scored = list.filter(isScoredMark);
    const percents = scored.map(toPercentWith).filter((p) => p != null);
    const pass = percents.filter((p) => p >= passPercent).length;
    const fail = percents.filter((p) => p < passPercent).length;
    return {
      subject: typeof subject === "string" ? subject : subject.name,
      pass,
      fail,
      absent: list.filter((m) => m.outcome === "ABSENT").length,
      exempt: list.filter((m) => m.outcome === "EXEMPT").length,
      withheld: list.filter((m) => m.outcome === "WITHHELD").length,
      passRate: percents.length ? round1((pass / percents.length) * 100) : null,
      average: percents.length ? round1(mean(percents)) : null,
      count: percents.length,
    };
  });
}

export function completenessHeatmap(assignments, studentsByClass, marks, examId) {
  return assignments.map((a) => {
    const expected = (studentsByClass.get(a.classSectionId) || []).length;
    const list = marks.filter(
      (m) =>
        m.examId === examId &&
        m.subjectId === a.subjectId &&
        m.student.classSectionId === a.classSectionId
    );
    const reg = summarizeRegister(expected, list);
    return {
      teacherId: a.userId,
      teacher: a.user?.name,
      subject: a.subject.name,
      subjectId: a.subjectId,
      classSectionId: a.classSectionId,
      classLabel: classLabel(a.classSection),
      ...reg,
    };
  });
}

export function improvementCohorts(currentMarks, previousMarks, { improveMin = 4, declineMax = -4, passPercent = 50 } = {}) {
  const curr = new Map(studentTotals(groupBy(currentMarks, (m) => m.studentId)).map((s) => [s.studentId, s]));
  const prev = new Map(studentTotals(groupBy(previousMarks, (m) => m.studentId)).map((s) => [s.studentId, s]));
  const rows = [];
  for (const [id, c] of curr.entries()) {
    const p = prev.get(id);
    if (!p || c.avg == null || p.avg == null) continue;
    const delta = round1(c.avg - p.avg);
    rows.push({
      studentId: id,
      name: c.student?.name,
      rollNo: c.student?.rollNo,
      classLabel: c.student ? sectionLabel(c.student) : "—",
      current: c.avg,
      previous: p.avg,
      delta,
      grade: c.grade,
    });
  }
  const improving = rows.filter((r) => r.delta >= improveMin).sort((a, b) => b.delta - a.delta);
  const declining = rows.filter((r) => r.delta <= declineMax).sort((a, b) => a.delta - b.delta);
  const recovered = rows.filter((r) => r.previous < passPercent && r.current >= passPercent);
  const slipped = rows.filter((r) => r.previous >= passPercent && r.current < passPercent);
  return {
    improving: improving.slice(0, 40),
    declining: declining.slice(0, 40),
    recovered: recovered.slice(0, 40),
    slipped: slipped.slice(0, 40),
    summary: {
      compared: rows.length,
      improving: improving.length,
      declining: declining.length,
      recovered: recovered.length,
      slipped: slipped.length,
      avgDelta: rows.length ? round1(mean(rows.map((r) => r.delta))) : null,
    },
  };
}

export function promotionCarryForward(students, marksByYear, fromYear, toYear) {
  const promoted = students.filter((s) => s.status === "ACTIVE" && s.promotedFromId && s.academicYear === toYear);
  const rows = [];
  for (const s of promoted) {
    const prior = students.find((x) => x.id === s.promotedFromId);
    if (!prior) continue;
    const priorMarks = marksByYear.filter((m) => m.studentId === prior.id);
    const currMarks = marksByYear.filter((m) => m.studentId === s.id);
    const priorAvg = mean(priorMarks.map(toPercentWith).filter((p) => p != null));
    const currAvg = mean(currMarks.map(toPercentWith).filter((p) => p != null));
    rows.push({
      studentId: s.id,
      name: s.name,
      fromClass: prior.classSection ? classLabel(prior.classSection) : prior.classSectionId,
      toClass: s.classSection ? classLabel(s.classSection) : s.classSectionId,
      previousAvg: round1(priorAvg),
      currentAvg: round1(currAvg),
      delta: priorAvg != null && currAvg != null ? round1(currAvg - priorAvg) : null,
    });
  }
  const withBoth = rows.filter((r) => r.delta != null);
  return {
    fromYear,
    toYear,
    count: rows.length,
    averageDelta: withBoth.length ? round1(mean(withBoth.map((r) => r.delta))) : null,
    students: rows.sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).slice(0, 60),
  };
}

export function teacherLoadOutcomes(assignments, marks, studentsByClass, { passPercent = 50 } = {}) {
  const byTeacher = groupBy(assignments, (a) => a.userId);
  return [...byTeacher.entries()].map(([teacherId, assigns]) => {
    const teacher = assigns[0].user;
    let studentIds = new Set();
    const paperRows = [];
    const allPercents = [];
    let absent = 0;
    let scored = 0;
    for (const a of assigns) {
      const expected = (studentsByClass.get(a.classSectionId) || []).map((s) => s.id);
      expected.forEach((id) => studentIds.add(id));
      const list = marks.filter(
        (m) => m.subjectId === a.subjectId && m.student.classSectionId === a.classSectionId
      );
      const percents = list.map(toPercentWith).filter((p) => p != null);
      absent += list.filter((m) => m.outcome === "ABSENT").length;
      scored += list.filter(isScoredMark).length;
      allPercents.push(...percents);
      paperRows.push({
        subject: a.subject.name,
        classLabel: classLabel(a.classSection),
        students: expected.length,
        average: percents.length ? round1(mean(percents)) : null,
        passRate: percents.length
          ? round1((percents.filter((p) => p >= passPercent).length / percents.length) * 100)
          : null,
      });
    }
    return {
      teacherId,
      teacher: teacher?.name,
      papers: assigns.length,
      studentsTaught: studentIds.size,
      average: allPercents.length ? round1(mean(allPercents)) : null,
      passRate: allPercents.length
        ? round1((allPercents.filter((p) => p >= passPercent).length / allPercents.length) * 100)
        : null,
      absenceRate: scored + absent > 0 ? round1((absent / (scored + absent)) * 100) : null,
      loadIndex:
        allPercents.length && studentIds.size
          ? round1((allPercents.length > 0 ? mean(allPercents) : 0) * Math.log10(studentIds.size + 1))
          : null,
      registers: paperRows,
    };
  }).sort((a, b) => (b.studentsTaught || 0) - (a.studentsTaught || 0));
}

export function registerVelocity(assignments, marks, exam, studentsByClass) {
  const deadline = exam.marksEntryDeadline ? new Date(exam.marksEntryDeadline) : null;
  return assignments.map((a) => {
    const expected = (studentsByClass.get(a.classSectionId) || []).length;
    const list = marks.filter(
      (m) =>
        m.examId === exam.id &&
        m.subjectId === a.subjectId &&
        m.student.classSectionId === a.classSectionId
    );
    const times = list.map((m) => new Date(m.updatedAt).getTime()).filter((t) => !Number.isNaN(t));
    const firstAt = times.length ? new Date(Math.min(...times)) : null;
    const lastAt = times.length ? new Date(Math.max(...times)) : null;
    const daysToFirst =
      firstAt && exam.date
        ? round1((firstAt - new Date(exam.date)) / (1000 * 60 * 60 * 24))
        : null;
    const daysAfterDeadline =
      deadline && lastAt ? round1((lastAt - deadline) / (1000 * 60 * 60 * 24)) : null;
    const reg = summarizeRegister(expected, list);
    return {
      teacherId: a.userId,
      teacher: a.user?.name,
      subject: a.subject.name,
      classLabel: classLabel(a.classSection),
      firstEntryAt: firstAt,
      lastEntryAt: lastAt,
      daysToFirst,
      daysAfterDeadline,
      breachedDeadline: deadline ? !list.length || (lastAt && lastAt > deadline && reg.missing > 0) || (deadline < new Date() && reg.status !== "APPROVED") : false,
      ...reg,
    };
  });
}

export function examReadiness({ exam, assignments, marks, studentsByClass, accessRequests = [] }) {
  const heatmap = completenessHeatmap(assignments, studentsByClass, marks, exam.id);
  const total = heatmap.length || 1;
  const approved = heatmap.filter((r) => r.status === "APPROVED").length;
  const awaiting = heatmap.filter((r) => r.status === "AWAITING_APPROVAL").length;
  const partial = heatmap.filter((r) => r.status === "PARTIAL").length;
  const missing = heatmap.filter((r) => r.status === "MISSING").length;
  const deadline = exam.marksEntryDeadline ? new Date(exam.marksEntryDeadline) : null;
  const pastDeadline = deadline ? Date.now() > deadline.getTime() : false;
  const latePending = accessRequests.filter((r) => r.status === "PENDING" && r.kind !== "EDIT").length;
  const editPending = accessRequests.filter((r) => r.status === "PENDING" && r.kind === "EDIT").length;
  const velocity = registerVelocity(assignments, marks, exam, studentsByClass);
  const breached = velocity.filter((v) => pastDeadline && v.status !== "APPROVED").length;

  return {
    exam,
    pastDeadline,
    deadline: exam.marksEntryDeadline,
    kpis: {
      registers: heatmap.length,
      approvedPct: round1((approved / total) * 100),
      awaiting,
      partial,
      missing,
      breached,
      latePending,
      editPending,
    },
    heatmap,
    velocity: velocity.sort((a, b) => (b.daysAfterDeadline ?? -999) - (a.daysAfterDeadline ?? -999)).slice(0, 40),
  };
}

export function dualCeilingWarnings(subjects = []) {
  return subjects
    .filter((s) => s.consolidationMaxMarks != null && s.consolidationMaxMarks !== s.maxMarks)
    .map((s) => ({
      id: s.id,
      name: s.name,
      className: s.className,
      maxMarks: s.maxMarks,
      consolidationMaxMarks: s.consolidationMaxMarks,
    }));
}

export function weightedAnnualForStudent(marks, exams, weights, gradeFn = defaultGradeFromPercent) {
  // weights: { UNIT_TEST: 0.2, MID_TERM: 0.3, FINAL: 0.5 }
  const byType = new Map();
  for (const exam of exams) {
    const list = marks.filter((m) => m.examId === exam.id && isScoredMark(m));
    const percents = list.map(toPercentWith).filter((p) => p != null);
    if (!percents.length) continue;
    const avg = mean(percents);
    if (!byType.has(exam.type)) byType.set(exam.type, []);
    byType.get(exam.type).push(avg);
  }
  let weighted = 0;
  let weightSum = 0;
  const components = [];
  for (const [type, avgs] of byType.entries()) {
    const w = weights?.[type] ?? 0;
    const avg = mean(avgs);
    if (w > 0 && avg != null) {
      weighted += avg * w;
      weightSum += w;
      components.push({ type, average: round1(avg), weight: w });
    }
  }
  if (!weightSum) return null;
  const composite = round1(weighted / weightSum);
  return { composite, grade: gradeFn(composite), components, weightSum: round1(weightSum) };
}

export function suggestPromotionYears(exams) {
  const years = [...new Set(exams.map((e) => e.academicYear).filter(Boolean))].sort();
  if (years.length < 2) return { fromYear: years[0] || null, toYear: years[0] ? nextAcademicYear(years[0]) : null, years };
  return { fromYear: years[years.length - 2], toYear: years[years.length - 1], years };
}

export { nextAcademicYear, nextClassName, median };
