import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EDIT_LOCKED_BLOCKED,
  LATE_ENTRY_BLOCKED,
  mutateBlockFromAccess,
} from "./markAccess.js";
import {
  applyMarkPlans,
  mapInChunks,
  normalizeMarkEntries,
  planMarkMutations,
  resultFromPlan,
} from "./markSave.js";

describe("normalizeMarkEntries", () => {
  it("drops incomplete rows and keeps the last duplicate", () => {
    const out = normalizeMarkEntries([
      { studentId: "s1", subjectId: "sub1", marksObtained: "10" },
      { studentId: "s1", subjectId: "sub1", marksObtained: "20" },
      { studentId: "", subjectId: "sub1", marksObtained: "1" },
      { studentId: "s2", marksObtained: "5" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].marksObtained, "20");
  });
});

describe("mutateBlockFromAccess", () => {
  it("blocks past-deadline entry without approval", () => {
    assert.equal(mutateBlockFromAccess({ canEnter: false, canEditLocked: false }, null), LATE_ENTRY_BLOCKED);
  });

  it("blocks locked marks without edit grant", () => {
    assert.equal(
      mutateBlockFromAccess({ canEnter: true, canEditLocked: false }, "SUBMITTED"),
      EDIT_LOCKED_BLOCKED
    );
  });

  it("allows draft entry when canEnter", () => {
    assert.equal(mutateBlockFromAccess({ canEnter: true, canEditLocked: false }, "DRAFT"), null);
  });
});

describe("planMarkMutations", () => {
  const studentMap = new Map([
    ["s1", { id: "s1", classSectionId: "c1" }],
    ["s2", { id: "s2", classSectionId: "c1" }],
  ]);
  const subjectMap = new Map([["math", { id: "math", maxMarks: 100 }]]);
  const markMap = new Map([
    [
      "s1:math",
      {
        id: "m1",
        studentId: "s1",
        subjectId: "math",
        outcome: "SCORED",
        marksObtained: 40,
        status: "DRAFT",
      },
    ],
    [
      "s2:math",
      {
        id: "m2",
        studentId: "s2",
        subjectId: "math",
        outcome: "SCORED",
        marksObtained: 55,
        status: "SUBMITTED",
      },
    ],
  ]);

  it("plans upsert, unchanged, delete, and access errors without DB I/O", () => {
    const entries = normalizeMarkEntries([
      { studentId: "s1", subjectId: "math", marksObtained: "80" },
      { studentId: "s1", subjectId: "missing", marksObtained: "1" },
      { studentId: "s2", subjectId: "math", marksObtained: "55" },
      { studentId: "s2", subjectId: "math", marksObtained: "" },
    ]);
    const plans = planMarkMutations({
      entries,
      studentMap,
      subjectMap,
      markMap,
      writableKeys: new Set(["c1:math"]),
      accessBySubject: {
        math: { canEnter: true, canEditLocked: false },
      },
    });

    // Last duplicate for s2:math wins (empty → delete), but submitted without edit → error
    assert.equal(plans.length, 3);
    assert.equal(plans[0].type, "upsert");
    assert.equal(plans[0].parsed.marksObtained, 80);
    assert.equal(plans[1].type, "error");
    assert.match(plans[1].error, /not found/i);
    assert.equal(plans[2].type, "error");
    assert.equal(plans[2].error, EDIT_LOCKED_BLOCKED);
  });

  it("plans delete when clearing a draft cell", () => {
    const plans = planMarkMutations({
      entries: normalizeMarkEntries([
        { studentId: "s1", subjectId: "math", marksObtained: "40" },
        { studentId: "s1", subjectId: "math", marksObtained: "" },
      ]),
      studentMap,
      subjectMap,
      markMap: new Map([
        [
          "s1:math",
          {
            id: "m1",
            studentId: "s1",
            subjectId: "math",
            outcome: "SCORED",
            marksObtained: 40,
            status: "DRAFT",
          },
        ],
      ]),
      writableKeys: null,
      accessBySubject: null,
    });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].type, "delete");
    assert.deepEqual(resultFromPlan(plans[0]), {
      studentId: "s1",
      subjectId: "math",
      deleted: true,
    });
  });

  it("rejects negative marks", () => {
    const plans = planMarkMutations({
      entries: [{ studentId: "s1", subjectId: "math", marksObtained: "-5" }],
      studentMap,
      subjectMap,
      markMap: new Map(),
      writableKeys: new Set(["c1:math"]),
      accessBySubject: { math: { canEnter: true, canEditLocked: true } },
    });
    assert.equal(plans[0].type, "error");
    assert.equal(plans[0].error, "Marks cannot be negative");
  });

  it("rejects unassigned teacher writes", () => {
    const plans = planMarkMutations({
      entries: [{ studentId: "s1", subjectId: "math", marksObtained: "10" }],
      studentMap,
      subjectMap,
      markMap: new Map(),
      writableKeys: new Set(["other:math"]),
      accessBySubject: { math: { canEnter: true, canEditLocked: true } },
    });
    assert.equal(plans[0].error, "Not assigned");
  });
});

