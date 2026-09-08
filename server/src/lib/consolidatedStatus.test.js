import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSubjectStatusCols,
  studentsForExamScope,
  summarizeClassStatus,
} from "./consolidatedStatus.js";

describe("studentsForExamScope", () => {
  const students = [
    { id: "1", academicYear: "2025-26", status: "ACTIVE" },
    { id: "2", academicYear: "2024-25", status: "PROMOTED" },
    { id: "3", academicYear: "2025-26", status: "PROMOTED" },
  ];

  it("prefers academic-year matches when any exist (including non-active)", () => {
    const scoped = studentsForExamScope(students, { academicYear: "2025-26" });
    assert.deepEqual(
      scoped.map((s) => s.id).sort(),
      ["1", "3"]
    );
  });

  it("falls back to ACTIVE when no year match", () => {
    const scoped = studentsForExamScope(students, { academicYear: "2026-27" });
    assert.deepEqual(
      scoped.map((s) => s.id),
      ["1"]
    );
  });
});

describe("buildSubjectStatusCols / summarizeClassStatus", () => {
  const subjects = [
    { id: "bio", name: "Biology", maxMarks: 100 },
    { id: "math", name: "Math", maxMarks: 100 },
  ];
  const students = [
    { id: "a", academicYear: "2025-26", status: "ACTIVE" },
    { id: "b", academicYear: "2025-26", status: "ACTIVE" },
  ];
  const cls = { id: "c1", className: "10", section: "A", classTeacher: { name: "Ada" } };

  it("marks subject incomplete when approvals are missing", () => {
    const marks = [
      { studentId: "a", subjectId: "math", status: "APPROVED" },
      { studentId: "b", subjectId: "math", status: "APPROVED" },
      { studentId: "a", subjectId: "bio", status: "DRAFT" },
    ];
    const cols = buildSubjectStatusCols(subjects, students, marks, { math: "Anita" });
    const math = cols.find((s) => s.id === "math");
    const bio = cols.find((s) => s.id === "bio");
    assert.equal(math.complete, true);
    assert.equal(math.teacher, "Anita");
    assert.equal(bio.complete, false);
    assert.equal(bio.drafts, 1);

    const summary = summarizeClassStatus({
      cls,
      subjects,
      students,
      marks,
      teacherBySubject: { math: "Anita" },
      activeStudentCount: 2,
    });
    assert.equal(summary.ready, false);
    assert.equal(summary.complete, false);
    assert.equal(summary.draftCount, 1);
    assert.deepEqual(summary.missingSubjects, ["Biology"]);
    assert.equal(summary.approvedSubjects, 1);
    assert.equal(summary.totalSubjects, 2);
  });

  it("is ready when every subject is fully approved and no drafts remain", () => {
    const marks = [
      { studentId: "a", subjectId: "math", status: "APPROVED" },
      { studentId: "b", subjectId: "math", status: "APPROVED" },
      { studentId: "a", subjectId: "bio", status: "APPROVED" },
      { studentId: "b", subjectId: "bio", status: "APPROVED" },
    ];
    const summary = summarizeClassStatus({ cls, subjects, students, marks, activeStudentCount: 2 });
    assert.equal(summary.ready, true);
    assert.equal(summary.complete, true);
    assert.equal(summary.draftCount, 0);
    assert.deepEqual(summary.missingSubjects, []);
  });
});
