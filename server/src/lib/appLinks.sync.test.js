import assert from "node:assert/strict";
import test from "node:test";
import { paths } from "../../../client/src/lib/nav.js";
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

test("server appLinks stay aligned with client paths helpers", () => {
  assert.equal(classSectionAnalysisLink("c1"), paths.classSection("c1"));
  assert.equal(studentAnalysisLink("s1"), paths.student("s1"));
  assert.equal(teacherAnalysisLink("t1"), paths.teacher("t1"));
  assert.equal(classGroupAnalysisLink("10"), paths.classGroup("10"));
  assert.equal(subjectByNameLink("Math"), paths.subjectByName("Math"));
  assert.equal(compareTeachersLink("Physics"), paths.compareTeachers("Physics"));

  assert.equal(marksRegisterLink(), paths.marks());
  assert.equal(marksRegisterLink({ examId: "e1" }), paths.marks({ examId: "e1" }));
  assert.equal(
    marksRegisterLink({ examId: "e1", classSectionId: "c1", subjectId: "s1" }),
    paths.marks({ examId: "e1", classSectionId: "c1", subjectId: "s1" })
  );

  assert.equal(pendingUploadsLink(), paths.pendingUploads());
  assert.equal(pendingUploadsLink({ examId: "e1" }), paths.pendingUploads({ examId: "e1" }));

  assert.equal(accessRequestsLink(), paths.accessRequests());
  assert.equal(
    accessRequestsLink({ status: "PENDING", kind: "EDIT", examId: "e1" }),
    paths.accessRequests({ status: "PENDING", kind: "EDIT", examId: "e1" })
  );
});
