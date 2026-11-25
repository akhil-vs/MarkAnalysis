import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PORTAL_DEFAULT_DAYS, PORTAL_MAX_DAYS, resolvePortalExpiry } from "./portalExpiry.js";

const NOW = new Date("2026-11-25T10:00:00.000Z");

describe("resolvePortalExpiry", () => {
  it("defaults to 30 days when the caller omits an expiry", () => {
    const result = resolvePortalExpiry(undefined, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.expiresAt.toISOString(), "2026-12-25T10:00:00.000Z");
    assert.equal(PORTAL_DEFAULT_DAYS, 30);
  });

  it("rejects a past date and a date past 90 days", () => {
    assert.match(resolvePortalExpiry("2026-11-01", NOW).error, /future/);
    const tooFar = new Date(NOW.getTime() + (PORTAL_MAX_DAYS + 2) * 24 * 60 * 60 * 1000);
    assert.match(resolvePortalExpiry(tooFar.toISOString(), NOW).error, /90 days/);
  });

  it("accepts an explicit date inside the window", () => {
    const result = resolvePortalExpiry("2026-12-01T00:00:00.000Z", NOW);
    assert.equal(result.ok, true);
    assert.equal(result.expiresAt.toISOString(), "2026-12-01T00:00:00.000Z");
  });
});
