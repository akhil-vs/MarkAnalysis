import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  indexMarksByPaper,
  indexMarksBySubject,
  marksForPaper,
  slimPendingUploads,
  subjectCorrelations,
  subjectCorrelationsFromPercents,
  subjectDifficulty,
  subjectDifficultyFromAgg,
  teacherSubjectAverages,
  teacherSubjectAveragesFromAgg,
} from "./dashboardAgg.js";

describe("dashboardAgg", () => {
  const marks = [
    {
      studentId: "s1",
      subjectId: "math",
      subject: { name: "Math", maxMarks: 100 },
      student: { classSectionId: "c1" },
      marksObtained: 80,
      outcome: "SCORED",
    },
    {
      studentId: "s1",
      subjectId: "eng",
      subject: { name: "English", maxMarks: 100 },
      student: { classSectionId: "c1" },
      marksObtained: 70,
      outcome: "SCORED",
    },
    {
      studentId: "s2",
      subjectId: "math",
      subject: { name: "Math", maxMarks: 100 },
      student: { classSectionId: "c1" },
      marksObtained: 40,
      outcome: "SCORED",
    },
  ];

  it("indexes marks by subject and paper", () => {
    const bySubject = indexMarksBySubject(marks);
    assert.equal(bySubject.get("math").length, 2);
    const byPaper = indexMarksByPaper(marks);
    assert.equal(marksForPaper(byPaper, "math", "c1").length, 2);
    assert.equal(marksForPaper(byPaper, "eng", "c1").length, 1);
  });

  it("builds difficulty and teacher averages without repeated filters", () => {
    const subjects = [
      { id: "math", name: "Math" },
      { id: "eng", name: "English" },
    ];
    const difficulty = subjectDifficulty(subjects, indexMarksBySubject(marks));
    assert.equal(difficulty[0].name, "Math"); // lower average first (60 vs 70)
    assert.equal(difficulty[0].count, 2);

    const assignments = [
      {
        user: { name: "Anita" },
        subject: { name: "Math" },
        classSection: { className: "10", section: "A" },
        subjectId: "math",
        classSectionId: "c1",
      },
    ];
    const rows = teacherSubjectAverages(assignments, indexMarksByPaper(marks));
    assert.equal(rows[0].teacher, "Anita");
    assert.equal(rows[0].average, 60);
  });

  it("computes correlations once per subject pair", () => {
    const withPair = [
      ...marks,
      {
        studentId: "s2",
        subjectId: "eng",
        subject: { name: "English", maxMarks: 100 },
        student: { classSectionId: "c1" },
        marksObtained: 50,
        outcome: "SCORED",
      },
      {
        studentId: "s3",
        subjectId: "math",
        subject: { name: "Math", maxMarks: 100 },
        student: { classSectionId: "c1" },
        marksObtained: 60,
        outcome: "SCORED",
      },
      {
        studentId: "s3",
        subjectId: "eng",
        subject: { name: "English", maxMarks: 100 },
        student: { classSectionId: "c1" },
        marksObtained: 55,
        outcome: "SCORED",
      },
    ];
    const corr = subjectCorrelations(withPair, ["Math", "English"]);
    assert.equal(corr.length, 1);
    assert.ok(typeof corr[0].r === "number");
  });

  it("builds difficulty/teacher averages from SQL aggregate rows", () => {
    const subjects = [
      { id: "math", name: "Math" },
      { id: "eng", name: "English" },
    ];
    const difficulty = subjectDifficultyFromAgg(subjects, [
      { subjectId: "math", average: 60, passRate: 50, count: 2 },
      { subjectId: "eng", average: 70, passRate: 100, count: 1 },
    ]);
    assert.equal(difficulty[0].name, "Math");
    assert.equal(difficulty[0].count, 2);

    const rows = teacherSubjectAveragesFromAgg(
      [
        {
          user: { name: "Anita" },
          subject: { name: "Math" },
          classSection: { className: "10", section: "A" },
          subjectId: "math",
          classSectionId: "c1",
        },
      ],
      [{ subjectId: "math", classSectionId: "c1", average: 60, passRate: 50, count: 2 }]
    );
    assert.equal(rows[0].average, 60);
    assert.equal(rows[0].passRate, 50);
  });

  it("computes correlations from slim percent rows", () => {
    const corr = subjectCorrelationsFromPercents(
      [
        { studentId: "s1", subjectName: "Math", pct: 80 },
        { studentId: "s1", subjectName: "English", pct: 70 },
        { studentId: "s2", subjectName: "Math", pct: 40 },
        { studentId: "s2", subjectName: "English", pct: 50 },
      ],
      ["Math", "English"]
    );
    assert.equal(corr.length, 1);
    assert.ok(typeof corr[0].r === "number");
  });

  it("slims pending uploads to incomplete teachers", () => {
    const slim = slimPendingUploads({
      pendingTeacherCount: 1,
      awaitingApprovalTeacherCount: 1,
      teachers: [
        { teacherId: "a", pending: true, awaitingApproval: false },
        { teacherId: "b", pending: false, awaitingApproval: true },
        { teacherId: "c", pending: false, awaitingApproval: false },
      ],
    });
    assert.equal(slim.teachers.length, 2);
    assert.equal(slim.pendingTeacherCount, 1);
  });
});
