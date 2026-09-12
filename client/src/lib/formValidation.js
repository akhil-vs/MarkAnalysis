/** Client-side parsers for forms. Keep messages aligned with the API. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACADEMIC_YEAR_RE = /^\d{4}-\d{2}$/;

export function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) return { error: `${label} is required` };
  return { value: text };
}

export function parseEmail(value, { required = false, label = "Email" } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    return required ? { error: `${label} is required` } : { value: "" };
  }
  if (!EMAIL_RE.test(text)) return { error: `Enter a valid ${label.toLowerCase()}` };
  return { value: text };
}

export function parsePassword(value, { label = "Password", minLength = 8 } = {}) {
  const text = String(value ?? "");
  if (!text) return { error: `${label} is required` };
  if (text.length < minLength) {
    return { error: `${label} must be at least ${minLength} characters` };
  }
  return { value: text };
}

export function parsePositiveInt(value, label = "Value") {
  if (value == null || value === "") {
    return { error: `${label} is required` };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { error: `${label} must be a number` };
  }
  if (n < 0) {
    return { error: `${label} cannot be negative` };
  }
  if (!Number.isInteger(n) || n <= 0) {
    return { error: `${label} must be a positive integer` };
  }
  return { value: n };
}

export function parseNonNegativeNumber(value, label = "Value", { max } = {}) {
  if (value == null || value === "") {
    return { error: `${label} is required` };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { error: `${label} must be a number` };
  }
  if (n < 0) {
    return { error: `${label} cannot be negative` };
  }
  if (max != null && n > max) {
    return { error: `${label} must be between 0 and ${max}` };
  }
  return { value: n };
}

export function parsePercent(value, label = "Percent") {
  return parseNonNegativeNumber(value, label, { max: 100 });
}

export function parsePhone(value, { required = false, label = "Phone" } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return required ? { error: `${label} is required` } : { value: "" };
  const digits = text.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return { error: `Enter a valid ${label.toLowerCase()} number` };
  }
  return { value: text };
}

export function parseAcademicYear(value, { required = false, label = "Academic year" } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return required ? { error: `${label} is required` } : { value: "" };
  if (!ACADEMIC_YEAR_RE.test(text)) {
    return { error: `${label} must look like 2025-26` };
  }
  return { value: text };
}

/** Block typing a minus sign on non-negative numeric fields. */
export function rejectNegativeKey(event) {
  if (event.key === "-" || event.key === "Minus" || event.key === "Subtract") {
    event.preventDefault();
  }
}

/**
 * For controlled number inputs: ignore negative/NaN keystrokes and pastes
 * so the stored value never goes below zero.
 */
export function acceptNonNegativeInput(raw, previous, { integer = false, allowEmpty = true } = {}) {
  if (raw === "" || raw == null) {
    return allowEmpty ? "" : previous;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return previous;
  return integer ? Math.trunc(n) : n;
}

export function parseJoinCode(value, { required = true, label = "Join code" } = {}) {
  const text = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!text) return required ? { error: `${label} is required` } : { value: "" };
  if (text.length !== 8) return { error: `${label} looks like ABCD-EFGH` };
  return { value: `${text.slice(0, 4)}-${text.slice(4)}` };
}

export function firstError(...results) {
  for (const result of results) {
    if (result?.error) return result.error;
  }
  return null;
}
