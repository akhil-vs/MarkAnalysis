import assert from "node:assert/strict";
import test from "node:test";
import {
  accessRequestsLink,
  classGroupAnalysisLink,
  classSectionAnalysisLink,
  compareTeachersLink,
  marksRegisterLink,
  pendingUploadsLink,
  studentAnalysisLink,
  subjectByNameLink,
  teacherAnalysisLink,
} from "./appLinks.js";

test("marksRegisterLink builds query consistently", () => {
  assert.equal(marksRegisterLink(), "/marks");
  assert.equal(marksRegisterLink({ examId: "e1" }), "/marks?examId=e1");
  assert.equal(
    marksRegisterLink({ examId: "e1", classSectionId: "c1", subjectId: "s1" }),
    "/marks?examId=e1&classSectionId=c1&subjectId=s1"
  );
});

test("pendingUploadsLink and accessRequestsLink", () => {
  assert.equal(pendingUploadsLink(), "/pending-uploads");
  assert.equal(pendingUploadsLink({ examId: "e1" }), "/pending-uploads?examId=e1");
  assert.equal(accessRequestsLink(), "/late-entry?status=PENDING");
  assert.equal(
    accessRequestsLink({ status: "PENDING", kind: "EDIT", examId: "e1" }),
    "/late-entry?status=PENDING&kind=EDIT&examId=e1"
  );
});

test("analysis detail links nest under /analysis", () => {
  assert.equal(classSectionAnalysisLink("c1"), "/analysis/classes/c1");
  assert.equal(studentAnalysisLink("s1"), "/analysis/students/s1");
  assert.equal(teacherAnalysisLink("t1"), "/analysis/teachers/t1");
  assert.equal(classGroupAnalysisLink("10"), "/analysis/classes/group/10");
  assert.equal(subjectByNameLink("Math"), "/analysis/subjects/name/Math");
  assert.equal(compareTeachersLink("Physics"), "/analysis/compare?tab=teachers&subject=Physics");
});
