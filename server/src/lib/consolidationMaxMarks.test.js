import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertExamConsolidationEditable,
  CONSOLIDATION_LOCKED_MESSAGE,
  publicExamConsolidation,
} from "./consolidationMaxMarks.js";

describe("publicExamConsolidation", () => {
  it("returns unlocked defaults for null", () => {
    assert.deepEqual(publicExamConsolidation(null), {
      consolidationMaxMarks: null,
      maxMarksLocked: false,
      lockedAt: null,
      lockedBy: null,
    });
  });

  it("exposes exam ceiling and locked metadata", () => {
    const lockedAt = new Date("2026-09-09T12:00:00Z");
    assert.deepEqual(
      publicExamConsolidation({
        consolidationMaxMarks: 80,
        consolidationLocked: true,
        consolidationLockedAt: lockedAt,
        consolidationLockedBy: { id: "u1", name: "Principal" },
      }),
      {
        consolidationMaxMarks: 80,
        maxMarksLocked: true,
        lockedAt,
        lockedBy: { id: "u1", name: "Principal" },
      }
    );
  });
});

describe("assertExamConsolidationEditable", () => {
  it("allows edits while unlocked", () => {
    assert.equal(assertExamConsolidationEditable({ consolidationLocked: false }), null);
  });

  it("rejects edits once locked", () => {
    assert.equal(
      assertExamConsolidationEditable({ consolidationLocked: true }),
      CONSOLIDATION_LOCKED_MESSAGE
    );
  });
});
