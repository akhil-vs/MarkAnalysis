import assert from "node:assert/strict";
import test from "node:test";
import {
  classRomanBadge,
  classSectionStatus,
  classTierLabel,
  rosterCapacity,
} from "./classRecordPresentation.js";

test("classRomanBadge converts numeric grades", () => {
  assert.equal(classRomanBadge("10"), "X");
  assert.equal(classRomanBadge("6"), "VI");
});

test("classTierLabel maps school tiers", () => {
  assert.match(classTierLabel("10"), /secondary/i);
  assert.match(classTierLabel("6"), /middle/i);
});

test("rosterCapacity uses nominal cap of 35", () => {
  assert.deepEqual(rosterCapacity(32), { count: 32, cap: 35, pct: 91 });
  assert.deepEqual(rosterCapacity(0), { count: 0, cap: 35, pct: 0 });
});

test("classSectionStatus reflects teacher and enrollment", () => {
  assert.equal(classSectionStatus({ classTeacherId: null, _count: { students: 5 } }).key, "needs_faculty");
  assert.equal(classSectionStatus({ classTeacherId: "t1", _count: { students: 0 } }).key, "roster_open");
  assert.equal(classSectionStatus({ classTeacherId: "t1", _count: { students: 35 } }).key, "at_capacity");
});
