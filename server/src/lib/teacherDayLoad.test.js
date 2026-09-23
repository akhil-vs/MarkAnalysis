import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTeacherDayLoad } from "./teacherDayLoad.js";

const PERIODS = [
  { id: "p1", name: "Period 1", sortOrder: 1, startTime: "08:00", endTime: "08:45", isBreak: false },
  { id: "p2", name: "Period 2", sortOrder: 2, startTime: "08:45", endTime: "09:30", isBreak: false },
  { id: "p3", name: "Period 3", sortOrder: 3, startTime: "09:30", endTime: "10:15", isBreak: false },
];

const TEMPLATE = [
  {
    periodId: "p1",
    period: PERIODS[0],
    classSectionId: "c1",
    classSection: { className: "10", section: "A", label: "10-A" },
    subject: { name: "Math" },
  },
  {
    periodId: "p2",
    period: PERIODS[1],
    classSectionId: "c2",
    classSection: { className: "9", section: "B", label: "9-B" },
    subject: { name: "Science" },
  },
];

describe("buildTeacherDayLoad", () => {
  it("counts own classes and minutes with no leave or cover", () => {
    const day = buildTeacherDayLoad({
      teacherId: "t1",
      dateYmd: "2026-09-22",
      dayOfWeek: 1,
      periods: PERIODS,
      templateEntries: TEMPLATE,
      leaves: [],
      substitutions: [],
    });
    assert.equal(day.taughtCount, 2);
    assert.equal(day.taughtMinutes, 90);
    assert.equal(day.extraCount, 0);
    assert.equal(day.extraMinutes, 0);
    assert.equal(day.onLeave, false);
    assert.deepEqual(
      day.classes.map((c) => c.kind),
      ["own", "own"]
    );
  });

  it("excludes leave periods from taught hours and marks uncovered", () => {
    const day = buildTeacherDayLoad({
      teacherId: "t1",
      dateYmd: "2026-09-22",
      dayOfWeek: 1,
      periods: PERIODS,
      templateEntries: TEMPLATE,
      leaves: [
        {
          teacherId: "t1",
          startDate: "2026-09-22",
          endDate: "2026-09-22",
          leaveType: "FULL_DAY",
          periodIds: [],
          status: "ACTIVE",
        },
      ],
      substitutions: [],
    });
    assert.equal(day.onLeave, true);
    assert.equal(day.taughtCount, 0);
    assert.equal(day.taughtMinutes, 0);
    assert.equal(day.missedCount, 2);
    assert.equal(day.missedMinutes, 90);
    assert.ok(day.classes.every((c) => c.kind === "uncovered"));
  });

  it("counts cover assignments as extra hours and lists the class", () => {
    const day = buildTeacherDayLoad({
      teacherId: "t1",
      dateYmd: "2026-09-22",
      dayOfWeek: 1,
      periods: PERIODS,
      templateEntries: TEMPLATE,
      leaves: [],
      substitutions: [
        {
          substituteTeacherId: "t1",
          originalTeacherId: "t2",
          periodId: "p3",
          period: PERIODS[2],
          classSection: { className: "8", section: "C", label: "8-C" },
          subject: { name: "English" },
          originalTeacher: { name: "Other Teacher" },
        },
      ],
    });
    assert.equal(day.taughtCount, 2);
    assert.equal(day.extraCount, 1);
    assert.equal(day.extraMinutes, 45);
    assert.equal(day.totalMinutes, 135);
    const extra = day.classes.find((c) => c.kind === "extra");
    assert.equal(extra.classLabel, "8-C");
    assert.equal(extra.forTeacherName, "Other Teacher");
  });

  it("marks covered leave periods when a substitute is assigned", () => {
    const day = buildTeacherDayLoad({
      teacherId: "t1",
      dateYmd: "2026-09-22",
      dayOfWeek: 1,
      periods: PERIODS,
      templateEntries: [TEMPLATE[0]],
      leaves: [
        {
          teacherId: "t1",
          startDate: "2026-09-22",
          endDate: "2026-09-22",
          leaveType: "FULL_DAY",
          periodIds: [],
          status: "ACTIVE",
        },
      ],
      substitutions: [
        {
          originalTeacherId: "t1",
          substituteTeacherId: "t2",
          periodId: "p1",
          classSectionId: "c1",
          substituteTeacher: { name: "Cover Teacher" },
        },
      ],
    });
    assert.equal(day.classes[0].kind, "covered");
    assert.equal(day.classes[0].coveredByName, "Cover Teacher");
    assert.equal(day.taughtCount, 0);
  });
});
