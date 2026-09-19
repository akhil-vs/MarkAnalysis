/**
 * Helpers to aggregate marks without repeated O(n) filters per subject/assignment.
 */
import { groupBy, toPercent } from "./stats.js";
import { mean, pearson, PASS_PERCENT, round1 } from "./grades.js";

/** Map subjectId → marks[] */
export function indexMarksBySubject(marks) {
  return groupBy(marks, (m) => m.subjectId);
}

/** Map `${subjectId}|${classSectionId}` → marks[] */
export function indexMarksByPaper(marks) {
  const map = new Map();
  for (const m of marks) {
    const classSectionId = m.student?.classSectionId;
    if (!m.subjectId || !classSectionId) continue;
    const key = `${m.subjectId}|${classSectionId}`;
    let list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    list.push(m);
  }
  return map;
}

export function marksForPaper(index, subjectId, classSectionId) {
  if (!subjectId || !classSectionId) return [];
  return index.get(`${subjectId}|${classSectionId}`) || [];
}

/** Subject difficulty rows from an indexed mark map. */
export function subjectDifficulty(subjects, marksBySubject) {
  return subjects
    .map((subject) => {
      const list = (marksBySubject.get(subject.id) || [])
        .map(toPercent)
        .filter((p) => p != null);
      return {
        subjectId: subject.id,
        name: subject.name,
        average: round1(mean(list)),
        passRate: list.length
          ? round1((list.filter((p) => p >= PASS_PERCENT).length / list.length) * 100)
          : 0,
        count: list.length,
      };
    })
    .sort((a, b) => (a.average ?? 100) - (b.average ?? 100));
}

/** Per-assignment averages using a paper index. */
export function teacherSubjectAverages(assignments, marksByPaper) {
  return assignments.map((a) => {
    const list = marksForPaper(marksByPaper, a.subjectId, a.classSectionId)
      .map(toPercent)
      .filter((p) => p != null);
    return {
      teacher: a.user.name,
      subject: a.subject.name,
      classLabel: `${a.classSection.className}-${a.classSection.section}`,
      average: round1(mean(list)),
      passRate: list.length
        ? round1((list.filter((p) => p >= PASS_PERCENT).length / list.length) * 100)
        : null,
    };
  });
}

/** Pairwise subject correlations — groupBy students once. */
export function subjectCorrelations(marks, subjectNames) {
  const uniqueNames = [...new Set(subjectNames)];
  const byStudent = groupBy(marks, (m) => m.studentId);
  const correlations = [];
  for (let i = 0; i < uniqueNames.length; i++) {
    for (let j = i + 1; j < uniqueNames.length; j++) {
      const a = uniqueNames[i];
      const b = uniqueNames[j];
      const pairs = [];
      for (const [, list] of byStudent) {
        const ma = list.find((m) => m.subject.name === a);
        const mb = list.find((m) => m.subject.name === b);
        if (ma && mb) {
          const pa = toPercent(ma);
          const pb = toPercent(mb);
          if (pa != null && pb != null) pairs.push([pa, pb]);
        }
      }
      const r = pearson(
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1])
      );
      if (r != null) correlations.push({ a, b, r });
    }
  }
  return correlations;
}

/** Keep only teachers still pending upload or awaiting approval (home dashboards). */
export function slimPendingUploads(pendingUploads) {
  if (!pendingUploads?.teachers) return pendingUploads;
  const teachers = pendingUploads.teachers.filter((t) => t.pending || t.awaitingApproval);
  return { ...pendingUploads, teachers };
}
