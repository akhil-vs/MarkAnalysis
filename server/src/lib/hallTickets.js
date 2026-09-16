import PDFDocument from "pdfkit";
import { enrollmentKeySet, studentTakesSubject } from "./electiveEnrollment.js";
import { TINY_PNG } from "./letterhead.js";

export const HALL_TICKETS_PER_PAGE = 5;
export const DEFAULT_HALL_TICKET_INSTRUCTIONS =
  "Bring this hall ticket and your school ID to every paper. Electronic devices are not allowed in the examination hall. Follow the invigilator’s instructions at all times.";

const INK = "#1B2437";
const MUTED = "#4A5568";
const RULE = "#94A3B8";
const PHOTO_BG = "#EEF2F7";

/** A4 portrait in PDF points. */
export const A4 = { width: 595.28, height: 841.89 };

export function publicStudent(student) {
  if (!student) return student;
  const { photoBytes, ...rest } = student;
  const hasPhoto = Boolean(rest.photoMimeType) && (photoBytes == null || photoBytes.length > 0);
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

function formatDob(value) {
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

/**
 * Resolve paper rows for a class: class-specific schedule wins over school-wide
 * (null className). Falls back to subjects with the exam window date.
 */
export function resolvePaperRows({
  subjects = [],
  schedules = [],
  exam,
  className,
  defaultVenue = null,
}) {
  const bySubject = new Map();
  for (const row of schedules || []) {
    if (!row?.subjectId) continue;
    const applies =
      row.className == null ||
      row.className === "" ||
      String(row.className) === String(className);
    if (!applies) continue;
    const existing = bySubject.get(row.subjectId);
    const isSpecific = row.className != null && row.className !== "";
    if (!existing || (isSpecific && !(existing.className != null && existing.className !== ""))) {
      bySubject.set(row.subjectId, row);
    }
  }

  const rows = [];
  for (const subject of subjects || []) {
    const sched = bySubject.get(subject.id);
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

export function ticketLayout(page = A4, { perPage = HALL_TICKETS_PER_PAGE, margin = 22 } = {}) {
  const usableHeight = page.height - margin * 2;
  const gap = 8;
  const ticketHeight = (usableHeight - gap * (perPage - 1)) / perPage;
  const ticketWidth = page.width - margin * 2;
  return { margin, gap, ticketHeight, ticketWidth, perPage };
}

function photoBuffer(student) {
  const raw = student?.photoBytes;
  if (!raw) return null;
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  return buf.length ? buf : null;
}

function drawTicket(doc, ticket, box, { schoolName, schoolLogo }) {
  const { x, y, width, height } = box;
  const pad = 8;
  const photoW = 52;
  const photoH = 62;
  const right = x + width;
  const bottom = y + height;

  doc.save();
  doc.roundedRect(x, y, width, height, 3).strokeColor(INK).lineWidth(1).stroke();
  doc.roundedRect(x + 1.5, y + 1.5, width - 3, height - 3, 2).strokeColor(RULE).lineWidth(0.4).stroke();

  let cursorY = y + pad;
  const textLeft = x + pad;
  const textWidth = width - pad * 2 - (ticket.includePhoto ? photoW + 10 : 0);

  if (schoolLogo) {
    try {
      doc.image(schoolLogo, textLeft, cursorY, { fit: [22, 22] });
    } catch {
      // text-only header still prints
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(INK)
    .text(schoolName || "School", textLeft + (schoolLogo ? 26 : 0), cursorY, {
      width: textWidth - (schoolLogo ? 26 : 0),
      lineBreak: false,
    });
  cursorY += 12;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(INK)
    .text(ticket.title, textLeft, cursorY, { width: textWidth, lineBreak: false });
  cursorY += 13;

  if (ticket.examCentre) {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`Exam centre: ${ticket.examCentre}`, textLeft, cursorY, {
        width: textWidth,
        lineBreak: false,
      });
    cursorY += 10;
  }

  if (ticket.includePhoto) {
    const px = right - pad - photoW;
    const py = y + pad + 10;
    doc.save();
    doc.rect(px, py, photoW, photoH).fillAndStroke(PHOTO_BG, RULE);
    const buf = photoBuffer(ticket.student);
    if (buf) {
      try {
        doc.image(buf, px + 1, py + 1, { fit: [photoW - 2, photoH - 2], align: "center", valign: "center" });
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

  const meta = [
    ["Name", ticket.student.name],
    ["Roll No", ticket.student.rollNo],
    ["Class", ticket.classLabel],
    ["Admission No", ticket.student.admissionNo || "—"],
    ["Date of birth", formatDob(ticket.student.dob)],
  ];
  doc.font("Helvetica").fontSize(7.5).fillColor(INK);
  for (const [label, value] of meta) {
    doc.font("Helvetica-Bold").text(`${label}: `, textLeft, cursorY, {
      continued: true,
      lineBreak: false,
    });
    doc.font("Helvetica").text(String(value || "—"), { width: textWidth - 70, lineBreak: false });
    cursorY += 10;
  }

  cursorY += 2;
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(INK)
    .text("Examination schedule", textLeft, cursorY, { lineBreak: false });
  cursorY += 10;

  const cols = [
    { key: "subject", label: "Subject", width: textWidth * 0.34 },
    { key: "date", label: "Date", width: textWidth * 0.22 },
    { key: "time", label: "Time", width: textWidth * 0.22 },
    { key: "venue", label: "Venue", width: textWidth * 0.22 },
  ];
  let cx = textLeft;
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(MUTED);
  for (const col of cols) {
    doc.text(col.label, cx, cursorY, { width: col.width, lineBreak: false });
    cx += col.width;
  }
  cursorY += 8;
  doc
    .moveTo(textLeft, cursorY)
    .lineTo(textLeft + textWidth, cursorY)
    .strokeColor(RULE)
    .lineWidth(0.4)
    .stroke();
  cursorY += 3;

  const papers = ticket.papers || [];
  const maxRows = Math.max(1, Math.min(papers.length, 6));
  doc.font("Helvetica").fontSize(6.5).fillColor(INK);
  if (!papers.length) {
    doc.text("No papers scheduled for this class yet.", textLeft, cursorY, {
      width: textWidth,
      lineBreak: false,
    });
    cursorY += 9;
  } else {
    for (let i = 0; i < maxRows; i += 1) {
      const paper = papers[i];
      const values = [
        paper.subjectName,
        formatPaperDate(paper.paperDate),
        formatTimeRange(paper.startTime, paper.endTime),
        paper.venue || "—",
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
      cursorY += 8.5;
    }
    if (papers.length > maxRows) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(6)
        .fillColor(MUTED)
        .text(`+${papers.length - maxRows} more paper(s)`, textLeft, cursorY, {
          width: textWidth,
          lineBreak: false,
        });
      cursorY += 8;
    }
  }

  const instructions = ticket.instructions || DEFAULT_HALL_TICKET_INSTRUCTIONS;
  const instructionsTop = Math.min(cursorY + 2, bottom - 34);
  doc
    .font("Helvetica-Oblique")
    .fontSize(6)
    .fillColor(MUTED)
    .text(instructions, textLeft, instructionsTop, {
      width: textWidth,
      height: 16,
      ellipsis: true,
    });

  const sigY = bottom - 14;
  doc.font("Helvetica").fontSize(6.5).fillColor(INK);
  doc.text("Student sign: ____________", textLeft, sigY, { lineBreak: false });
  doc.text("Invigilator: ____________", textLeft + textWidth * 0.38, sigY, { lineBreak: false });
  doc.text("Principal: ____________", textLeft + textWidth * 0.7, sigY, { lineBreak: false });

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
      dob: student.dob || null,
      photoBytes: student.photoBytes || null,
      photoMimeType: student.photoMimeType || null,
    },
    papers: papersForStudent(allPapers, student.id, enrollmentKeys),
  }));
}

/**
 * Stream an A4 PDF with five hall tickets per page into `res`.
 */
export function streamHallTicketsPdf(res, { letterhead, tickets, filename }) {
  const layout = ticketLayout(A4);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({
    size: "A4",
    margins: {
      top: layout.margin,
      bottom: layout.margin,
      left: layout.margin,
      right: layout.margin,
    },
    autoFirstPage: true,
  });
  doc.pipe(res);

  const schoolName = letterhead?.name || "School";
  const schoolLogo = letterhead?.logo || null;
  const list = tickets?.length ? tickets : [];

  if (!list.length) {
    doc.font("Helvetica").fontSize(12).fillColor(INK).text("No active students in this class.", {
      align: "center",
    });
    doc.end();
    return doc;
  }

  list.forEach((ticket, index) => {
    const slot = index % layout.perPage;
    if (index > 0 && slot === 0) doc.addPage();
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
  });

  doc.end();
  return doc;
}

/** Tiny PNG used when seeding demo student photos in tests. */
export { TINY_PNG as DEMO_STUDENT_PHOTO };
