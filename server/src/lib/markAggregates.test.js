import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergePaperStats, statsFields, yearSeriesFromAgg } from "./markAggregates.js";

describe("markAggregates helpers", () => {
  it("statsFields defaults empty rows", () => {
    assert.deepEqual(statsFields(null), {
      average: null,
      median: null,
      highest: null,
      lowest: null,
      passRate: 0,
      count: 0,
    });
    assert.equal(statsFields({ average: 72.5, passRate: 80, count: 10 }).average, 72.5);
  });

  it("mergePaperStats weights by mark count", () => {
    const merged = mergePaperStats([
      { average: 80, passRate: 100, count: 2, highest: 90, lowest: 70 },
      { average: 60, passRate: 50, count: 2, highest: 70, lowest: 50 },
    ]);
    assert.equal(merged.average, 70);
    assert.equal(merged.count, 4);
    assert.equal(merged.passRate, 75);
    assert.equal(merged.highest, 90);
    assert.equal(merged.lowest, 50);
  });

  it("yearSeriesFromAgg maps same-type exams", () => {
    const exam = { id: "e2", type: "FINAL", name: "Final 25", academicYear: "2025-26", date: "2025-03-01" };
    const exams = [
      { id: "e1", type: "FINAL", name: "Final 24", academicYear: "2024-25", date: "2024-03-01" },
      exam,
      { id: "e3", type: "UNIT", name: "UT1", academicYear: "2025-26", date: "2025-01-01" },
    ];
    const series = yearSeriesFromAgg(
      [
        { examId: "e1", average: 65, passRate: 70, count: 100 },
        { examId: "e2", average: 72, passRate: 80, count: 110 },
      ],
      exams,
      exam
    );
    assert.equal(series.length, 2);
    assert.equal(series[0].examId, "e1");
    assert.equal(series[0].average, 65);
    assert.equal(series[1].examId, "e2");
    assert.equal(series[1].average, 72);
  });
});
