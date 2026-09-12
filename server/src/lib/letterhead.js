/** Vertical space reserved above PDF body content for the repeating letterhead. */
export const PDF_LETTERHEAD_HEIGHT = 92;

const INK = "#1B2437";
const MUTED = "#4A5568";

function letterheadLines(letterhead) {
  if (!letterhead) return [{ text: "School Marks Analytics", style: "name" }];
  return [
    { text: letterhead.name || "School Marks Analytics", style: "name" },
    letterhead.motto ? { text: letterhead.motto, style: "motto" } : null,
    letterhead.affiliationLine ? { text: letterhead.affiliationLine, style: "meta" } : null,
    letterhead.addressLine ? { text: letterhead.addressLine, style: "meta" } : null,
    letterhead.contactLine ? { text: letterhead.contactLine, style: "contact" } : null,
  ].filter(Boolean);
}

export function pdfMargins(extra = {}) {
  const top = extra.top ?? PDF_LETTERHEAD_HEIGHT;
  return {
    top,
    bottom: extra.bottom ?? 48,
    left: extra.left ?? 50,
    right: extra.right ?? 50,
  };
}

export function pdfLandscapeMargins() {
  return pdfMargins({ top: 96, bottom: 32, left: 32, right: 32 });
}

/**
 * Draw a school letterhead in the top margin and repeat it on every added page.
 * Does not advance the document cursor.
 */
export function applyPdfLetterhead(doc, letterhead) {
  const draw = () => {
    const savedX = doc.x;
    const savedY = doc.y;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const top = 16;
    const lines = letterheadLines(letterhead);

    if (letterhead?.logo) {
      try {
        doc.image(letterhead.logo, left, top, { fit: [56, 56] });
      } catch {
        // Invalid or unsupported image — text-only letterhead still prints.
      }
    }

    let y = top;
    for (const line of lines) {
      if (line.style === "name") {
        doc.font("Helvetica-Bold").fontSize(13).fillColor(INK);
      } else if (line.style === "motto") {
        doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED);
      } else if (line.style === "contact") {
        doc.font("Helvetica").fontSize(8).fillColor(MUTED);
      } else {
        doc.font("Helvetica").fontSize(8.5).fillColor(INK);
      }
      doc.text(line.text, left, y, {
        width,
        align: "center",
        lineBreak: false,
      });
      y += line.style === "name" ? 16 : 11;
    }

    const ruleY = Math.max(y + 4, top + 64);
    doc.save();
    doc.strokeColor(INK).lineWidth(1.35).moveTo(left, ruleY).lineTo(right, ruleY).stroke();
    doc.lineWidth(0.4).moveTo(left, ruleY + 3).lineTo(right, ruleY + 3).stroke();
    doc.restore();

    doc.fillColor("#000000");
    doc.x = savedX;
    doc.y = savedY;
  };

  draw();
  doc.on("pageAdded", draw);
}

function excelLogoExtension(letterhead) {
  const mime = String(letterhead?.logoMime || "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  return "png";
}

function excelHeaderText(value) {
  return String(value || "").replace(/&/g, "&&");
}

/**
 * Write a 4-row school letterhead plus a ruled spacer at the top of a worksheet.
 * Returns the 1-based row index where document content should start.
 */
export function writeExcelLetterhead(workbook, sheet, letterhead, columnCount) {
  const cols = Math.max(Number(columnCount) || 1, 3);
  const lines = letterheadLines(letterhead);
  const rows = [];
  for (let i = 0; i < Math.max(lines.length, 3); i += 1) {
    rows.push(lines[i] || { text: "", style: "meta" });
  }

  rows.forEach((line, idx) => {
    const rowNumber = idx + 1;
    sheet.mergeCells(rowNumber, 1, rowNumber, cols);
    const cell = sheet.getCell(rowNumber, 1);
    cell.value = line.text || "";
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    if (line.style === "name") {
      cell.font = { bold: true, size: 16, name: "Calibri", color: { argb: "FF1B2437" } };
      sheet.getRow(rowNumber).height = 22;
    } else if (line.style === "motto") {
      cell.font = { italic: true, size: 10, name: "Calibri", color: { argb: "FF4A5568" } };
      sheet.getRow(rowNumber).height = 16;
    } else if (line.style === "contact") {
      cell.font = { size: 9, name: "Calibri", color: { argb: "FF4A5568" } };
      sheet.getRow(rowNumber).height = 15;
    } else {
      cell.font = { size: 10, name: "Calibri", color: { argb: "FF1B2437" } };
      sheet.getRow(rowNumber).height = 16;
    }
  });

  const spacerRow = rows.length + 1;
  sheet.mergeCells(spacerRow, 1, spacerRow, cols);
  for (let c = 1; c <= cols; c += 1) {
    sheet.getCell(spacerRow, c).border = {
      bottom: { style: "medium", color: { argb: "FF1B2437" } },
    };
  }
  sheet.getRow(spacerRow).height = 8;

  if (letterhead?.logo) {
    try {
      const imageId = workbook.addImage({
        buffer: letterhead.logo,
        extension: excelLogoExtension(letterhead),
      });
      sheet.addImage(imageId, {
        tl: { col: 0, row: 0, nativeColOff: 80000, nativeRowOff: 40000 },
        ext: { width: 54, height: 54 },
        editAs: "oneCell",
      });
    } catch {
      // Text letterhead is still valid without the image.
    }
  }

  const name = excelHeaderText(letterhead?.name || "School");
  const address = excelHeaderText(letterhead?.addressLine || "");
  const contact = excelHeaderText(letterhead?.contactLine || "");
  sheet.headerFooter.oddHeader = `&C&B${name}${address ? `\n${address}` : ""}`;
  sheet.headerFooter.oddFooter = `&L${contact}&RPage &P of &N`;
  sheet.headerFooter.evenHeader = sheet.headerFooter.oddHeader;
  sheet.headerFooter.evenFooter = sheet.headerFooter.oddFooter;
  sheet.pageSetup.printTitlesRow = `1:${spacerRow}`;

  return spacerRow + 1;
}

/** Tiny valid PNG used in letterhead tests. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
