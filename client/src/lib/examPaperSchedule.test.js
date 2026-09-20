import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPaperDrafts,
  copyClassScheduleToAll,
  papersPayloadFromDrafts,
} from "./examPaperSchedule.js";

describe("examPaperSchedule helpers", () => {
  it("copyClassScheduleToAll copies date and times by subject name", () => {
    const drafts = [
      {
        subjectId: "bio-9",
        subjectName: "Biology",
        className: "9",
        paperDate: "2026-10-04",
        startTime: "08:00",
        endTime: "09:00",
        venue: "",
      },
      {
        subjectId: "math-9",
        subjectName: "Mathematics",
        className: "9",
        paperDate: "2026-10-13",
        startTime: "08:00",
        endTime: "09:00",
        venue: "",
      },
      {
        subjectId: "bio-10",
        subjectName: "Biology",
        className: "10",
        paperDate: "",
        startTime: "",
        endTime: "",
        venue: "",
      },
      {
        subjectId: "math-10",
        subjectName: "Mathematics",
        className: "10",
        paperDate: "",
        startTime: "",
        endTime: "",
        venue: "",
      },
    ];
    const copied = copyClassScheduleToAll(drafts, "9");
    const bio10 = copied.find((r) => r.subjectId === "bio-10");
    const math10 = copied.find((r) => r.subjectId === "math-10");
    assert.equal(bio10.paperDate, "2026-10-04");
    assert.equal(bio10.startTime, "08:00");
    assert.equal(bio10.endTime, "09:00");
    assert.equal(math10.paperDate, "2026-10-13");
    assert.equal(math10.startTime, "08:00");
    const payload = papersPayloadFromDrafts(copied);
    assert.equal(payload.length, 4);
    assert.ok(payload.every((p) => p.startTime === "08:00"));
  });

  it("buildPaperDrafts keeps start times from schedules", () => {
    const drafts = buildPaperDrafts(
      [{ id: "s1", name: "English", className: "10" }],
      [
        {
          subjectId: "s1",
          paperDate: "2026-10-01T00:00:00.000Z",
          startTime: "09:30",
          endTime: "11:00",
        },
      ]
    );
    assert.equal(drafts[0].paperDate, "2026-10-01");
    assert.equal(drafts[0].startTime, "09:30");
    assert.equal(drafts[0].endTime, "11:00");
  });
});
