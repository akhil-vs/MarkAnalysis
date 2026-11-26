import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  A4,
  buildHallTicketPayload,
  buildHallTicketsDocument,
  hallTicketSheetLayout,
  layoutTicketsOnPage,
  paperBandHeight,
  paperHasDateAndTime,
  paperRowHeight,
  papersAcrossTickets,
  papersForStudent,
  papersHaveDateAndTime,
  parseHallTicketPatch,
  publicStudent,
  resolvePaperRows,
  ticketHeightForPapers,
} from "./hallTickets.js";

const PHOTO_OPTIONS = { includePhoto: true, includeLogo: false, includeExamCentre: false };

function ticketWithPapers(count, extras = {}) {
  const names = extras.names;
  return {
    title: extras.title || "Final Exam — Hall Ticket",
    instructions: "Bring this hall ticket.",
    examCentre: extras.examCentre ?? null,
    includePhoto: extras.includePhoto !== false,
    classLabel: "10-A",
    student: {
      id: extras.studentId || "s1",
      name: extras.studentName || "Ada Lovelace",
      rollNo: "01",
      admissionNo: "ADM-1",
    },
    papers: Array.from({ length: count }, (_, i) => ({
      subjectId: `sub-${i}`,
      subjectName: names?.[i] || `Subject ${String(i + 1).padStart(2, "0")}`,
      paperDate: "2026-03-10T00:00:00.000Z",
      startTime: "09:00",
      endTime: "12:00",
    })),
  };
}

function pdfText(buffer) {
  const hex = [...buffer.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((m) =>
    Buffer.from(m[1], "hex").toString("utf8")
  );
  return hex.join("");
}

function pdfPageCount(buffer) {
  return [...buffer.toString("latin1").matchAll(/\/Type \/Page(?!s)/g)].length;
}

async function renderTickets(tickets, letterhead = { name: "Greenfield Public School" }) {
  const built = buildHallTicketsDocument({ letterhead, tickets, compress: false });
  const chunks = [];
  built.doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    built.doc.on("end", resolve);
    built.doc.on("error", reject);
  });
  built.finish();
  await done;
  return { buffer: Buffer.concat(chunks), layout: built.layout };
}

