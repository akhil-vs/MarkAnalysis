/**
 * Password hashing + policy.
 * Uses bcryptjs everywhere so Alpine/Docker images do not need a native
 * bcrypt toolchain. Hashes remain compatible with historical bcrypt output.
 */
import bcrypt from "bcryptjs";

const ROUNDS = 10;

/** Minimum length for new / changed passwords outside production. */
export const PASSWORD_MIN_LENGTH = 10;
/** Production staff passwords. */
export const PASSWORD_MIN_LENGTH_PRODUCTION = 12;

export function isProductionPasswordPolicy(env = process.env) {
  return env.NODE_ENV === "production" || Boolean(env.VERCEL) || env.REQUIRE_SECURE_AUTH === "true";
}

/** Documented seed password. Rejected at login on a production host. */
export function isBlockedProductionPassword(password, env = process.env) {
  if (!isProductionPasswordPolicy(env)) return false;
  return String(password ?? "") === "password123";
}

/**
 * Validate password strength for new credentials.
 * Development: length ≥ 10, one letter, one digit.
 * Production: length ≥ 12, upper and lower case, and a digit.
 * Returns null when valid, or an error message string.
 */
export function validatePasswordPolicy(password, env = process.env) {
  const value = String(password ?? "");
  const production = isProductionPasswordPolicy(env);
  const min = production ? PASSWORD_MIN_LENGTH_PRODUCTION : PASSWORD_MIN_LENGTH;
  if (value.length < min) {
    return `Password must be at least ${min} characters`;
  }
  if (production) {
    if (!/[a-z]/.test(value) || !/[A-Z]/.test(value)) {
      return "Password must include upper and lower case letters";
    }
  } else if (!/[A-Za-z]/.test(value)) {
    return "Password must include at least one letter";
  }
  if (!/[0-9]/.test(value)) {
    return "Password must include at least one number";
  }
  if (isBlockedProductionPassword(value, env)) {
    return "That password is not allowed";
  }
  return null;
}

/** Verify a password against a bcrypt hash. */
export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(String(password), String(passwordHash));
}

/** Hash a password for storage. */
export function hashPassword(password) {
  return bcrypt.hash(String(password), ROUNDS);
}
