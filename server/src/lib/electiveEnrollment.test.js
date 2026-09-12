import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  electiveEnrollmentMap,
  enrollmentKeySet,
  studentTakesSubject,
  studentsExpectedForSubject,
} from "./electiveEnrollment.js";

describe("electiveEnrollment", () => {
  const core = { id: "eng", name: "English", isElective: false };
  const elective = { id: "comp", name: "Computer", isElective: true };
  const students = [
    { id: "s1", name: "Ada" },
    { id: "s2", name: "Ben" },
    { id: "s3", name: "Cara" },
  ];
  const keys = enrollmentKeySet([
    { studentId: "s1", subjectId: "comp" },
    { studentId: "s3", subjectId: "comp" },
  ]);

  it("treats core subjects as taken by everyone", () => {
    assert.equal(studentTakesSubject(core, "s2", keys), true);
    assert.equal(studentsExpectedForSubject(core, students, keys).length, 3);
  });

  it("limits electives to enrolled students", () => {
    assert.equal(studentTakesSubject(elective, "s1", keys), true);
    assert.equal(studentTakesSubject(elective, "s2", keys), false);
    assert.deepEqual(
      studentsExpectedForSubject(elective, students, keys).map((s) => s.id),
      ["s1", "s3"]
    );
  });

  it("builds elective enrollment map keyed by subject", () => {
    const map = electiveEnrollmentMap([core, elective], [
      { studentId: "s1", subjectId: "comp" },
      { studentId: "s3", subjectId: "comp" },
      { studentId: "s2", subjectId: "eng" },
    ]);
    assert.deepEqual(map, { comp: ["s1", "s3"] });
  });
});
