import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSetupSteps } from "./setupStatus.js";

describe("buildSetupSteps", () => {
  it("is not ready until blocking steps complete", () => {
    const status = buildSetupSteps({
      school: { name: "Demo", shortName: "Demo", board: "CBSE" },
      classes: 2,
      subjects: 4,
      students: 40,
      activeTeachers: 3,
      assignments: 0,
      exams: 0,
    });
    assert.equal(status.ready, false);
    assert.ok(status.remainingBlocking >= 2);
    assert.ok(status.steps.find((s) => s.id === "identity").done);
    assert.ok(!status.steps.find((s) => s.id === "exam").done);
  });

  it("marks ready when blocking work is done", () => {
    const status = buildSetupSteps({
      school: { name: "Demo", board: "CBSE" },
      classes: 1,
      subjects: 1,
      students: 1,
      activeTeachers: 1,
      assignments: 1,
      exams: 1,
      papersTotal: 2,
      papersWithDates: 1,
      deadlineSet: false,
    });
    assert.equal(status.ready, true);
    assert.equal(status.remainingBlocking, 0);
    assert.ok(!status.steps.find((s) => s.id === "paperDates").done);
  });
});
