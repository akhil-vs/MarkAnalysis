import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicConsolidationSettings } from "./consolidationMaxMarks.js";

describe("publicConsolidationSettings", () => {
  it("returns unlocked defaults for null", () => {
    assert.deepEqual(publicConsolidationSettings(null), {
      maxMarksLocked: false,
      lockedAt: null,
      lockedBy: null,
    });
  });

  it("exposes locked metadata", () => {
    const lockedAt = new Date("2026-09-09T12:00:00Z");
    assert.deepEqual(
      publicConsolidationSettings({
        maxMarksLocked: true,
        lockedAt,
        lockedBy: { id: "u1", name: "Principal" },
      }),
      {
        maxMarksLocked: true,
        lockedAt,
        lockedBy: { id: "u1", name: "Principal" },
      }
    );
  });
});
