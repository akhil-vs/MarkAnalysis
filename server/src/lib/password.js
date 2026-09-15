import bcrypt from "bcrypt";

const ROUNDS = 10;

/** Verify a password against a bcrypt hash (native binding — faster than bcryptjs). */
export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(String(password), String(passwordHash));
}

/** Hash a password for storage. */
export function hashPassword(password) {
  return bcrypt.hash(String(password), ROUNDS);
}
