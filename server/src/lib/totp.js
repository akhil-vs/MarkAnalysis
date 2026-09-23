import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Generate a random Base32 TOTP secret (20 bytes → 32 chars). */
export function generateTotpSecret(bytes = 20) {
  const buf = randomBytes(bytes);
  return base32Encode(buf);
}

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(secret) {
  const cleaned = String(secret || "")
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secretBuf, counter, digits = 6) {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secretBuf).update(counterBuf).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  const str = String(code % 10 ** digits);
  return str.padStart(digits, "0");
}

/** Verify a TOTP code with ±window steps (30s). */
export function verifyTotp(secret, token, { window = 1, step = 30, digits = 6, now = Date.now() } = {}) {
  const code = String(token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  const secretBuf = base32Decode(secret);
  if (!secretBuf.length) return false;
  const counter = Math.floor(now / 1000 / step);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secretBuf, counter + w, digits);
    const a = Buffer.from(expected);
    const b = Buffer.from(code);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function totpAuthUrl({ secret, accountName, issuer = "School Marks Analytics" }) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => randomBytes(4).toString("hex"));
}

export function hashRecoveryCode(code) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required to hash recovery codes");
  }
  return createHmac("sha256", secret)
    .update(String(code).trim().toLowerCase())
    .digest("hex");
}

export function consumeRecoveryCode(hashes, code) {
  const target = hashRecoveryCode(code);
  const list = Array.isArray(hashes) ? [...hashes] : [];
  const idx = list.indexOf(target);
  if (idx < 0) return null;
  list.splice(idx, 1);
  return list;
}