describe("hallTickets helpers", () => {
  it("fits five complete tickets on A4 when a student has six papers", () => {
    const layout = layoutTicketsOnPage(6, A4, PHOTO_OPTIONS);
    assert.equal(layout.perPage, 5);
    assert.equal(layout.compressed, false);
    assert.ok(layout.ticketHeight + 0.05 >= ticketHeightForPapers(6, PHOTO_OPTIONS));
    assert.ok(layout.ticketWidth > 500);
  });

  it("reduces tickets per page so every subject still fits", () => {
    const six = layoutTicketsOnPage(6, A4, PHOTO_OPTIONS);
    const twelve = layoutTicketsOnPage(12, A4, PHOTO_OPTIONS);
    assert.ok(twelve.perPage < six.perPage);
    assert.ok(twelve.perPage >= 1);
    assert.ok(twelve.ticketHeight + 0.05 >= ticketHeightForPapers(12, PHOTO_OPTIONS));
    let previous = Infinity;
    for (let count = 0; count <= 30; count += 1) {
      const layout = layoutTicketsOnPage(count, A4, PHOTO_OPTIONS);
      assert.ok(layout.perPage <= previous, `${count} papers should not add tickets per page`);
      previous = layout.perPage;
      const band = paperBandHeight(layout.ticketHeight, PHOTO_OPTIONS);
      if (count > 0) {
        const rowH = paperRowHeight(count, layout.ticketHeight, PHOTO_OPTIONS);
        assert.ok(rowH * count <= band + 0.05, `${count} paper rows fit in the ticket`);
      }
      const bottom =
        layout.margin + layout.perPage * layout.ticketHeight + (layout.perPage - 1) * layout.gap;
      assert.ok(bottom <= A4.height - layout.margin + 0.05);
    }
  });

  it("sizes the sheet from the student with the most subjects", () => {
    const tickets = [ticketWithPapers(4), ticketWithPapers(11, { studentId: "s2" })];
    const layout = hallTicketSheetLayout(tickets);
    assert.equal(layout.maxPapersOnTicket, 11);
    assert.equal(layout.perPage, layoutTicketsOnPage(11, A4, PHOTO_OPTIONS).perPage);
    assert.equal(layout.includePhoto, true);
  });

  it("packs more tickets when photos are turned off", () => {
    const withPhoto = layoutTicketsOnPage(2, A4, { includePhoto: true });
    const withoutPhoto = layoutTicketsOnPage(2, A4, { includePhoto: false });
    assert.ok(withoutPhoto.perPage >= withPhoto.perPage);
  });

  it("unions every subject a class sits, not only the first student", () => {
    const papers = papersAcrossTickets([
      {
        papers: [
          { subjectId: "math", subjectName: "Math", paperDate: "2026-03-02T00:00:00.000Z" },
          { subjectId: "music", subjectName: "Music", paperDate: "2026-03-01T00:00:00.000Z" },
        ],
      },
      {
        papers: [
          { subjectId: "math", subjectName: "Math", paperDate: "2026-03-02T00:00:00.000Z" },
          { subjectId: "art", subjectName: "Art", paperDate: "2026-03-03T00:00:00.000Z" },
        ],
      },
    ]);
    assert.deepEqual(
      papers.map((paper) => paper.subjectId),
      ["music", "math", "art"]
    );
  });

  it("prints every subject on the ticket and paginates complete cards", async () => {
    const names = [
      "Algebra",
      "Biology",
      "Chemistry",
      "Drama",
      "English",
      "French",
      "Geography",
      "History",
      "Informatics",
    ];
    const tickets = Array.from({ length: 5 }, (_, i) =>
      ticketWithPapers(names.length, {
        names,
        studentId: `s${i}`,
        studentName: `Student ${i + 1}`,
      })
    );
    const { buffer, layout } = await renderTickets(tickets);
    assert.equal(layout.perPage, 4);
    assert.equal(layout.maxPapersOnTicket, names.length);
    assert.equal(pdfPageCount(buffer), 2);
    const text = pdfText(buffer);
    for (const name of names) assert.match(text, new RegExp(name));
    assert.equal(text.includes("more paper"), false);
    assert.match(text, /Student 5/);
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

  it("resolvePaperRows keeps school-wide times when class row only has a date", () => {
    const rows = resolvePaperRows({
      subjects: [{ id: "bio-10", name: "Biology", maxMarks: 100, isElective: false }],
      schedules: [
        {
          subjectId: "bio-10",
          className: null,
          paperDate: "2026-10-04T00:00:00.000Z",
          startTime: "08:00",
          endTime: "09:00",
          venue: "Lab",
        },
        {
          subjectId: "bio-10",
          className: "10",
          paperDate: "2026-10-05T00:00:00.000Z",
          startTime: null,
          endTime: null,
          venue: null,
        },
      ],
      exam: { date: "2026-10-01T00:00:00.000Z" },
      className: "10",
    });
    assert.equal(rows[0].paperDate, "2026-10-05T00:00:00.000Z");
    assert.equal(rows[0].startTime, "08:00");
    assert.equal(rows[0].endTime, "09:00");
    assert.equal(rows[0].venue, "Lab");
  });

  it("resolvePaperRows reuses another class timetable by subject name", () => {
    const rows = resolvePaperRows({
      subjects: [
        { id: "bio-10", name: "Biology", maxMarks: 100, isElective: false },
        { id: "chem-10", name: "Chemistry", maxMarks: 100, isElective: false },
      ],
      schedules: [
        {
          subjectId: "bio-9",
          className: "9",
          paperDate: "2026-10-04T00:00:00.000Z",
          startTime: "08:00",
          endTime: "09:00",
          subject: { name: "Biology" },
        },
        {
          subjectId: "chem-9",
          className: "9",
          paperDate: "2026-10-06T00:00:00.000Z",
          startTime: "08:00",
          endTime: "09:00",
          subject: { name: "Chemistry" },
        },
      ],
      exam: { date: "2026-10-01T00:00:00.000Z" },
      className: "10",
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].subjectName, "Biology");
    assert.equal(rows[0].startTime, "08:00");
    assert.equal(String(rows[0].paperDate), "2026-10-04T00:00:00.000Z");
    assert.equal(rows[1].subjectName, "Chemistry");
    assert.equal(rows[1].startTime, "08:00");
    assert.equal(papersHaveDateAndTime(rows), true);
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

  it("papersHaveDateAndTime requires date and start time on every paper", () => {
    assert.equal(papersHaveDateAndTime([]), false);
    assert.equal(
      paperHasDateAndTime({ paperDate: "2026-03-10", startTime: "09:00" }),
      true
    );
    assert.equal(paperHasDateAndTime({ paperDate: "2026-03-10", startTime: "" }), false);
    assert.equal(paperHasDateAndTime({ paperDate: null, startTime: "09:00" }), false);
    assert.equal(
      papersHaveDateAndTime([
        { paperDate: "2026-03-10", startTime: "09:00" },
        { paperDate: "2026-03-11", startTime: null },
      ]),
      false
    );
    assert.equal(
      papersHaveDateAndTime([
        { paperDate: "2026-03-10", startTime: "09:00" },
        { paperDate: "2026-03-11", startTime: "10:00" },
      ]),
      true
    );
  });
});
