export const MARK_OUTCOMES = ["SCORED", "ABSENT", "EXEMPT", "WITHHELD"];

export const OUTCOME_LABELS = {
  SCORED: "Scored",
  ABSENT: "Absent",
  EXEMPT: "Exempt",
  WITHHELD: "Withheld",
};

export const OUTCOME_TOKENS = {
  AB: "ABSENT",
  ABS: "ABSENT",
  ABSENT: "ABSENT",
  EX: "EXEMPT",
  EXEMPT: "EXEMPT",
  WH: "WITHHELD",
  WITHHELD: "WITHHELD",
};

export const OUTCOME_SHORT = {
  ABSENT: "AB",
  EXEMPT: "EX",
  WITHHELD: "WH",
};

export const AUDIT_SENTINEL = {
  DELETED: -1,
  ABSENT: -2,
  EXEMPT: -3,
  WITHHELD: -4,
};

export function isScoredMark(mark) {
  if (!mark) return false;
  return !mark.outcome || mark.outcome === "SCORED";
}

export function countsTowardRegister(mark) {
  return Boolean(mark);
}

export function parseOutcomeToken(raw) {
  if (raw == null) return null;
  const key = String(raw).trim().toUpperCase();
  return OUTCOME_TOKENS[key] || null;
}

export function parseMarkInput(raw, maxMarks) {
  if (raw == null || raw === "") return { empty: true };
  const outcome = parseOutcomeToken(raw);
  if (outcome) return { outcome, marksObtained: null };
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) return { error: "Invalid marks" };
  if (maxMarks != null && value > maxMarks) {
    return { error: `Marks exceed max (${maxMarks})` };
  }
  return { outcome: "SCORED", marksObtained: value };
}

export function formatMarkCell(mark) {
  if (!mark) return "";
  if (!isScoredMark(mark)) return OUTCOME_SHORT[mark.outcome] || mark.outcome;
  if (mark.marksObtained == null) return "";
  return String(mark.marksObtained);
}

export function auditValueFor(outcome, marksObtained) {
  if (!outcome || outcome === "SCORED") return marksObtained ?? null;
  return AUDIT_SENTINEL[outcome] ?? null;
}

export function describeAuditValue(value) {
  if (value === AUDIT_SENTINEL.DELETED) return "deleted";
  if (value === AUDIT_SENTINEL.ABSENT) return "AB";
  if (value === AUDIT_SENTINEL.EXEMPT) return "EX";
  if (value === AUDIT_SENTINEL.WITHHELD) return "WH";
  return value;
}
