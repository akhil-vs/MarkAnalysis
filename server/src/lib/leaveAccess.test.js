import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listLeaveStakeholderUserIds,
  timetableLink,
} from "./leaveAccess.js";

describe("timetableLink", () => {
  it("builds leave mode deep links", () => {
    assert.equal(timetableLink("2026-09-22", "leave"), "/timetables?mode=leave&date=2026-09-22");
    assert.equal(timetableLink(null, "daily"), "/timetables?mode=daily");
  });
});

describe("listLeaveStakeholderUserIds title matching", () => {
  it("exports a callable helper", () => {
    assert.equal(typeof listLeaveStakeholderUserIds, "function");
  });
});
