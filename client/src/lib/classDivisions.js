/** Default division labels for one-click fill on the Records → Classes form. */
export const QUICK_SECTIONS = ["A", "B", "C", "D"];

let rowSeq = 0;

export function nextDivisionRowId() {
  rowSeq += 1;
  return `div-${rowSeq}-${Date.now().toString(36)}`;
}

export function emptyDivisionRow(section = "") {
  return { key: nextDivisionRowId(), section, classTeacherId: "" };
}

export function emptyMultiClassForm(className = "10") {
  return {
    className,
    divisions: [emptyDivisionRow()],
  };
}

/**
 * Merge quick-fill section labels into existing rows.
 * Fills blank rows first, then appends any labels still missing (case-insensitive).
 */
export function applyQuickSections(divisions = [], labels = QUICK_SECTIONS) {
  const rows = (divisions || []).map((row) => ({ ...row }));
  const wanted = (labels || []).map((s) => String(s || "").trim()).filter(Boolean);
  if (!wanted.length) return rows.length ? rows : [emptyDivisionRow()];

  const present = new Set(
    rows.map((r) => String(r.section || "").trim().toLowerCase()).filter(Boolean)
  );

  let blankIdx = 0;
  for (const label of wanted) {
    const key = label.toLowerCase();
    if (present.has(key)) continue;
    while (blankIdx < rows.length && String(rows[blankIdx].section || "").trim()) {
      blankIdx += 1;
    }
    if (blankIdx < rows.length) {
      rows[blankIdx] = { ...rows[blankIdx], section: label };
      blankIdx += 1;
    } else {
      rows.push(emptyDivisionRow(label));
    }
    present.add(key);
  }
  return rows;
}

/**
 * Validate class + division rows for batch create.
 * @returns {{ ok: true, payload: { className: string, divisions: { section: string, classTeacherId: string|null }[] } } | { ok: false, error: string }}
 */
export function buildBatchClassPayload(className, divisions = []) {
  const name = String(className || "").trim();
  if (!name) return { ok: false, error: "Class is required" };

  const cleaned = [];
  const seen = new Set();
  for (const row of divisions || []) {
    const section = String(row?.section || "").trim();
    if (!section) continue;
    const key = section.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: `Duplicate section “${section}”` };
    }
    seen.add(key);
    const teacherId = String(row?.classTeacherId || "").trim();
    cleaned.push({
      section,
      classTeacherId: teacherId || null,
    });
  }

  if (!cleaned.length) {
    return { ok: false, error: "Add at least one division (section)" };
  }

  return { ok: true, payload: { className: name, divisions: cleaned } };
}

export function classSectionLabel(className, section) {
  const cls = String(className || "").trim();
  const sec = String(section || "").trim();
  if (cls && sec) return `${cls}-${sec}`;
  return cls || sec;
}

function pushUniqueLabel(map, teacherId, label) {
  const id = String(teacherId || "").trim();
  const text = String(label || "").trim();
  if (!id || !text) return;
  const list = map.get(id) || [];
  if (!list.includes(text)) list.push(text);
  map.set(id, list);
}

/**
 * Map classTeacherId → class-section labels they already homeroom.
 * @param {Array<{ classTeacherId?: string|null, className?: string, section?: string }>} sections
 * @param {{ excludeId?: string|null }} [opts]
 */
export function assignedClassTeacherLabels(sections = [], { excludeId = null } = {}) {
  const map = new Map();
  const skip = String(excludeId || "").trim();
  for (const row of sections || []) {
    if (skip && String(row?.id || "") === skip) continue;
    pushUniqueLabel(map, row?.classTeacherId, classSectionLabel(row?.className, row?.section));
  }
  return map;
}

/**
 * Map classTeacherId → division labels already picked on this create form.
 * The current row is omitted so its own selection is not marked as a draft conflict.
 */
export function draftClassTeacherLabels(divisions = [], { className = "", excludeKey = null } = {}) {
  const map = new Map();
  for (const row of divisions || []) {
    if (excludeKey && row?.key === excludeKey) continue;
    const teacherId = String(row?.classTeacherId || "").trim();
    if (!teacherId) continue;
    const section = String(row?.section || "").trim();
    const label = section ? classSectionLabel(className, section) : "another division";
    pushUniqueLabel(map, teacherId, label);
  }
  return map;
}

/**
 * Native <select> option text for a teacher, noting existing or in-form class-teacher roles.
 */
export function classTeacherOptionLabel(name, { assignedLabels = [], draftLabels = [] } = {}) {
  const teacherName = String(name || "").trim() || "Teacher";
  const assigned = [...new Set((assignedLabels || []).map((s) => String(s || "").trim()).filter(Boolean))];
  const draft = [...new Set((draftLabels || []).map((s) => String(s || "").trim()).filter(Boolean))];
  const notes = [];
  if (assigned.length) notes.push(`already class teacher of ${assigned.join(", ")}`);
  if (draft.length) notes.push(`selected for ${draft.join(", ")}`);
  if (!notes.length) return teacherName;
  return `${teacherName} — ${notes.join("; ")}`;
}
