import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { benchmarkStatus, filterHubRows, sortHubRows } from "../lib/curricularHub.js";

describe("benchmarkStatus", () => {
  it("marks missing averages as grading in progress", () => {
    assert.equal(benchmarkStatus(null, 72).text, "Grading in progress");
    assert.equal(benchmarkStatus(undefined, 72).tone, "neutral");
  });

  it("compares against school target", () => {
    assert.equal(benchmarkStatus(78, 72).text, "Above school target");
    assert.equal(benchmarkStatus(70, 72).text, "Approaching benchmark");
    assert.equal(benchmarkStatus(60, 72).text, "Below benchmark");
  });
});

describe("filterHubRows", () => {
  const rows = [
    { label: "Class 10", searchText: "Class 10 10 class" },
    { label: "10-A", searchText: "10-A 10 A Anita Sharma" },
    { label: "Mathematics", searchText: "Mathematics Meera Iyer" },
  ];

  it("filters by standard, division, or faculty haystack", () => {
    assert.equal(filterHubRows(rows, "anita").length, 1);
    assert.equal(filterHubRows(rows, "10").length, 2);
    assert.equal(filterHubRows(rows, "math").length, 1);
    assert.equal(filterHubRows(rows, "").length, 3);
  });
});

describe("sortHubRows", () => {
  const rows = [
    { label: "A", average: 60, passRate: 90, enrollment: 40 },
    { label: "B", average: 80, passRate: 70, enrollment: 25 },
    { label: "C", average: null, passRate: 50, enrollment: 100 },
  ];

  it("sorts by average, pass rate, and enrollment descending", () => {
    assert.deepEqual(
      sortHubRows(rows, "average").map((r) => r.label),
      ["B", "A", "C"]
    );
    assert.deepEqual(
      sortHubRows(rows, "passRate").map((r) => r.label),
      ["A", "B", "C"]
    );
    assert.deepEqual(
      sortHubRows(rows, "enrollment").map((r) => r.label),
      ["C", "A", "B"]
    );
  });
});
