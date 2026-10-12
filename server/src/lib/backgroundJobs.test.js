import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldEnableBackgroundJobs } from "./backgroundJobs.js";

describe("backgroundJobs", () => {
  it("disables on Vercel", () => {
    assert.equal(shouldEnableBackgroundJobs({ VERCEL: "1", NODE_ENV: "production" }), false);
  });

  it("defaults on in non-Vercel production", () => {
    assert.equal(shouldEnableBackgroundJobs({ NODE_ENV: "production" }), true);
  });

  it("respects ENABLE_BACKGROUND_JOBS override", () => {
    assert.equal(
      shouldEnableBackgroundJobs({ NODE_ENV: "development", ENABLE_BACKGROUND_JOBS: "true" }),
      true
    );
    assert.equal(
      shouldEnableBackgroundJobs({ NODE_ENV: "production", ENABLE_BACKGROUND_JOBS: "false" }),
      false
    );
  });
});
