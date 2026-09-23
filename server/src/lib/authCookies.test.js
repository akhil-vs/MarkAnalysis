import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashRefreshToken, isRefreshReuse, newRefreshToken, __test } from "./authCookies.js";

describe("authCookies", () => {
  it("hashes refresh tokens stably with sha256 hex", () => {
    const a = hashRefreshToken("abc");
    const b = hashRefreshToken("abc");
    const c = hashRefreshToken("abcd");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(a.length, 64);
    assert.match(a, /^[0-9a-f]+$/);
  });

  it("generates unique opaque refresh tokens", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => newRefreshToken()));
    assert.equal(tokens.size, 20);
    for (const t of tokens) {
      assert.ok(t.length >= 32);
    }
  });

  it("uses short access and long refresh lifetimes", () => {
    assert.equal(__test.ACCESS_MAX_AGE_MS, 15 * 60 * 1000);
    assert.equal(__test.REFRESH_MAX_AGE_MS, 30 * 24 * 60 * 60 * 1000);
  });

  it("treats a recently revoked token as a rotation race, not reuse", () => {
    const now = Date.parse("2026-09-23T12:00:00.000Z");
    assert.equal(isRefreshReuse({ revokedAt: new Date(now - 2_000) }, now), false);
    assert.equal(isRefreshReuse({ revokedAt: new Date(now - 20_000) }, now), true);
    assert.equal(isRefreshReuse({ revokedAt: null }, now), false);
    assert.equal(isRefreshReuse(null, now), false);
  });
});

