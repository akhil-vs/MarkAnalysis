/** Discrete class + subject filters for the Timetables → Teachers accordion. */

export const TEACHER_TIMETABLE_FILTERS = [
  {
    key: "classSectionId",
    match: (teacher, value) =>
      (teacher.assignments || []).some((assignment) => assignment.classSection?.id === value),
  },
  {
    key: "subjectName",
    match: (teacher, value) =>
      (teacher.assignments || []).some((assignment) => assignment.subject?.name === value),
  },
];

function classSectionLabel(classSection) {
  if (!classSection) return "";
  if (classSection.label) return classSection.label;
  return [classSection.className, classSection.section].filter(Boolean).join("-");
}

function compareLabels(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** Unique assigned class sections, sorted like 5-A, 5-B, 10-A. */
export function teacherClassOptions(teachers) {
  const byId = new Map();
  for (const teacher of teachers || []) {
    for (const assignment of teacher.assignments || []) {
      const id = assignment.classSection?.id;
      const label = classSectionLabel(assignment.classSection);
      if (id && label && !byId.has(id)) byId.set(id, label);
    }
  }
  return [...byId.entries()]
    .sort((a, b) => compareLabels(a[1], b[1]))
    .map(([id, label]) => ({ id, label }));
}

/** Unique assigned subject names, sorted alphabetically. */
export function teacherSubjectOptions(teachers) {
  return [
    ...new Set(
      (teachers || []).flatMap((teacher) =>
        (teacher.assignments || []).map((assignment) => assignment.subject?.name).filter(Boolean)
      )
    ),
  ].sort(compareLabels);
}

export function teacherMatchesFilters(teacher, filters = {}) {
  for (const def of TEACHER_TIMETABLE_FILTERS) {
    const value = filters[def.key] ?? "";
    if (value !== "" && !def.match(teacher, value)) return false;
  }
  return true;
}
