/**
 * CBSE-style school sections for leadership dashboards.
 *
 * Operational grouping used by many CBSE campuses:
 * - Primary: classes 1–5
 * - Secondary: classes 6–10
 * - Senior secondary: classes 11–12
 */

export const SCHOOL_SECTIONS = Object.freeze([
  Object.freeze({
    id: "ALL",
    label: "Whole school",
    shortLabel: "All",
    classRange: null,
  }),
  Object.freeze({
    id: "PRIMARY",
    label: "Primary section",
    shortLabel: "Primary",
    classRange: Object.freeze({ min: 1, max: 5 }),
  }),
  Object.freeze({
    id: "SECONDARY",
    label: "Secondary section",
    shortLabel: "Secondary",
    classRange: Object.freeze({ min: 6, max: 10 }),
  }),
  Object.freeze({
    id: "SENIOR_SECONDARY",
    label: "Senior secondary section",
    shortLabel: "Sr. Secondary",
    classRange: Object.freeze({ min: 11, max: 12 }),
  }),
]);

const SECTION_BY_ID = new Map(SCHOOL_SECTIONS.map((s) => [s.id, s]));

/** Extract a numeric class level from labels like "10", "X", "Class 5". */
export function parseClassNumber(className) {
  const raw = String(className || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits) {
    const num = parseInt(digits, 10);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
  return null;
}

export function normalizeSchoolSection(value) {
  const raw = String(value || "ALL")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (!raw || raw === "ALL" || raw === "WHOLE" || raw === "SCHOOL" || raw === "WHOLE_SCHOOL") {
    return "ALL";
  }
  if (raw === "PRIMARY" || raw === "PRI") return "PRIMARY";
  if (raw === "SECONDARY" || raw === "SEC") return "SECONDARY";
  if (
    raw === "SENIOR_SECONDARY" ||
    raw === "SENIOR" ||
    raw === "SR_SECONDARY" ||
    raw === "SR" ||
    raw === "SENIOR_SEC"
  ) {
    return "SENIOR_SECONDARY";
  }
  return "ALL";
}

export function schoolSectionMeta(sectionId) {
  return SECTION_BY_ID.get(normalizeSchoolSection(sectionId)) || SECTION_BY_ID.get("ALL");
}

export function schoolSectionForClassName(className) {
  const num = parseClassNumber(className);
  if (num == null) return null;
  if (num <= 5) return "PRIMARY";
  if (num <= 10) return "SECONDARY";
  if (num <= 12) return "SENIOR_SECONDARY";
  return null;
}

export function classNameInSchoolSection(className, section) {
  const id = normalizeSchoolSection(section);
  if (id === "ALL") return true;
  return schoolSectionForClassName(className) === id;
}

export function filterBySchoolSection(items = [], section, getClassName) {
  const id = normalizeSchoolSection(section);
  if (id === "ALL") return items;
  const getter =
    typeof getClassName === "function"
      ? getClassName
      : (item) => item?.[getClassName || "className"];
  return items.filter((item) => classNameInSchoolSection(getter(item), id));
}

/** Options to show in the UI — always include All, plus sections that have classes. */
export function availableSchoolSections(classNames = []) {
  const present = new Set();
  for (const cn of classNames) {
    const id = schoolSectionForClassName(cn);
    if (id) present.add(id);
  }
  return SCHOOL_SECTIONS.filter((s) => s.id === "ALL" || present.has(s.id)).map((s) => ({
    id: s.id,
    label: s.label,
    shortLabel: s.shortLabel,
    classRange: s.classRange,
  }));
}

export function schoolSectionPayload(section, classNames = []) {
  const id = normalizeSchoolSection(section);
  const meta = schoolSectionMeta(id);
  return {
    schoolSection: id,
    schoolSectionLabel: meta.label,
    schoolSections: availableSchoolSections(classNames),
  };
}
