/**
 * CBSE-style school sections for leadership dashboards (mirrors server).
 * Primary 1–5 · Secondary 6–10 · Senior secondary 11–12
 */

export const SCHOOL_SECTIONS = [
  { id: "ALL", label: "Whole school", shortLabel: "All", classRange: null },
  { id: "PRIMARY", label: "Primary section", shortLabel: "Primary", classRange: { min: 1, max: 5 } },
  {
    id: "SECONDARY",
    label: "Secondary section",
    shortLabel: "Secondary",
    classRange: { min: 6, max: 10 },
  },
  {
    id: "SENIOR_SECONDARY",
    label: "Senior secondary section",
    shortLabel: "Sr. Secondary",
    classRange: { min: 11, max: 12 },
  },
];

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

export function schoolSectionLabel(sectionId, options) {
  const id = normalizeSchoolSection(sectionId);
  const fromOpts = (options || []).find((o) => o.id === id);
  if (fromOpts?.label) return fromOpts.label;
  return SCHOOL_SECTIONS.find((s) => s.id === id)?.label || "Whole school";
}
