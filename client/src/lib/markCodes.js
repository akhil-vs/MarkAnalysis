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

const SCORE_PATTERN = /^\+?\d+(\.\d+)?$/;
const SCORE_DRAFT_RE = /^\+?\d*\.?\d*$/;
const TOKEN_PREFIX_RE =
  /^(A|AB|ABS|ABSE|ABSEN|ABSENT|E|EX|EXE|EXEM|EXEMP|EXEMPT|W|WH|WIT|WITH|WITHH|WITHHE|WITHHEL|WITHHELD)$/i;

export function parseOutcomeToken(raw) {
  if (raw == null) return null;
  const key = String(raw).trim().toUpperCase();
  return OUTCOME_TOKENS[key] || null;
}

export function parseMarkInput(raw, maxMarks) {
  if (raw == null) return { empty: true };
  const text = String(raw).trim();
  if (text === "") return { empty: true };

  const outcome = parseOutcomeToken(text);
  if (outcome) return { outcome, marksObtained: null };

  if (text === "-" || text.startsWith("-")) {
    return { error: "Marks cannot be negative" };
  }

  if (!SCORE_PATTERN.test(text)) {
    return { error: "Enter a number or AB, EX, or WH" };
  }

  const value = Number(text);
  if (!Number.isFinite(value)) {
    return { error: "Enter a number or AB, EX, or WH" };
  }
  if (value < 0) {
    return { error: "Marks cannot be negative" };
  }
  if (maxMarks != null && maxMarks !== "" && Number.isFinite(Number(maxMarks)) && value > Number(maxMarks)) {
    return { error: `Marks exceed max (${Number(maxMarks)})` };
  }
  return { outcome: "SCORED", marksObtained: value };
}

/** Live-entry helper: stay quiet for incomplete tokens / trailing decimals. */
export function markInputIssue(raw, maxMarks) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (TOKEN_PREFIX_RE.test(text)) return null;
  if (text === "+" || text === ".") return null;
  if (SCORE_DRAFT_RE.test(text) && /[.+]$/.test(text)) return null;
  const parsed = parseMarkInput(text, maxMarks);
  return parsed.error || null;
}

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
