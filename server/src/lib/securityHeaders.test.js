import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldEnforceCsp } from "./securityHeaders.js";

describe("shouldEnforceCsp", () => {
  it("enforces by default in production / Vercel", () => {
    assert.equal(shouldEnforceCsp({ NODE_ENV: "production" }), true);
    assert.equal(shouldEnforceCsp({ VERCEL: "1" }), true);
  });

  it("stays report-only in development unless opted in", () => {
    assert.equal(shouldEnforceCsp({ NODE_ENV: "development" }), false);
    assert.equal(shouldEnforceCsp({ NODE_ENV: "development", CSP_ENFORCE: "true" }), true);
  });

  it("allows explicit opt-out in production", () => {
    assert.equal(shouldEnforceCsp({ NODE_ENV: "production", CSP_ENFORCE: "false" }), false);
  });
});
