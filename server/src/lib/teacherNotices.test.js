import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignmentLabel,
  buildNoticeContent,
  defaultAudienceForKind,
  filterTeachersForNotice,
  formatNoticeDeadline,
  isIncompleteAssignment,
  marksLink,
  summarizeOutstanding,
  validateNoticeRequest,
} from "./teacherNotices.js";

const teachers = [
  {
    teacherId: "t1",
    name: "Anita",
    assignments: [
      { classSectionId: "c1", classLabel: "10-A", subject: "Math", subjectId: "s1", missing: 3, status: "PARTIAL" },
      { classSectionId: "c2", classLabel: "10-B", subject: "Math", subjectId: "s1", missing: 0, status: "APPROVED" },
    ],
  },
  {
    teacherId: "t2",
    name: "Meera",
    assignments: [
      { classSectionId: "c1", classLabel: "10-A", subject: "Biology", subjectId: "s2", missing: 12, status: "MISSING" },
    ],
  },
  {
    teacherId: "t3",
    name: "David",
    assignments: [
      { classSectionId: "c3", classLabel: "10-D", subject: "English", subjectId: "s3", missing: 0, status: "AWAITING_APPROVAL" },
    ],
  },
];

describe("isIncompleteAssignment", () => {
  it("treats missing and partial registers as incomplete", () => {
    assert.equal(isIncompleteAssignment({ missing: 1, status: "PARTIAL" }), true);
    assert.equal(isIncompleteAssignment({ missing: 0, status: "MISSING" }), true);
    assert.equal(isIncompleteAssignment({ missing: 0, status: "APPROVED" }), false);
    assert.equal(isIncompleteAssignment({ missing: 0, status: "AWAITING_APPROVAL" }), false);
  });
});

describe("filterTeachersForNotice", () => {
  it("PENDING keeps teachers with incomplete registers", () => {
    const list = filterTeachersForNotice(teachers, { audience: "PENDING" });
    assert.deepEqual(
      list.map((t) => t.teacherId),
      ["t1", "t2"]
    );
  });

  it("ALL keeps assigned teachers", () => {
    const list = filterTeachersForNotice(teachers, { audience: "ALL" });
    assert.equal(list.length, 3);
  });

  it("SELECTED filters by teacherIds", () => {
    const list = filterTeachersForNotice(teachers, { audience: "SELECTED", teacherIds: ["t3"] });
    assert.deepEqual(
      list.map((t) => t.teacherId),
      ["t3"]
    );
  });

  it("classSectionId scopes assignments and drops unrelated teachers", () => {
    const list = filterTeachersForNotice(teachers, { audience: "PENDING", classSectionId: "c1" });
    assert.deepEqual(
      list.map((t) => t.teacherId),
      ["t1", "t2"]
    );
    assert.equal(list[0].assignments.length, 1);
    assert.equal(list[0].assignments[0].subject, "Math");
  });
});

describe("buildNoticeContent", () => {
  const exam = {
    id: "e1",
    name: "Final Exam",
    marksEntryDeadline: new Date("2026-09-15T18:30:00.000Z"),
  };

  it("builds a deadline reminder with outstanding papers", () => {
    const notice = buildNoticeContent({
      kind: "DEADLINE",
      exam,
      senderName: "Dr. Kavita Rao",
      teacher: teachers[0],
    });
    assert.equal(notice.type, "DEADLINE_REMINDER");
    assert.match(notice.title, /Final Exam/);
    assert.match(notice.body, /due by/);
    assert.match(notice.body, /10-A Math/);
    assert.equal(notice.link, "/marks?examId=e1&classSectionId=c1&subjectId=s1");
  });

  it("uses past-deadline wording", () => {
    const notice = buildNoticeContent({
      kind: "DEADLINE",
      exam,
      senderName: "Sanjay Menon",
      pastDeadline: true,
      teacher: teachers[1],
    });
    assert.match(notice.body, /was /);
    assert.match(notice.body, /Outstanding/);
  });

  it("builds an incomplete marklist notice", () => {
    const notice = buildNoticeContent({
      kind: "INCOMPLETE",
      exam,
      senderName: "Sanjay Menon",
      teacher: teachers[1],
      message: "Please finish before Friday.",
    });
    assert.equal(notice.type, "INCOMPLETE_MARKLIST");
    assert.equal(notice.title, "Incomplete marklist: Final Exam");
    assert.match(notice.body, /10-A Biology/);
    assert.match(notice.body, /Please finish before Friday/);
  });

  it("builds a custom staff notice", () => {
    const notice = buildNoticeContent({
      kind: "CUSTOM",
      senderName: "Dr. Kavita Rao",
      message: "Staff meeting at 3pm in the library.",
    });
    assert.equal(notice.type, "STAFF_NOTICE");
    assert.equal(notice.title, "Notice from Dr. Kavita Rao");
    assert.equal(notice.body, "Staff meeting at 3pm in the library.");
    assert.equal(notice.link, "/marks");
  });
});

describe("helpers", () => {
  it("formats deadlines and outstanding lists", () => {
    assert.equal(formatNoticeDeadline(null), null);
    assert.equal(assignmentLabel({ classLabel: "9-A", subject: "English" }), "9-A English");
    assert.equal(
      summarizeOutstanding(
        [
          { classLabel: "9-A", subject: "A" },
          { classLabel: "9-B", subject: "B" },
          { classLabel: "9-C", subject: "C" },
          { classLabel: "10-A", subject: "D" },
          { classLabel: "10-B", subject: "E" },
        ],
        3
      ),
      "9-A A, 9-B B, 9-C C and 2 more"
    );
    assert.equal(marksLink("e1"), "/marks?examId=e1");
    assert.equal(defaultAudienceForKind("DEADLINE"), "ALL");
    assert.equal(defaultAudienceForKind("INCOMPLETE"), "PENDING");
  });

  it("validates notice requests", () => {
    assert.match(validateNoticeRequest({ kind: "NOPE" }) || "", /notice type/);
    assert.match(validateNoticeRequest({ kind: "DEADLINE" }) || "", /exam/);
    assert.match(validateNoticeRequest({ kind: "CUSTOM", audience: "SELECTED" }) || "", /message/);
    assert.match(
      validateNoticeRequest({ kind: "CUSTOM", audience: "SELECTED", message: "Hello" }) || "",
      /teacher/
    );
    assert.equal(
      validateNoticeRequest({
        kind: "CUSTOM",
        audience: "ALL",
        preview: true,
      }),
      null
    );
  });
});
