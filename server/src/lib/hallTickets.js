import PDFDocument from "pdfkit";
import { enrollmentKeySet, studentTakesSubject } from "./electiveEnrollment.js";
import { TINY_PNG } from "./letterhead.js";
import { contentDispositionAttachment } from "./downloadName.js";

export const DEFAULT_HALL_TICKET_INSTRUCTIONS =
  "Bring this hall ticket and your school ID to every paper. Electronic devices are not allowed in the examination hall. Follow the invigilator’s instructions at all times.";

const INK = "#1B2437";
const MUTED = "#4A5568";
const RULE = "#94A3B8";
const PHOTO_BG = "#EEF2F7";

/** A4 portrait in PDF points. */
export const A4 = { width: 595.28, height: 841.89 };

/**
 * Vertical rhythm of one hall ticket, in PDF points.
 * ticketChromeBeforePapers / ticketHeightForPapers must stay in step with drawTicket.
 */
export const TICKET_METRICS = {
  pad: 8,
  logoBlock: 24,
  schoolName: 12,
  title: 12,
  examCentre: 10,
  metaRow1: 11,
  metaRow2: 12,
  scheduleLabel: 9,
  columnHeader: 7,
  ruleGap: 3,
  rowSlack: 2,
  footer: 28,
  rowHeight: 8,
  emptySchedule: 9,
  photoH: 62,
  photoGap: 4,
  gap: 8,
  margin: 22,
};

export function publicStudent(student) {
  if (!student) return student;
  const { photoBytes, photoStorageKey, ...rest } = student;
  const hasPhoto =
    Boolean(rest.photoMimeType) &&
    (Boolean(photoStorageKey) || photoBytes == null || photoBytes.length > 0);
  return {
    ...rest,
    hasPhoto,
    photoUrl: hasPhoto ? `/api/students/${rest.id}/photo` : null,
  };
}

export function publicHallTicketIssue(issue) {
  if (!issue) return null;
  return {
    id: issue.id,
    examId: issue.examId,
    classSectionId: issue.classSectionId,
    title: issue.title || null,
    instructions: issue.instructions || null,
    defaultVenue: issue.defaultVenue || null,
    examCentre: issue.examCentre || null,
    includePhoto: issue.includePhoto !== false,
    internalNotes: issue.internalNotes || null,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    createdById: issue.createdById,
    updatedById: issue.updatedById || null,
    exam: issue.exam
      ? {
          id: issue.exam.id,
          name: issue.exam.name,
          term: issue.exam.term,
          type: issue.exam.type,
          academicYear: issue.exam.academicYear,
          date: issue.exam.date,
        }
      : undefined,
    classSection: issue.classSection
      ? {
          id: issue.classSection.id,
          className: issue.classSection.className,
          section: issue.classSection.section,
          label: `${issue.classSection.className}-${issue.classSection.section}`,
        }
      : undefined,
    createdBy: issue.createdBy
      ? { id: issue.createdBy.id, name: issue.createdBy.name }
      : undefined,
    updatedBy: issue.updatedBy
      ? { id: issue.updatedBy.id, name: issue.updatedBy.name }
      : undefined,
  };
}

export function parseHallTicketPatch(body = {}) {
  const data = {};
  if (body.title !== undefined) {
    const title = String(body.title || "").trim();
    data.title = title || null;
  }
  if (body.instructions !== undefined) {
    const instructions = String(body.instructions || "").trim();
    data.instructions = instructions || null;
  }
  if (body.defaultVenue !== undefined) {
    const defaultVenue = String(body.defaultVenue || "").trim();
    data.defaultVenue = defaultVenue || null;
  }
  if (body.examCentre !== undefined) {
    const examCentre = String(body.examCentre || "").trim();
    data.examCentre = examCentre || null;
  }
  if (body.internalNotes !== undefined) {
    const internalNotes = String(body.internalNotes || "").trim();
    data.internalNotes = internalNotes || null;
  }
  if (body.includePhoto !== undefined) {
    data.includePhoto = Boolean(body.includePhoto);
  }
  return data;
}