describe("mapInChunks", () => {
  it("maps items in parallel chunks preserving order", async () => {
    const seen = [];
    const out = await mapInChunks([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
      return n * 10;
    });
    assert.deepEqual(out, [10, 20, 30, 40, 50]);
    assert.deepEqual(seen, [1, 2, 3, 4, 5]);
  });
});


describe("applyMarkPlans", () => {
  it("batches creates, updates, and deletes with createMany audits", async () => {
    const created = [];
    const updated = [];
    const deleted = [];
    const audits = [];
    const prismaClient = {
      async $transaction(ops) {
        for (const op of ops) await op;
      },
      markAudit: {
        createMany: async ({ data }) => {
          audits.push(...data);
          return { count: data.length };
        },
      },
      mark: {
        createMany: async ({ data }) => {
          for (const row of data) {
            created.push({ id: `new-${row.studentId}-${row.subjectId}`, ...row });
          }
          return { count: data.length };
        },
        findMany: async ({ where }) =>
          created.filter((m) => m.examId === where.examId),
        update: async ({ where, data }) => {
          const row = { id: where.id, ...data };
          updated.push(row);
          return row;
        },
        deleteMany: async ({ where }) => {
          deleted.push(...where.id.in);
          return { count: where.id.in.length };
        },
      },
    };

    const plans = [
      { type: "noop", studentId: "s0", subjectId: "sub", deleted: true },
      {
        type: "upsert",
        studentId: "s1",
        subjectId: "sub",
        existing: null,
        parsed: { marksObtained: 10, outcome: "SCORED" },
        auditOld: null,
        auditNew: 10,
      },
      {
        type: "upsert",
        studentId: "s2",
        subjectId: "sub",
        existing: { id: "m2", marksObtained: 5, outcome: "SCORED" },
        parsed: { marksObtained: 20, outcome: "SCORED" },
        auditOld: 5,
        auditNew: 20,
      },
      {
        type: "delete",
        studentId: "s3",
        subjectId: "sub",
        existing: { id: "m3" },
        auditOld: 7,
      },
      { type: "unchanged", studentId: "s4", subjectId: "sub", mark: { id: "m4" } },
      { type: "error", studentId: "s5", subjectId: "sub", error: "Nope" },
    ];

    const results = await applyMarkPlans(prismaClient, {
      examId: "e1",
      userId: "u1",
      plans,
      chunkSize: 10,
    });

    assert.equal(results.length, 6);
    assert.equal(results[0].deleted, true);
    assert.equal(results[1].mark.id, "new-s1-sub");
    assert.equal(results[2].mark.id, "m2");
    assert.equal(results[3].deleted, true);
    assert.equal(results[4].unchanged, true);
    assert.equal(results[5].error, "Nope");
    assert.equal(created.length, 1);
    assert.equal(updated.length, 1);
    assert.deepEqual(deleted, ["m3"]);
    assert.equal(audits.length, 3);
  });
});
