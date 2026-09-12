import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashPortalToken, mintPortalToken } from "./portalToken.js";

describe("portalToken", () => {
  it("hashes deterministically and mints opaque tokens", () => {
    assert.equal(hashPortalToken("abc"), hashPortalToken("abc"));
    assert.notEqual(hashPortalToken("abc"), hashPortalToken("abcd"));
    assert.equal(hashPortalToken("abc").length, 64);
    const a = mintPortalToken();
    const b = mintPortalToken();
    assert.notEqual(a, b);
    assert.ok(a.length >= 20);
  });
});