function formatPaperDate(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimeRange(start, end) {
  const a = String(start || "").trim();
  const b = String(end || "").trim();
  if (a && b) return `${a}–${b}`;
  return a || b || "—";
}

function scheduleClassName(row) {
  if (row?.className == null || row.className === "") return null;
  return String(row.className);
}

function subjectNameKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function scheduleSubjectName(row) {
  return row?.subject?.name || row?.subjectName || null;
}

/** Prefer rows that have a start time, then earlier paper dates. */
function preferSchedule(a, b) {
  if (!a) return b;
  if (!b) return a;
  const aTimed = Boolean(String(a.startTime || "").trim());
  const bTimed = Boolean(String(b.startTime || "").trim());
  if (aTimed !== bTimed) return aTimed ? a : b;
  const ta = a.paperDate ? new Date(a.paperDate).getTime() : Number.POSITIVE_INFINITY;
  const tb = b.paperDate ? new Date(b.paperDate).getTime() : Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta <= tb ? a : b;
  return a;
}

/**
 * Merge class-specific fields over school-wide, keeping times/venue from the
 * broader row when the specific row left them blank (common after “apply date”).
 */
export function mergeScheduleRows(specific, schoolWide) {
  if (!specific && !schoolWide) return null;
  if (!specific) return schoolWide;
  if (!schoolWide) return specific;
  return {
    ...schoolWide,
    ...specific,
    paperDate: specific.paperDate || schoolWide.paperDate || null,
    startTime: specific.startTime || schoolWide.startTime || null,
    endTime: specific.endTime || schoolWide.endTime || null,
    venue: specific.venue || schoolWide.venue || null,
    maxMarks: specific.maxMarks ?? schoolWide.maxMarks ?? null,
    className: scheduleClassName(specific) ?? scheduleClassName(schoolWide),
  };
}

/**
 * Resolve paper rows for a class: class-specific schedule wins over school-wide
 * (null className). When this class has no row yet, reuse another class’s
 * schedule for the same subject name (coordinators often fill one class’s
 * timetable and expect hall tickets for peer classes to follow it). Falls back
 * to the exam window date when nothing matches.
 */
export function resolvePaperRows({
  subjects = [],
  schedules = [],
  exam,
  className,
  defaultVenue = null,
}) {
  const specificBySubjectId = new Map();
  const schoolWideBySubjectId = new Map();
  const bySubjectNameForClass = new Map();
  const schoolWideBySubjectName = new Map();
  const anyBySubjectName = new Map();

  for (const row of schedules || []) {
    if (!row?.subjectId) continue;
    const rowClass = scheduleClassName(row);
    const nameKey = subjectNameKey(scheduleSubjectName(row));

    if (rowClass == null) {
      schoolWideBySubjectId.set(
        row.subjectId,
        preferSchedule(schoolWideBySubjectId.get(row.subjectId), row)
      );
      if (nameKey) {
        schoolWideBySubjectName.set(
          nameKey,
          preferSchedule(schoolWideBySubjectName.get(nameKey), row)
        );
      }
    } else if (String(rowClass) === String(className)) {
      specificBySubjectId.set(
        row.subjectId,
        preferSchedule(specificBySubjectId.get(row.subjectId), row)
      );
      if (nameKey) {
        bySubjectNameForClass.set(
          nameKey,
          preferSchedule(bySubjectNameForClass.get(nameKey), row)
        );
      }
    } else if (nameKey) {
      anyBySubjectName.set(nameKey, preferSchedule(anyBySubjectName.get(nameKey), row));
    }
  }

  const rows = [];
  for (const subject of subjects || []) {
    const nameKey = subjectNameKey(subject.name);
    const sched =
      mergeScheduleRows(
        specificBySubjectId.get(subject.id),
        schoolWideBySubjectId.get(subject.id)
      ) ||
      bySubjectNameForClass.get(nameKey) ||
      schoolWideBySubjectName.get(nameKey) ||
      anyBySubjectName.get(nameKey) ||
      null;

    rows.push({
      subjectId: subject.id,
      subjectName: subject.name,
      isElective: Boolean(subject.isElective),
      paperDate: sched?.paperDate || exam?.date || null,
      startTime: sched?.startTime || null,
      endTime: sched?.endTime || null,
      venue: sched?.venue || defaultVenue || null,
      maxMarks: sched?.maxMarks ?? subject.maxMarks ?? null,
    });
  }
  rows.sort((a, b) => {
    const ta = a.paperDate ? new Date(a.paperDate).getTime() : 0;
    const tb = b.paperDate ? new Date(b.paperDate).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(a.subjectName).localeCompare(String(b.subjectName));
  });
  return rows;
}

export function papersForStudent(allPapers, studentId, enrollmentKeys) {
  return (allPapers || []).filter((paper) =>
    studentTakesSubject(
      { id: paper.subjectId, isElective: paper.isElective },
      studentId,
      enrollmentKeys
    )
  );
}

/** True when a paper row has both a date and a start time for the ticket schedule. */
export function paperHasDateAndTime(paper) {
  if (!paper) return false;
  const hasDate = Boolean(paper.paperDate);
  const hasTime = Boolean(String(paper.startTime || "").trim());
  return hasDate && hasTime;
}

/**
 * Hall ticket PDF requires every paper to have date + start time set.
 * Empty schedules are incomplete (nothing useful to print).
 */
export function papersHaveDateAndTime(papers) {
  const list = papers || [];
  if (!list.length) return false;
  return list.every(paperHasDateAndTime);
}

/** Points used above the first paper row (padding, header, identity, column labels). */
export function ticketChromeBeforePapers({
  includeLogo = false,
  includeExamCentre = false,
} = {}) {
  const m = TICKET_METRICS;
  return (
    m.pad +
    (includeLogo ? m.logoBlock : 0) +
    m.schoolName +
    m.title +
    (includeExamCentre ? m.examCentre : 0) +
    m.metaRow1 +
    m.metaRow2 +
    m.scheduleLabel +
    m.columnHeader +
    m.ruleGap
  );
}

/**
 * Height of one ticket that shows every paper row, the footer, and the photo
 * when photos are printed. Does not clip the schedule.
 */
export function ticketHeightForPapers(paperCount, options = {}) {
  const m = TICKET_METRICS;
  const before = ticketChromeBeforePapers(options);
  const rows = Math.max(0, Number(paperCount) || 0);
  const body = rows === 0 ? m.emptySchedule : rows * m.rowHeight;
  const fromPapers = before + body + m.rowSlack + m.footer;
  if (options.includePhoto === false) return fromPapers;
  const photoBottom =
    m.pad +
    (options.includeLogo ? m.logoBlock : 0) +
    m.schoolName +
    m.title +
    (options.includeExamCentre ? m.examCentre : 0) +
    m.photoH +
    m.photoGap +
    m.footer;
  return Math.max(fromPapers, photoBottom);
}

/** Vertical room inside a ticket box for the paper rows (below the column rule, above the footer). */
export function paperBandHeight(ticketHeight, options = {}) {
  const m = TICKET_METRICS;
  return Math.max(0, ticketHeight - ticketChromeBeforePapers(options) - m.rowSlack - m.footer);
}

/** Row height that keeps every paper inside the band. Natural 8pt when the box is tall enough. */
export function paperRowHeight(paperCount, ticketHeight, options = {}) {
  const rows = Math.max(0, Number(paperCount) || 0);
  const natural = TICKET_METRICS.rowHeight;
  if (!rows) return natural;
  const available = paperBandHeight(ticketHeight, options);
  if (rows * natural <= available) return natural;
  return available / rows;
}

/**
 * How many complete tickets fit on one A4 page when each ticket lists `paperCount` subjects.
 * Tickets are stretched to fill the sheet. If one ticket is taller than the page, a single
 * compressed ticket fills the sheet and paper rows shrink so every subject still prints.
 */
export function layoutTicketsOnPage(paperCount, page = A4, options = {}) {
  const margin = options.margin ?? TICKET_METRICS.margin;
  const gap = options.gap ?? TICKET_METRICS.gap;
  const usable = page.height - margin * 2;
  const contentHeight = ticketHeightForPapers(paperCount, options);
  const maxFit = Math.max(1, Math.floor((usable + gap) / (contentHeight + gap)));
  const compressed = contentHeight > usable;
  const perPage = compressed ? 1 : maxFit;
  const ticketHeight = compressed ? usable : (usable - gap * (perPage - 1)) / perPage;
  return {
    margin,
    gap,
    perPage,
    ticketHeight,
    ticketWidth: page.width - margin * 2,
    paperCount: Math.max(0, Number(paperCount) || 0),
    contentHeight,
    compressed,
  };
}

export function maxPapersOnTickets(tickets) {
  let max = 0;
  for (const ticket of tickets || []) {
    const count = ticket?.papers?.length || 0;
    if (count > max) max = count;
  }
  return max;
}

function comparePapers(a, b) {
  const ta = a?.paperDate ? new Date(a.paperDate).getTime() : 0;
  const tb = b?.paperDate ? new Date(b.paperDate).getTime() : 0;
  if (ta !== tb) return ta - tb;
  return String(a?.subjectName || "").localeCompare(String(b?.subjectName || ""));
}

/** Every subject that appears on at least one student's ticket. */
export function papersAcrossTickets(tickets) {
  const byId = new Map();
  for (const ticket of tickets || []) {
    for (const paper of ticket?.papers || []) {
      const key = paper?.subjectId || paper?.subjectName;
      if (!key || byId.has(key)) continue;
      byId.set(key, paper);
    }
  }
  return [...byId.values()].sort(comparePapers);
}

/**
 * Sheet layout for a class batch. Ticket height follows the student with the most subjects
 * so every ticket on the page is the same size and none of them clip a paper.
 */
export function hallTicketSheetLayout(tickets, { schoolLogo = false } = {}) {
  const list = tickets || [];
  const options = {
    includeLogo: Boolean(schoolLogo),
    includeExamCentre: list.some((ticket) => String(ticket?.examCentre || "").trim()),
    includePhoto: list.length ? list.some((ticket) => ticket?.includePhoto !== false) : true,
  };
  const maxPapersOnTicket = maxPapersOnTickets(list);
  return {
    ...layoutTicketsOnPage(maxPapersOnTicket, A4, options),
    ...options,
    maxPapersOnTicket,
  };
}

function photoBuffer(student) {
  const raw = student?.photoBytes;
  if (!raw) return null;
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  return buf.length ? buf : null;
}

/** Resolve DB/filesystem photo bytes onto ticket student rows before PDF stream. */
export async function hydrateTicketPhotos(tickets) {
  const { getBlob } = await import("./blobStore.js");
  for (const ticket of tickets || []) {
    const student = ticket?.student;
    if (!student) continue;
    const buf = await getBlob({
      bytes: student.photoBytes,
      storageKey: student.photoStorageKey,
    });
    student.photoBytes = buf;
  }
  return tickets;
}

function drawMetaCell(doc, label, value, x, y, width) {
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(INK).text(`${label}: `, x, y, {
    continued: true,
    lineBreak: false,
  });
  doc.font("Helvetica").text(String(value || "—"), {
    width: Math.max(40, width - 52),
    lineBreak: false,
    ellipsis: true,
  });
}

function drawTicket(doc, ticket, box, { schoolName, schoolLogo }) {
  const m = TICKET_METRICS;
  const { x, y, width, height } = box;
  const pad = m.pad;
  const photoW = 52;
  const photoH = m.photoH;
  const right = x + width;
  const bottom = y + height;
  const fullTextWidth = width - pad * 2;
  const contentBottom = bottom - m.footer;

  doc.save();
  doc.roundedRect(x, y, width, height, 3).strokeColor(INK).lineWidth(1).stroke();
  doc.roundedRect(x + 1.5, y + 1.5, width - 3, height - 3, 2).strokeColor(RULE).lineWidth(0.4).stroke();

  let cursorY = y + pad;
  const textLeft = x + pad;

  if (schoolLogo) {
    try {
      doc.image(schoolLogo, x + width / 2 - 11, cursorY, { fit: [22, 22] });
      cursorY += m.logoBlock;
    } catch {
      // text-only header still prints
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(INK)
    .text(schoolName || "School", textLeft, cursorY, {
      width: fullTextWidth,
      align: "center",
      lineBreak: false,
    });
  cursorY += m.schoolName;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(INK)
    .text(ticket.title, textLeft, cursorY, {
      width: fullTextWidth,
      align: "center",
      lineBreak: false,
    });
  cursorY += m.title;

  if (String(ticket.examCentre || "").trim()) {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`Exam centre: ${ticket.examCentre}`, textLeft, cursorY, {
        width: fullTextWidth,
        align: "center",
        lineBreak: false,
      });
    cursorY += m.examCentre;
  }

  const identityTop = cursorY;
  const textWidth = fullTextWidth - (ticket.includePhoto ? photoW + 10 : 0);

  if (ticket.includePhoto) {
    const px = right - pad - photoW;
    const py = identityTop;
    doc.save();
    doc.rect(px, py, photoW, photoH).fillAndStroke(PHOTO_BG, RULE);
    const buf = photoBuffer(ticket.student);
    if (buf) {
      try {
        doc.image(buf, px + 1, py + 1, {
          fit: [photoW - 2, photoH - 2],
          align: "center",
          valign: "center",
        });
      } catch {
        doc.font("Helvetica").fontSize(7).fillColor(MUTED).text("Photo", px, py + photoH / 2 - 4, {
          width: photoW,
          align: "center",
        });
      }
    } else {
      doc.font("Helvetica").fontSize(7).fillColor(MUTED).text("Photo", px, py + photoH / 2 - 4, {
        width: photoW,
        align: "center",
      });
    }
    doc.restore();
  }

  // Two columns × two rows each:
  //   Name / Roll No          Class / Admn No
  const colGap = 10;
  const colWidth = (textWidth - colGap) / 2;
  const col2X = textLeft + colWidth + colGap;
  drawMetaCell(doc, "Name", ticket.student.name, textLeft, cursorY, colWidth);
  drawMetaCell(doc, "Class", ticket.classLabel, col2X, cursorY, colWidth);
  cursorY += m.metaRow1;
  drawMetaCell(doc, "Roll No", ticket.student.rollNo, textLeft, cursorY, colWidth);
  drawMetaCell(doc, "Admn No", ticket.student.admissionNo || "—", col2X, cursorY, colWidth);
  cursorY += m.metaRow2;

  // Keep schedule in the identity text column so column widths stay aligned
  // beside the photo (avoids invigilator lines jumping when past the photo).
  const scheduleWidth = textWidth;

  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(INK)
    .text("Examination schedule", textLeft, cursorY, { lineBreak: false });
  cursorY += m.scheduleLabel;

  const cols = [
    { key: "subject", label: "Subject", width: scheduleWidth * 0.34 },
    { key: "date", label: "Date", width: scheduleWidth * 0.22 },
    { key: "time", label: "Time", width: scheduleWidth * 0.22 },
    { key: "invigilator", label: "Invigilator sign", width: scheduleWidth * 0.22 },
  ];
  let cx = textLeft;
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(MUTED);
  for (const col of cols) {
    doc.text(col.label, cx, cursorY, { width: col.width, lineBreak: false });
    cx += col.width;
  }
  cursorY += m.columnHeader;
  doc
    .moveTo(textLeft, cursorY)
    .lineTo(textLeft + scheduleWidth, cursorY)
    .strokeColor(RULE)
    .lineWidth(0.4)
    .stroke();
  cursorY += m.ruleGap;

  const papers = ticket.papers || [];
  const band = Math.max(0, contentBottom - cursorY - m.rowSlack);
  const rowH =
    papers.length && papers.length * m.rowHeight > band ? band / papers.length : m.rowHeight;
  const rowFont = rowH >= m.rowHeight ? 6.5 : Math.max(4.5, rowH - 1.4);
  doc.font("Helvetica").fontSize(papers.length ? rowFont : 6.5).fillColor(INK);
  if (!papers.length) {
    doc.text("No papers scheduled for this class yet.", textLeft, cursorY, {
      width: scheduleWidth,
      lineBreak: false,
    });
  } else {
    for (const paper of papers) {
      const values = [
        paper.subjectName,
        formatPaperDate(paper.paperDate),
        formatTimeRange(paper.startTime, paper.endTime),
        "__________",
      ];
      cx = textLeft;
      for (let c = 0; c < cols.length; c += 1) {
        doc.text(String(values[c] || "—"), cx, cursorY, {
          width: cols[c].width - 2,
          lineBreak: false,
          ellipsis: true,
        });
        cx += cols[c].width;
      }
      cursorY += rowH;
    }
  }

  const instructions = ticket.instructions || DEFAULT_HALL_TICKET_INSTRUCTIONS;
  const instructionsTop = bottom - 26;
  doc
    .font("Helvetica-Oblique")
    .fontSize(6)
    .fillColor(MUTED)
    .text(instructions, textLeft, instructionsTop, {
      width: fullTextWidth,
      height: 12,
      ellipsis: true,
    });

  const sigY = bottom - 12;
  doc.font("Helvetica").fontSize(6.5).fillColor(INK);
  doc.text("Class teacher sign: ____________", textLeft, sigY, { lineBreak: false });
  doc.text("Principal: ____________", textLeft + fullTextWidth * 0.62, sigY, {
    lineBreak: false,
  });

  doc.restore();
}

/**
 * Build ticket payload list for one class section × exam.
 */
export function buildHallTicketPayload({
  school,
  exam,
  classSection,
  students,
  subjects,
  schedules,
  enrollments,
  issue,
}) {
  const defaultVenue = issue?.defaultVenue || null;
  const allPapers = resolvePaperRows({
    subjects,
    schedules,
    exam,
    className: classSection.className,
    defaultVenue,
  });
  const enrollmentKeys = enrollmentKeySet(enrollments);
  const title =
    String(issue?.title || "").trim() ||
    `${exam.name} — Hall Ticket`;
  const instructions = String(issue?.instructions || "").trim() || DEFAULT_HALL_TICKET_INSTRUCTIONS;
  const includePhoto = issue?.includePhoto !== false;
  const classLabel = `${classSection.className}-${classSection.section}`;

  return (students || []).map((student) => ({
    title,
    instructions,
    examCentre: issue?.examCentre || null,
    includePhoto,
    classLabel,
    student: {
      id: student.id,
      name: student.name,
      rollNo: student.rollNo,
      admissionNo: student.admissionNo || null,
      photoBytes: student.photoBytes || null,
      photoMimeType: student.photoMimeType || null,
      photoStorageKey: student.photoStorageKey || null,
    },
    papers: papersForStudent(allPapers, student.id, enrollmentKeys),
  }));
}

/**
 * Open an A4 hall-ticket document sized so every subject fits on each ticket.
 * Call `finish()` after the caller is listening for data (pipe or `data`).
 */
export function buildHallTicketsDocument({ letterhead, tickets, compress = true } = {}) {
  const schoolLogo = letterhead?.logo || null;
  const list = tickets?.length ? tickets : [];
  const layout = hallTicketSheetLayout(list, { schoolLogo });
  const doc = new PDFDocument({
    size: "A4",
    compress,
    margins: {
      top: layout.margin,
      bottom: layout.margin,
      left: layout.margin,
      right: layout.margin,
    },
    autoFirstPage: true,
    bufferPages: true,
  });
  return {
    doc,
    layout,
    finish() {
      paintHallTickets(doc, { letterhead, tickets: list, layout, schoolLogo });
    },
  };
}

function paintHallTickets(doc, { letterhead, tickets, layout, schoolLogo }) {
  // Tickets are absolutely positioned. Suppress PDFKit page breaks so a card
  // cannot split, and add a page only between complete tickets.
  const realAddPage = doc.addPage.bind(doc);
  let allowAddPage = false;
  doc.addPage = (...args) => {
    if (!allowAddPage) return doc;
    return realAddPage(...args);
  };

  const schoolName = letterhead?.name || "School";
  const list = tickets || [];

  if (!list.length) {
    allowAddPage = true;
    doc.font("Helvetica").fontSize(12).fillColor(INK).text("No active students in this class.", {
      align: "center",
    });
    doc.end();
    return;
  }

  list.forEach((ticket, index) => {
    const slot = index % layout.perPage;
    if (index > 0 && slot === 0) {
      allowAddPage = true;
      doc.addPage();
      allowAddPage = false;
    }
    const y = layout.margin + slot * (layout.ticketHeight + layout.gap);
    drawTicket(
      doc,
      ticket,
      {
        x: layout.margin,
        y,
        width: layout.ticketWidth,
        height: layout.ticketHeight,
      },
      { schoolName, schoolLogo }
    );
    // Keep the cursor inside the page so a later draw cannot trip a break.
    doc.x = layout.margin;
    doc.y = layout.margin;
  });

  doc.end();
}

/**
 * Stream an A4 PDF into `res`. The number of tickets per page follows how many
 * complete tickets (every subject included) fit on the sheet.
 */
export function streamHallTicketsPdf(res, { letterhead, tickets, filename }) {
  const built = buildHallTicketsDocument({ letterhead, tickets });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", contentDispositionAttachment(filename, "hall-tickets.pdf"));
  built.doc.pipe(res);
  built.finish();
  return built.doc;
}

/** Tiny PNG used when seeding demo student photos in tests. */
export { TINY_PNG as DEMO_STUDENT_PHOTO };
