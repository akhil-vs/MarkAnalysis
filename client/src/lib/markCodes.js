export const OUTCOME_SHORT = {
  ABSENT: "AB",
  EXEMPT: "EX",
  WITHHELD: "WH",
};

export function formatMarkCell(mark) {
  if (!mark) return "";
  if (mark.outcome && mark.outcome !== "SCORED") return OUTCOME_SHORT[mark.outcome] || mark.outcome;
  if (mark.marksObtained == null) return "";
  return String(mark.marksObtained);
}

export function describeAuditValue(value) {
  if (value === -1) return "deleted";
  if (value === -2) return "AB";
  if (value === -3) return "EX";
  if (value === -4) return "WH";
  return value;
}
