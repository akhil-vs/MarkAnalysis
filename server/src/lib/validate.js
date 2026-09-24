/**
 * Lightweight request validation helpers (no external schema library).
 * Prefer these over ad-hoc String()/Number() with inconsistent errors.
 */
import { HttpError } from "./httpErrors.js";
import { validatePasswordPolicy } from "./password.js";

export function requireString(value, { field = "value", min = 1, max = 500 } = {}) {
  const text = value == null ? "" : String(value).trim();
  if (text.length < min) {
    throw new HttpError(400, `${field} is required`);
  }
  if (text.length > max) {
    throw new HttpError(400, `${field} is too long`);
  }
  return text;
}

export function optionalString(value, { max = 500 } = {}) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) {
    throw new HttpError(400, "Value is too long");
  }
  return text;
}

export function requirePassword(value, { field = "Password" } = {}) {
  const text = String(value ?? "");
  const policyError = validatePasswordPolicy(text);
  if (policyError) {
    throw new HttpError(400, policyError.replace(/^Password/, field));
  }
  return text;
}

export function asBoolean(value, fallback = false) {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return fallback;
}
