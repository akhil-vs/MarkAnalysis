import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRegisterKey, registerActions, registerKey } from "./registers.js";

describe("registerKey", () => {
  it("round-trips", () => {
    const key = registerKey({
      examId: "e1",
      classSectionId: "c1",
      subjectId: "s1",
      teacherId: "t1",
    });
    assert.equal(key, "e1:c1:s1:t1");
    assert.deepEqual(parseRegisterKey(key), {
      examId: "e1",
      classSectionId: "c1",
      subjectId: "s1",
      teacherId: "t1",
    });
  });

  it("rejects bad keys", () => {
    assert.equal(parseRegisterKey("a:b"), null);
    assert.equal(parseRegisterKey(""), null);
  });
});

describe("registerActions", () => {
  const missing = { status: "MISSING", draft: 0, missing: 10, submitted: 0, approved: 0, expected: 10 };
  const partialDrafts = {
    status: "PARTIAL",
    draft: 10,
    missing: 0,
    submitted: 0,
    approved: 0,
    expected: 10,
  };
  const awaiting = {
    status: "AWAITING_APPROVAL",
    draft: 0,
    missing: 0,
    submitted: 10,
    approved: 0,
    expected: 10,
  };

  it("lets a teacher enter an open missing register", () => {
    const actions = registerActions(missing, {
      role: "TEACHER",
      isOwner: true,
      pastDeadline: false,
    });
    assert.ok(actions.includes("ENTER"));
    assert.ok(actions.includes("VIEW"));
  });

  it("requests late entry after deadline", () => {
    const actions = registerActions(missing, {
      role: "TEACHER",
      isOwner: true,
      pastDeadline: true,
    });
    assert.ok(actions.includes("REQUEST_LATE"));
    assert.ok(!actions.includes("ENTER"));
  });

  it("offers submit when drafts fill the register", () => {
    const actions = registerActions(partialDrafts, {
      role: "TEACHER",
      isOwner: true,
      pastDeadline: false,
    });
    assert.ok(actions.includes("SUBMIT"));
  });

  it("lets leadership approve awaiting registers", () => {
    const actions = registerActions(awaiting, {
      role: "PRINCIPAL",
      isOwner: false,
      pastDeadline: false,
    });
    assert.ok(actions.includes("APPROVE"));
    assert.ok(!actions.includes("ENTER"));
  });
});
