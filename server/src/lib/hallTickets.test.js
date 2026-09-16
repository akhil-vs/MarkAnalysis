import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HALL_TICKETS_PER_PAGE,
  buildHallTicketPayload,
  papersForStudent,
  parseHallTicketPatch,
  publicStudent,
  resolvePaperRows,
  ticketLayout,
} from "./hallTickets.js";

describe("hallTickets helpers", () => {
  it("layouts five equal tickets on A4", () => {
    const layout = ticketLayout();
    assert.equal(layout.perPage, HALL_TICKETS_PER_PAGE);
    assert.ok(layout.ticketHeight > 120);
    assert.ok(layout.ticketWidth > 500);
  });

  it("publicStudent strips bytes and exposes photoUrl", () => {
    const out = publicStudent({
      id: "s1",
      name: "Ada",
      photoBytes: Buffer.from("abc"),
      photoMimeType: "image/png",
    });
    assert.equal(out.hasPhoto, true);
    assert.equal(out.photoUrl, "/api/students/s1/photo");
    assert.equal(out.photoBytes, undefined);
  });

  it("resolvePaperRows prefers class-specific schedule", () => {
    const exam = { date: "2026-03-01T00:00:00.000Z" };
    const subjects = [
      { id: "math", name: "Mathematics", maxMarks: 80, isElective: false },
      { id: "eng", name: "English", maxMarks: 80, isElective: false },
    ];
    const schedules = [
      {
        subjectId: "math",
        className: null,
        paperDate: "2026-03-10T00:00:00.000Z",
        startTime: "09:00",
        endTime: "12:00",
        venue: "Hall A",
      },
      {
        subjectId: "math",
        className: "10",
        paperDate: "2026-03-11T00:00:00.000Z",
        startTime: "10:00",
        endTime: "13:00",
        venue: "Room 10",
      },
    ];
    const rows = resolvePaperRows({
      subjects,
      schedules,
      exam,
      className: "10",
      defaultVenue: "Main hall",
    });
    assert.equal(rows.length, 2);
    const math = rows.find((r) => r.subjectId === "math");
    assert.equal(math.venue, "Room 10");
    assert.equal(math.startTime, "10:00");
    const eng = rows.find((r) => r.subjectId === "eng");
    assert.equal(eng.venue, "Main hall");
    assert.equal(String(eng.paperDate), String(exam.date));
  });

  it("filters elective papers per student", () => {
    const papers = [
      { subjectId: "core", subjectName: "Math", isElective: false },
      { subjectId: "opt", subjectName: "Music", isElective: true },
    ];
    const keys = new Set(["stu1:opt"]);
    assert.equal(papersForStudent(papers, "stu1", keys).length, 2);
    assert.equal(papersForStudent(papers, "stu2", keys).length, 1);
  });

  it("buildHallTicketPayload applies issue overrides", () => {
    const tickets = buildHallTicketPayload({
      exam: { name: "Final Exam", date: "2026-03-01T00:00:00.000Z" },
      classSection: { className: "10", section: "A" },
      students: [{ id: "s1", name: "Ada", rollNo: "01", admissionNo: "ADM-1" }],
      subjects: [{ id: "math", name: "Mathematics", isElective: false, maxMarks: 80 }],
      schedules: [],
      enrollments: [],
      issue: {
        title: "Custom title",
        instructions: "Be on time.",
        defaultVenue: "Lab 1",
        examCentre: "North block",
        includePhoto: false,
      },
    });
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].title, "Custom title");
    assert.equal(tickets[0].instructions, "Be on time.");
    assert.equal(tickets[0].examCentre, "North block");
    assert.equal(tickets[0].includePhoto, false);
    assert.equal(tickets[0].classLabel, "10-A");
    assert.equal(tickets[0].papers[0].venue, "Lab 1");
  });

  it("parseHallTicketPatch normalizes empty strings to null", () => {
    const patch = parseHallTicketPatch({
      title: "  ",
      instructions: " Keep calm ",
      includePhoto: 0,
    });
    assert.equal(patch.title, null);
    assert.equal(patch.instructions, "Keep calm");
    assert.equal(patch.includePhoto, false);
  });
});
