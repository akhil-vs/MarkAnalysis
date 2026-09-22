function toDateInput(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function subjectNameKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

/**
 * Build editable draft rows from subjects + existing paper schedules.
 * One row per subject (subjects are already scoped to a class name).
 */
export function buildPaperDrafts(subjects = [], schedules = []) {
  const bySubject = new Map();
  for (const row of schedules || []) {
    if (!row?.subjectId) continue;
    bySubject.set(row.subjectId, row);
  }
  return (subjects || [])
    .slice()
    .sort((a, b) => {
      const c = String(a.className).localeCompare(String(b.className), undefined, { numeric: true });
      if (c) return c;
      return String(a.name).localeCompare(String(b.name));
    })
    .map((subject) => {
      const existing = bySubject.get(subject.id);
      return {
        subjectId: subject.id,
        subjectName: subject.name,
        className: subject.className,
        paperDate: toDateInput(existing?.paperDate),
        startTime: existing?.startTime || "",
        endTime: existing?.endTime || "",
        venue: existing?.venue || "",
        scheduleId: existing?.id || null,
      };
    });
}

export function papersPayloadFromDrafts(drafts = []) {
  return (drafts || [])
    .filter((row) => row.paperDate)
    .map((row) => ({
      subjectId: row.subjectId,
      className: row.className || null,
      paperDate: row.paperDate,
      startTime: row.startTime || null,
      endTime: row.endTime || null,
      venue: row.venue || null,
    }));
}

export function firstClassFromDrafts(drafts = []) {
  const classes = [
    ...new Set((drafts || []).map((d) => d.className).filter(Boolean)),
  ].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  return classes[0] || "";
}

/**
 * Copy date + start/end times from one class onto every other class, matching
 * subjects by name. Used when the coordinator builds one class timetable and
 * wants peer classes (e.g. 9 → 10) to share it for hall tickets.
 */
export function copyClassScheduleToAll(drafts = [], sourceClass) {
  if (!sourceClass) return drafts || [];
  const sourceRows = (drafts || []).filter(
    (row) => String(row.className) === String(sourceClass) && row.paperDate
  );
  if (!sourceRows.length) return drafts || [];

  const byName = new Map();
  for (const row of sourceRows) {
    const key = subjectNameKey(row.subjectName);
    if (key) byName.set(key, row);
  }

  return (drafts || []).map((row) => {
    if (String(row.className) === String(sourceClass)) return row;
    const source = byName.get(subjectNameKey(row.subjectName));
    if (!source) return row;
    return {
      ...row,
      paperDate: source.paperDate,
      startTime: source.startTime || "",
      endTime: source.endTime || "",
      venue: source.venue || row.venue || "",
    };
  });
}
