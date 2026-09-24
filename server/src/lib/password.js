/**
 * Password hashing + policy.
 * Uses bcryptjs everywhere so Alpine/Docker images do not need a native
 * bcrypt toolchain. Hashes remain compatible with historical bcrypt output.
 */
import bcrypt from "bcryptjs";

const ROUNDS = 10;

/** Minimum length for new / changed passwords. */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Validate password strength for new credentials.
 * Requires length ≥ 10, at least one letter and one digit.
 * Returns null when valid, or an error message string.
 */
export function validatePasswordPolicy(password) {
  const value = String(password ?? "");
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!/[A-Za-z]/.test(value)) {
    return "Password must include at least one letter";
  }
  if (!/[0-9]/.test(value)) {
    return "Password must include at least one number";
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
