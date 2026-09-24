import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyHomePayload } from "./homeDashboard.js";

describe("emptyHomePayload", () => {
  it("always marks empty and ships setup counts for a principal", () => {
    const payload = emptyHomePayload({
      role: "PRINCIPAL",
      setup: { classes: 4, subjects: 8, students: 120, teachers: 10 },
    });
    assert.equal(payload.empty, true);
    assert.equal(payload.reason, "NO_EXAM");
    assert.deepEqual(payload.setup, {
      classes: 4,
      subjects: 8,
      students: 120,
      teachers: 10,
    });
    assert.equal(payload.kpis.students, 120);
    assert.equal(payload.kpis.schoolAverage, null);
    assert.equal(payload.pendingUploads.pendingTeacherCount, 0);
    assert.ok(Array.isArray(payload.exams));
  });

  it("includes assignment count for teachers without an exam", () => {
    const payload = emptyHomePayload({
      role: "TEACHER",
      exams: [],
      setup: { classes: 2, subjects: 3, students: 40, teachers: 5 },
      assignmentCount: 3,
      reason: "NO_EXAM",
    });
    assert.equal(payload.setup.assignments, 3);
    assert.equal(payload.kpis.sections, 3);
    assert.equal(payload.reason, "NO_EXAM");
  });

  it("preserves NO_ASSIGNMENTS reason when an exam exists", () => {
    const exam = { id: "e1", name: "Mid Term" };
    const payload = emptyHomePayload({
      role: "TEACHER",
      exams: [exam],
      exam,
      reason: "NO_ASSIGNMENTS",
      assignmentCount: 0,
    });
    assert.equal(payload.empty, true);
    assert.equal(payload.reason, "NO_ASSIGNMENTS");
    assert.equal(payload.exam.id, "e1");
    assert.equal(payload.exams.length, 1);
  });

  it("gives coordinators a ready upload-queue shell", () => {
    const payload = emptyHomePayload({
      role: "EXAM_COORDINATOR",
      setup: { classes: 1, subjects: 1, students: 1, teachers: 1 },
    });
    assert.equal(payload.empty, true);
    assert.equal(payload.kpis.pendingTeacherCount, 0);
    assert.deepEqual(payload.difficulty, []);
    assert.deepEqual(payload.correlations, []);
  });
});
