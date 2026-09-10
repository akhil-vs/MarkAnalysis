import assert from "node:assert/strict";
import test from "node:test";
import {
  DEEP_INSIGHT_HELP,
  PAGE_HELP,
  helpForPath,
  helpIdForPath,
  navItemIds,
} from "../../../client/src/lib/pageHelp.js";

test("every sidebar menu item has page help with about + useful", () => {
  const ids = navItemIds();
  assert.ok(ids.length >= 18, "expected the full sidebar set");
  for (const id of ids) {
    const help = id === "dashboard" ? PAGE_HELP.dashboard : PAGE_HELP[id];
    assert.ok(help, `missing PAGE_HELP.${id}`);
    assert.ok(help.about?.length > 40, `${id} about text is too short`);
    assert.ok(help.useful?.length > 40, `${id} useful text is too short`);
  }
});

test("role-specific dashboard help is distinct", () => {
  const principal = helpForPath("/", "PRINCIPAL");
  const coordinator = helpForPath("/", "EXAM_COORDINATOR");
  const teacher = helpForPath("/", "TEACHER");
  assert.equal(helpIdForPath("/"), "dashboard");
  assert.notEqual(principal.about, coordinator.about);
  assert.notEqual(principal.about, teacher.about);
  assert.match(principal.about, /School-wide/);
  assert.match(coordinator.about, /upload queue/i);
  assert.match(teacher.about, /Your papers/);
});

test("nested analysis routes inherit the menu page help", () => {
  assert.equal(helpIdForPath("/analysis/classes/abc"), "analysisClasses");
  assert.equal(helpIdForPath("/analysis/students/s1"), "analysisStudents");
  assert.equal(helpIdForPath("/analysis/teachers/t1"), "analysisTeachers");
  assert.equal(helpIdForPath("/analysis/school"), "analysisSchool");
  assert.equal(helpIdForPath("/analysis/deep"), "analysisDeep");
  assert.equal(helpIdForPath("/timetables/teachers/t1"), "timetables");
  assert.equal(helpForPath("/analysis/deep").title, PAGE_HELP.analysisDeep.title);
});

test("each deep insight tab explains what it is and how it is useful", () => {
  const tabs = ["outcomes", "readiness", "division", "improvement", "promotion", "teachers", "weighted"];
  for (const id of tabs) {
    const help = DEEP_INSIGHT_HELP[id];
    assert.ok(help, `missing DEEP_INSIGHT_HELP.${id}`);
    assert.ok(help.title);
    assert.ok(help.about?.length > 60, `${id} about is too short`);
    assert.ok(help.useful?.length > 40, `${id} useful is too short`);
  }
});
