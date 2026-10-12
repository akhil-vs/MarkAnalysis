/**
 * Encrypt secrets at rest (MFA TOTP seeds).
 * Format: enc:v1:<iv_b64url>:<tag_b64url>:<ct_b64url>
 * Legacy plaintext secrets are still accepted on decrypt for migration.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function fromB64url(text) {
  return Buffer.from(String(text), "base64url");
}

/**
 * 32-byte key from MFA_ENCRYPTION_KEY (preferred) or JWT_SECRET.
 * MFA_ENCRYPTION_KEY may be 64 hex chars or any passphrase (≥16 chars).
 */
export function resolveSecretCryptoKey(env = process.env) {
  const dedicated = String(env.MFA_ENCRYPTION_KEY || "").trim();
  const fallback = String(env.JWT_SECRET || "").trim();
  const material = dedicated || fallback;
  if (!material || material === "change-me-in-production") return null;
  if (/^[0-9a-fA-F]{64}$/.test(material)) {
    return Buffer.from(material, "hex");
  }
  return createHash("sha256").update(material).digest();
}

export function isEncryptedSecret(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypt plaintext. Returns plaintext unchanged when no key is configured (dev). */
export function encryptSecret(plaintext, env = process.env) {
  const text = String(plaintext ?? "");
  if (!text) return text;
  if (isEncryptedSecret(text)) return text;
  const key = resolveSecretCryptoKey(env);
  if (!key) return text;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${b64url(iv)}:${b64url(tag)}:${b64url(ct)}`;
}

/**
 * Decrypt stored value. Plaintext (legacy) values pass through.
 * Throws when ciphertext is corrupt or the key cannot decrypt.
 */
export function decryptSecret(stored, env = process.env) {
  const text = String(stored ?? "");
  if (!text) return text;
  if (!isEncryptedSecret(text)) return text;
  const key = resolveSecretCryptoKey(env);
  if (!key) {
    const err = new Error("Encrypted MFA secret present but MFA_ENCRYPTION_KEY/JWT_SECRET is unset");
    err.status = 500;
    throw err;
  }
  const body = text.slice(PREFIX.length);
  const [ivPart, tagPart, ctPart] = body.split(":");
  if (!ivPart || !tagPart || !ctPart) {
    const err = new Error("Corrupt encrypted secret");
    err.status = 500;
    throw err;
  }
  const decipher = createDecipheriv(ALGO, key, fromB64url(ivPart));
  decipher.setAuthTag(fromB64url(tagPart));
  return Buffer.concat([decipher.update(fromB64url(ctPart)), decipher.final()]).toString("utf8");
}

/** Safe decrypt for auth paths — returns null when decryption fails. */
export function tryDecryptSecret(stored, env = process.env) {
  try {
    return decryptSecret(stored, env);
  } catch {
    return null;
  }
}
