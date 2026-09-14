import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  consumeRecoveryCode,
  totpAuthUrl,
  verifyTotp,
  base32Decode,
} from "./totp.js";
import { createHmac } from "node:crypto";

function currentTotp(secret, now = Date.now()) {
  const secretBuf = base32Decode(secret);
  const counter = Math.floor(now / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secretBuf).update(counterBuf).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

describe("totp", () => {
  it("generates secrets and verifies matching codes", () => {
    const secret = generateTotpSecret();
    assert.match(secret, /^[A-Z2-7]+$/);
    const code = currentTotp(secret);
    assert.equal(verifyTotp(secret, code), true);
    assert.equal(verifyTotp(secret, "000000"), false);
  });

  it("builds an otpauth URL", () => {
    const url = totpAuthUrl({ secret: "JBSWY3DPEHPK3PXP", accountName: "a@b.c" });
    assert.match(url, /^otpauth:\/\/totp\//);
    assert.match(url, /secret=JBSWY3DPEHPK3PXP/);
  });

  it("consumes recovery codes once", () => {
    process.env.JWT_SECRET ||= "test-secret-for-totp";
    const codes = generateRecoveryCodes(2);
    const hashes = codes.map(hashRecoveryCode);
    const next = consumeRecoveryCode(hashes, codes[0]);
    assert.equal(next.length, 1);
    assert.equal(consumeRecoveryCode(next, codes[0]), null);
  });
});
