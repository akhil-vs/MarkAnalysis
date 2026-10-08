import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeWorkspace } from "./workspace.js";

describe("normalizeWorkspace", () => {
  it("defaults empty input", () => {
    assert.deepEqual(normalizeWorkspace(null), { examId: null, schoolSection: "ALL" });
    assert.deepEqual(normalizeWorkspace(undefined), { examId: null, schoolSection: "ALL" });
  });

  it("keeps examId and normalizes section", () => {
    assert.deepEqual(normalizeWorkspace({ examId: "ex1", schoolSection: "primary" }), {
      examId: "ex1",
      schoolSection: "PRIMARY",
    });
  });

  it("ignores blank examId", () => {
    assert.deepEqual(normalizeWorkspace({ examId: "  ", schoolSection: "SEC" }), {
      examId: null,
      schoolSection: "SECONDARY",
    });
  });
});
