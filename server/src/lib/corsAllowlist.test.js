import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCorsAllowlist, isCorsOriginAllowed } from "./corsAllowlist.js";

describe("corsAllowlist", () => {
  it("includes CLIENT_ORIGIN entries and Vercel hostnames", () => {
    const list = buildCorsAllowlist({
      CLIENT_ORIGIN: "https://app.example.edu, https://admin.example.edu",
      VERCEL_URL: "marks-abc.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "marks.vercel.app",
    });
    assert.deepEqual(list, [
      "https://app.example.edu",
      "https://admin.example.edu",
      "https://marks-abc.vercel.app",
      "https://marks.vercel.app",
    ]);
  });

  it("does not treat VERCEL=1 as allow-all", () => {
    const list = buildCorsAllowlist({
      CLIENT_ORIGIN: "https://app.example.edu",
      VERCEL: "1",
    });
    assert.equal(isCorsOriginAllowed("https://evil.example", list), false);
    assert.equal(isCorsOriginAllowed("https://app.example.edu", list), true);
    assert.equal(isCorsOriginAllowed(undefined, list), true);
  });
});
