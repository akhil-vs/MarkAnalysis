import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PASSWORD_MIN_LENGTH,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "./password.js";

describe("validatePasswordPolicy", () => {
  it("rejects short passwords", () => {
    assert.match(validatePasswordPolicy("Ab1"), /at least/);
    assert.equal(PASSWORD_MIN_LENGTH, 10);
  });

  it("requires a letter and a number", () => {
    assert.match(validatePasswordPolicy("abcdefghij"), /number/i);
    assert.match(validatePasswordPolicy("1234567890"), /letter/i);
  });

  it("accepts seed-compatible strong enough passwords", () => {
    assert.equal(validatePasswordPolicy("password123"), null);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("round-trips", async () => {
    const hash = await hashPassword("password123");
    assert.equal(await verifyPassword("password123", hash), true);
    assert.equal(await verifyPassword("wrong", hash), false);
  });
});
