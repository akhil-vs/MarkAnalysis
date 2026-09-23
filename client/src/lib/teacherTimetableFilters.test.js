import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TEACHER_TIMETABLE_FILTERS,
  teacherClassOptions,
  teacherMatchesFilters,
  teacherSubjectOptions,
} from "./teacherTimetableFilters.js";

const teachers = [
  {
    id: "t1",
    name: "Anita Sharma",
    assignments: [
      {
        classSection: { id: "c8a", className: "8", section: "A", label: "8-A" },
        subject: { id: "s-math-8", name: "Mathematics" },
      },
      {
        classSection: { id: "c8b", className: "8", section: "B", label: "8-B" },
        subject: { id: "s-math-8b", name: "Mathematics" },
      },
    ],
  },
  {
    id: "t2",
    name: "Rahul Mehta",
    assignments: [
      {
        classSection: { id: "c11a", className: "11", section: "A", label: "11-A" },
        subject: { id: "s-phy-11", name: "Physics" },
      },
    ],
  },
  {
    id: "t3",
    name: "Unassigned",
    assignments: [],
  },
];

describe("teacherClassOptions", () => {
  it("returns unique class sections sorted numerically", () => {
    assert.deepEqual(
      teacherClassOptions(teachers).map((c) => c.label),
      ["8-A", "8-B", "11-A"]
    );
  });

  it("falls back to className-section when label is missing", () => {
    const list = teacherClassOptions([
      {
        assignments: [{ classSection: { id: "c9b", className: "9", section: "B" }, subject: { name: "English" } }],
      },
    ]);
    assert.deepEqual(list, [{ id: "c9b", label: "9-B" }]);
  });

  it("skips incomplete assignments", () => {
    assert.deepEqual(
      teacherClassOptions([{ assignments: [{ classSection: { id: "", label: "8-A" } }, { subject: { name: "Math" } }] }]),
      []
    );
  });
});

describe("teacherSubjectOptions", () => {
  it("returns unique subject names sorted alphabetically", () => {
    assert.deepEqual(teacherSubjectOptions(teachers), ["Mathematics", "Physics"]);
  });
});

describe("teacherMatchesFilters", () => {
  it("keeps every teacher when filters are empty", () => {
    assert.equal(teachers.filter((t) => teacherMatchesFilters(t, {})).length, 3);
  });

  it("filters by class section", () => {
    const matched = teachers.filter((t) => teacherMatchesFilters(t, { classSectionId: "c8a" }));
    assert.deepEqual(
      matched.map((t) => t.id),
      ["t1"]
    );
  });

  it("filters by subject name across classes", () => {
    const matched = teachers.filter((t) => teacherMatchesFilters(t, { subjectName: "Mathematics" }));
    assert.deepEqual(
      matched.map((t) => t.id),
      ["t1"]
    );
  });

  it("requires both class and subject when both are set", () => {
    assert.equal(teacherMatchesFilters(teachers[0], { classSectionId: "c8a", subjectName: "Mathematics" }), true);
    assert.equal(teacherMatchesFilters(teachers[0], { classSectionId: "c8a", subjectName: "Physics" }), false);
    assert.equal(teacherMatchesFilters(teachers[1], { classSectionId: "c8a", subjectName: "Physics" }), false);
  });
});

describe("TEACHER_TIMETABLE_FILTERS", () => {
  it("exposes class and subject keys for useTableSearch", () => {
    assert.deepEqual(
      TEACHER_TIMETABLE_FILTERS.map((d) => d.key),
      ["classSectionId", "subjectName"]
    );
  });
});
