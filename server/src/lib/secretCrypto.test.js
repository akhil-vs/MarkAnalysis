import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  resolveSecretCryptoKey,
  tryDecryptSecret,
} from "./secretCrypto.js";

describe("secretCrypto", () => {
  it("round-trips with a passphrase key", () => {
    const env = { MFA_ENCRYPTION_KEY: "a-long-enough-passphrase-key" };
    const enc = encryptSecret("JBSWY3DPEHPK3PXP", env);
    assert.equal(isEncryptedSecret(enc), true);
    assert.equal(decryptSecret(enc, env), "JBSWY3DPEHPK3PXP");
  });

  it("round-trips with a 64-hex key", () => {
    const env = {
      MFA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    };
    assert.equal(resolveSecretCryptoKey(env).length, 32);
    const enc = encryptSecret("SECRET", env);
    assert.equal(decryptSecret(enc, env), "SECRET");
  });

  it("leaves plaintext unchanged when no key is configured", () => {
    const env = { JWT_SECRET: "change-me-in-production" };
    assert.equal(encryptSecret("plain", env), "plain");
    assert.equal(decryptSecret("plain", env), "plain");
  });

  it("falls back to JWT_SECRET when MFA_ENCRYPTION_KEY is unset", () => {
    const env = { JWT_SECRET: "sixteen-chars-ok!" };
    const enc = encryptSecret("abc", env);
    assert.equal(isEncryptedSecret(enc), true);
    assert.equal(decryptSecret(enc, env), "abc");
  });

  it("does not double-encrypt", () => {
    const env = { MFA_ENCRYPTION_KEY: "a-long-enough-passphrase-key" };
    const once = encryptSecret("x", env);
    assert.equal(encryptSecret(once, env), once);
  });

  it("tryDecryptSecret returns null on bad ciphertext", () => {
    const env = { MFA_ENCRYPTION_KEY: "a-long-enough-passphrase-key" };
    assert.equal(tryDecryptSecret("enc:v1:bad:bad:bad", env), null);
  });
});
