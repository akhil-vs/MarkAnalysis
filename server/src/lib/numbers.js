/** Shared numeric form parsers used by routes and tests. */

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmail(value, { required = false, label = "Email" } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    return required ? { error: `${label} is required` } : { value: "" };
  }
  if (!EMAIL_RE.test(text)) return { error: `Enter a valid ${label.toLowerCase()}` };
  return { value: text };
}
