import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTION_LABELS,
  actorFilterForViewer,
  actorVisibleToViewer,
  mapActivityAudit,
  mapMarkAudit,
  mergeAuditFeeds,
} from "./activityAudit.js";

describe("actorVisibleToViewer", () => {
  it("lets the principal see every role including exam coordinator", () => {
    assert.equal(actorVisibleToViewer("PRINCIPAL", "TEACHER"), true);
    assert.equal(actorVisibleToViewer("PRINCIPAL", "EXAM_COORDINATOR"), true);
    assert.equal(actorVisibleToViewer("PRINCIPAL", "PRINCIPAL"), true);
  });

  it("limits the exam coordinator to teacher activity", () => {
    assert.equal(actorVisibleToViewer("EXAM_COORDINATOR", "TEACHER"), true);
    assert.equal(actorVisibleToViewer("EXAM_COORDINATOR", "EXAM_COORDINATOR"), false);
    assert.equal(actorVisibleToViewer("EXAM_COORDINATOR", "PRINCIPAL"), false);
  });
});

describe("actorFilterForViewer", () => {
  it("does not restrict actor role for the principal by default", () => {
    assert.equal(actorFilterForViewer("PRINCIPAL"), undefined);
  });

  it("lets the principal filter to the exam coordinator", () => {
    assert.deepEqual(actorFilterForViewer("PRINCIPAL", "EXAM_COORDINATOR"), {
      role: "EXAM_COORDINATOR",
    });
  });

  it("forces teacher-only rows for the exam coordinator", () => {
    assert.deepEqual(actorFilterForViewer("EXAM_COORDINATOR", "EXAM_COORDINATOR"), {
      role: "TEACHER",
    });
    assert.deepEqual(actorFilterForViewer("EXAM_COORDINATOR", "TEACHER", "u1"), {
      role: "TEACHER",
      id: "u1",
    });
  });
});

describe("audit row mapping", () => {
  it("maps mark edits with the actor role attached", () => {
    const row = mapMarkAudit({
      id: "a1",
      timestamp: "2026-03-12T10:00:00.000Z",
      oldValue: 70,
      newValue: 72,
      changedBy: { id: "c1", name: "Sanjay Menon", role: "EXAM_COORDINATOR" },
      mark: {
        student: { name: "Aarav Sharma", rollNo: "01" },
        subject: { name: "Mathematics" },
        exam: { id: "e1", name: "Final Exam" },
      },
    });
    assert.equal(row.action, "MARK_CHANGED");
    assert.equal(row.actionLabel, ACTION_LABELS.MARK_CHANGED);
    assert.equal(row.actor.role, "EXAM_COORDINATOR");
    assert.equal(row.actor.roleLabel, "Exam coordinator");
    assert.match(row.summary, /Mathematics/);
  });

  it("maps grace / moderation rows when a reason is present", () => {
    const row = mapMarkAudit({
      id: "a2",
      timestamp: "2026-03-12T10:30:00.000Z",
      oldValue: 28,
      newValue: 33,
      reason: "Board grace for borderline fail",
      changedBy: { id: "p1", name: "Principal", role: "PRINCIPAL" },
      mark: {
        student: { name: "Aarav Sharma", rollNo: "01" },
        subject: { name: "Mathematics" },
        exam: { id: "e1", name: "Final Exam" },
      },
    });
    assert.equal(row.action, "MARK_MODERATED");
    assert.equal(row.actionLabel, ACTION_LABELS.MARK_MODERATED);
    assert.equal(row.reason, "Board grace for borderline fail");
    assert.match(row.summary, /Moderated/);
    assert.match(row.summary, /Board grace/);
  });

  it("maps operational activity such as coordinator approvals", () => {
    const row = mapActivityAudit({
      id: "b1",
      timestamp: "2026-03-12T11:00:00.000Z",
      action: "MARK_APPROVED",
      summary: "Approved 12 submitted marks for Anita Sharma · 10-A Mathematics",
      examId: "e1",
      actor: { id: "c1", name: "Sanjay Menon", role: "EXAM_COORDINATOR" },
      meta: { subjectName: "Mathematics", examName: "Final Exam" },
    });
    assert.equal(row.source, "activity");
    assert.equal(row.actionLabel, "Marks approved");
    assert.equal(row.actor.role, "EXAM_COORDINATOR");
  });

  it("merges mark and activity feeds newest first", () => {
    const merged = mergeAuditFeeds(
      [
        mapMarkAudit({
          id: "old",
          timestamp: "2026-03-12T09:00:00.000Z",
          oldValue: null,
          newValue: 50,
          changedBy: { id: "t1", name: "Anita", role: "TEACHER" },
          mark: {
            student: { name: "Diya", rollNo: "02" },
            subject: { name: "English" },
            exam: { id: "e1", name: "Final Exam" },
          },
        }),
      ],
      [
        mapActivityAudit({
          id: "new",
          timestamp: "2026-03-12T12:00:00.000Z",
          action: "MARK_APPROVED",
          summary: "Approved marks",
          examId: "e1",
          actor: { id: "c1", name: "Sanjay", role: "EXAM_COORDINATOR" },
          meta: {},
        }),
      ]
    );
    assert.equal(merged[0].source, "activity");
    assert.equal(merged[1].source, "mark");
    assert.equal(merged.length, 2);
  });
});
