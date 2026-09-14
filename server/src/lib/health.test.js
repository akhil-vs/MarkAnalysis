import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHealthPayload, markBootTime } from "./health.js";

describe("health payload", () => {
  it("returns shallow ok without DB", async () => {
    markBootTime();
    const payload = await buildHealthPayload({ deep: false });
    assert.equal(payload.ok, true);
    assert.equal(payload.service, "school-marks-api");
    assert.equal(payload.db, undefined);
  });
});
