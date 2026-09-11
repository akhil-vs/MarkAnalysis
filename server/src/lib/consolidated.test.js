import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyExamConsolidationMax, buildConsolidatedStudentRows, scaleMarksToConsolidation } from "./consolidatedRows.js";

describe("buildConsolidatedStudentRows", () => {
  const subjects = [
    { id: "math", name: "Math", maxMarks: 100, consolidationMaxMarks: 100 },
    { id: "eng", name: "English", maxMarks: 100, consolidationMaxMarks: 100 },
  ];
  const students = [
    { id: "a", rollNo: "1", name: "Ada" },
    { id: "b", rollNo: "2", name: "Ben" },
  ];

  it("calculates total, percent, grade, and rank from draft marks", () => {
    const marks = [
      { studentId: "a", subjectId: "math", marksObtained: 80, outcome: "SCORED", status: "DRAFT" },
      { studentId: "a", subjectId: "eng", marksObtained: 90, outcome: "SCORED", status: "DRAFT" },
      { studentId: "b", subjectId: "math", marksObtained: 70, outcome: "SCORED", status: "SUBMITTED" },
      { studentId: "b", subjectId: "eng", marksObtained: 60, outcome: "SCORED", status: "SUBMITTED" },
    ];

    const rows = buildConsolidatedStudentRows(students, subjects, marks);
    const ada = rows.find((r) => r.studentId === "a");
    const ben = rows.find((r) => r.studentId === "b");

    assert.equal(ada.total, 170);
    assert.equal(ada.percent, 85);
    assert.equal(ada.grade, "A");
    assert.equal(ada.rank, 1);

    assert.equal(ben.total, 130);
    assert.equal(ben.percent, 65);
    assert.equal(ben.grade, "C");
    assert.equal(ben.rank, 2);
  });

  it("skips absent papers in percent but still ranks scored work", () => {
    const marks = [
      { studentId: "a", subjectId: "math", marksObtained: 80, outcome: "SCORED", status: "APPROVED" },
      { studentId: "a", subjectId: "eng", marksObtained: null, outcome: "ABSENT", status: "APPROVED" },
      { studentId: "b", subjectId: "math", marksObtained: 40, outcome: "SCORED", status: "APPROVED" },
      { studentId: "b", subjectId: "eng", marksObtained: 40, outcome: "SCORED", status: "APPROVED" },
    ];

    const rows = buildConsolidatedStudentRows(students, subjects, marks);
    const ada = rows.find((r) => r.studentId === "a");
    const ben = rows.find((r) => r.studentId === "b");

    assert.equal(ada.total, 80);
    assert.equal(ada.maxTotal, 100);
    assert.equal(ada.percent, 80);
    assert.equal(ada.rank, 1);
    assert.equal(ben.percent, 40);
    assert.equal(ben.rank, 2);
  });

  it("leaves total and rank empty when no marks are entered", () => {
    const rows = buildConsolidatedStudentRows(students, subjects, []);
    assert.equal(rows[0].total, null);
    assert.equal(rows[0].percent, null);
    assert.equal(rows[0].rank, null);
    assert.equal(rows[0].maxTotal, 200);
  });

  it("scales a full 80-mark paper onto a 100 consolidation ceiling", () => {
    const papers = [
      { id: "math", name: "Math", maxMarks: 80, consolidationMaxMarks: 100 },
      { id: "eng", name: "English", maxMarks: 80, consolidationMaxMarks: 100 },
    ];
    const marks = [
      { studentId: "a", subjectId: "math", marksObtained: 80, outcome: "SCORED", status: "APPROVED" },
      { studentId: "a", subjectId: "eng", marksObtained: 80, outcome: "SCORED", status: "APPROVED" },
    ];
    const rows = buildConsolidatedStudentRows(students, papers, marks);
    const ada = rows.find((r) => r.studentId === "a");
    assert.equal(ada.bySubject.math.marks, 100);
    assert.equal(ada.bySubject.math.percent, 100);
    assert.equal(ada.total, 200);
    assert.equal(ada.maxTotal, 200);
    assert.equal(ada.percent, 100);
    assert.equal(ada.bySubject.math.max, 100);
  });

  it("does not let percentages exceed 100 when consolidation max is below entry max", () => {
    const papers = [
      { id: "chem", name: "Chemistry", maxMarks: 100, consolidationMaxMarks: 80 },
      { id: "eng", name: "English", maxMarks: 100, consolidationMaxMarks: 80 },
    ];
    const marks = [
      { studentId: "a", subjectId: "chem", marksObtained: 90, outcome: "SCORED", status: "APPROVED" },
      { studentId: "a", subjectId: "eng", marksObtained: 90, outcome: "SCORED", status: "APPROVED" },
    ];
    const rows = buildConsolidatedStudentRows(students, papers, marks);
    const ada = rows.find((r) => r.studentId === "a");
    assert.equal(ada.bySubject.chem.marks, 72);
    assert.equal(ada.bySubject.chem.percent, 90);
    assert.equal(ada.total, 144);
    assert.equal(ada.maxTotal, 160);
    assert.equal(ada.percent, 90);
    assert.ok(ada.percent <= 100);
    assert.ok(ada.bySubject.chem.marks <= 80);
  });
});

describe("scaleMarksToConsolidation", () => {
  it("leaves marks unchanged when ceilings match", () => {
    assert.equal(scaleMarksToConsolidation(90, { maxMarks: 100, consolidationMaxMarks: 100 }), 90);
  });

  it("scales down so chemistry marks stay within a 80-point consolidation ceiling", () => {
    assert.equal(scaleMarksToConsolidation(90, { maxMarks: 100, consolidationMaxMarks: 80 }), 72);
    assert.equal(scaleMarksToConsolidation(100, { maxMarks: 100, consolidationMaxMarks: 80 }), 80);
  });

  it("caps raw marks that already exceed the consolidation ceiling", () => {
    assert.equal(scaleMarksToConsolidation(110, { maxMarks: 100, consolidationMaxMarks: 100 }), 100);
    assert.equal(scaleMarksToConsolidation(110, { maxMarks: 100, consolidationMaxMarks: 80 }), 80);
  });
});

describe("applyExamConsolidationMax", () => {
  it("stamps the exam ceiling onto every subject", () => {
    const papers = applyExamConsolidationMax(
      [
        { id: "math", name: "Math", maxMarks: 80 },
        { id: "eng", name: "English", maxMarks: 100 },
      ],
      { consolidationMaxMarks: 50 }
    );
    assert.equal(papers[0].consolidationMaxMarks, 50);
    assert.equal(papers[1].consolidationMaxMarks, 50);
    assert.equal(papers[0].maxMarks, 80);
  });

  it("leaves subjects unchanged when the exam has no ceiling", () => {
    const subjects = [{ id: "math", maxMarks: 100 }];
    assert.equal(applyExamConsolidationMax(subjects, {}), subjects);
  });
});
