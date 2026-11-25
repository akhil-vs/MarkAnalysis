import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHealthPayload, markBootTime, migrationHealth } from "./health.js";

describe("health payload", () => {
  it("returns shallow ok without DB", async () => {
    markBootTime();
    const payload = await buildHealthPayload({ deep: false });
    assert.equal(payload.ok, true);
    assert.equal(payload.service, "termlens-api");
    assert.equal(payload.db, undefined);
    assert.equal(payload.smtpConfigured, undefined);
  });

  it("fails a production ensure-only boot unless bypassed", () => {
    const env = { NODE_ENV: "production" };
    assert.equal(migrationHealth({ mode: "vercel-ensure-only" }, env).ok, false);
    assert.equal(migrationHealth({ mode: "migrate-ok" }, env).ok, true);
    assert.equal(
      migrationHealth({ mode: "vercel-ensure-only" }, { ...env, ALLOW_VERCEL_ENSURE_ONLY: "true" }).ok,
      true
    );
    assert.equal(migrationHealth({ mode: "vercel-ensure-only" }, { NODE_ENV: "development" }).ok, true);
  });
});
