import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { buildLetterhead } from "./school.js";
import {
  TINY_PNG,
  applyPdfLetterhead,
  pdfMargins,
  writeExcelLetterhead,
} from "./letterhead.js";

const PROFILE = {
  name: "Greenfield Public School",
  motto: "Learn. Lead. Serve.",
  board: "CBSE",
  affiliationNo: "1930123",
  address: "12 Lake View Road",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
  phone: "080-40001234",
  email: "office@greenfield.school",
  logoBytes: TINY_PNG,
  logoMimeType: "image/png",
};

function pdfText(buffer) {
  const hex = [...buffer.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((m) =>
    Buffer.from(m[1], "hex").toString("utf8")
  );
  return hex.join("");
}

describe("applyPdfLetterhead", () => {
  it("embeds the school name and address in the PDF", async () => {
    const chunks = [];
    const doc = new PDFDocument({ margins: pdfMargins(), compress: false });
    doc.on("data", (d) => chunks.push(d));
    const done = new Promise((resolve) => doc.on("end", resolve));
    applyPdfLetterhead(doc, buildLetterhead(PROFILE));
    doc.text("Student Report Card", { align: "center" });
    doc.end();
    await done;
    const text = pdfText(Buffer.concat(chunks));
    assert.match(text, /Greenfield Public School/);
    assert.match(text, /12 Lake View Road/);
    assert.match(text, /Student Report Card/);
  });
});

describe("writeExcelLetterhead", () => {
  it("writes name and address above the sheet and sets a print header", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Marks");
    const start = writeExcelLetterhead(workbook, sheet, buildLetterhead(PROFILE), 4);
    assert.ok(start >= 4);
    assert.equal(sheet.getCell(1, 1).value, "Greenfield Public School");
    const joined = [];
    for (let r = 1; r < start; r += 1) joined.push(String(sheet.getCell(r, 1).value || ""));
    assert.ok(joined.some((t) => t.includes("12 Lake View Road")));
    assert.match(sheet.headerFooter.oddHeader || "", /Greenfield Public School/);
    assert.ok((sheet.pageSetup.printTitlesRow || "").startsWith("1:"));

    sheet.addRow(["Roll No", "Name", "Marks"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const roundTrip = new ExcelJS.Workbook();
    await roundTrip.xlsx.load(buffer);
    assert.equal(roundTrip.worksheets[0].getCell(1, 1).value, "Greenfield Public School");
    assert.ok(roundTrip.worksheets[0].getImages().length >= 1);
  });
});
