#!/usr/bin/env node
/**
 * Build printable PDFs from docs/user-manuals/*.md into client/public/help/.
 * Run: node scripts/generate-user-manual-pdfs.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const docsDir = path.join(root, "docs", "user-manuals");
const outDir = path.join(root, "client", "public", "help");

const MANUALS = [
  {
    source: "application-flows.md",
    outfile: "application-flows.pdf",
    title: "Application flows by role",
    subtitle: "School Marks Analytics — Principal, Co-ordinator, Teacher",
    id: "flows",
  },
  {
    source: "principal.md",
    outfile: "principal-user-manual.pdf",
    title: "Principal user manual",
    subtitle: "School Marks Analytics",
    id: "principal",
  },
  {
    source: "coordinator.md",
    outfile: "coordinator-user-manual.pdf",
    title: "Exam co-ordinator user manual",
    subtitle: "School Marks Analytics",
    id: "coordinator",
  },
  {
    source: "teacher.md",
    outfile: "teacher-user-manual.pdf",
    title: "Teacher user manual",
    subtitle: "School Marks Analytics",
    id: "teacher",
  },
];

function stripInlineMarkdown(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__/g, "")
    .trim();
}

function parseBlocks(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: stripInlineMarkdown(heading[2]) });
      i += 1;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const raw = lines[i].trim();
        if (!/^\|?\s*:?-{2,}/.test(raw.replace(/\|/g, "").trim()) && !/^\|[\s-|:]+\|$/.test(raw)) {
          const cells = raw
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => stripInlineMarkdown(c.trim()));
          if (cells.some((c) => c.length)) rows.push(cells);
        }
        i += 1;
      }
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }
    if (/^[-*]\s+/.test(line.trim()) || /^\d+\.\s+/.test(line.trim())) {
      const items = [];
      while (i < lines.length && (/^[-*]\s+/.test(lines[i].trim()) || /^\d+\.\s+/.test(lines[i].trim()))) {
        items.push(stripInlineMarkdown(lines[i].trim().replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }
    if (line.trim().startsWith("```")) {
      i += 1;
      const code = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith("|") &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("```") &&
      !/^---+$/.test(lines[i].trim())
    ) {
      para.push(stripInlineMarkdown(lines[i]));
      i += 1;
    }
    if (para.length) blocks.push({ type: "para", text: para.join(" ") });
  }
  return blocks;
}

function ensureSpace(doc, need) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + need > bottom) doc.addPage();
}

function drawTable(doc, rows) {
  const margin = doc.page.margins.left;
  const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cols = Math.max(...rows.map((r) => r.length));
  const colWidth = maxWidth / cols;
  const pad = 4;

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const heights = [];
    for (let c = 0; c < cols; c += 1) {
      const text = row[c] || "";
      heights.push(doc.heightOfString(text, { width: colWidth - pad * 2 }));
    }
    const rowH = Math.max(...heights, 14) + pad * 2;
    ensureSpace(doc, rowH + 2);
    const y0 = doc.y;
    for (let c = 0; c < cols; c += 1) {
      const x = margin + c * colWidth;
      doc.rect(x, y0, colWidth, rowH).strokeColor("#c9c2b6").lineWidth(0.5).stroke();
      doc
        .fillColor(r === 0 ? "#1b2437" : "#2a3344")
        .font(r === 0 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8.5)
        .text(row[c] || "", x + pad, y0 + pad, {
          width: colWidth - pad * 2,
          height: rowH - pad * 2,
        });
    }
    doc.y = y0 + rowH;
  }
  doc.moveDown(0.6);
}

function renderManual(manual) {
  const md = fs.readFileSync(path.join(docsDir, manual.source), "utf8");
  const blocks = parseBlocks(md);
  const outPath = path.join(outDir, manual.outfile);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      bufferPages: true,
      margins: { top: 56, bottom: 56, left: 54, right: 54 },
      info: {
        Title: manual.title,
        Author: "School Marks Analytics",
        Subject: manual.subtitle,
      },
    });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    doc.fillColor("#1b2437").font("Helvetica-Bold").fontSize(20).text(manual.title);
    doc.moveDown(0.25);
    doc.fillColor("#5c6575").font("Helvetica").fontSize(11).text(manual.subtitle);
    doc.moveDown(0.15);
    doc
      .fillColor("#8a8276")
      .fontSize(9)
      .text(`Generated ${new Date().toISOString().slice(0, 10)}`);
    doc.moveDown(0.8);
    doc
      .strokeColor("#c45c26")
      .lineWidth(1.5)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(1);

    for (const block of blocks) {
      if (block.type === "heading" && block.level === 1) continue; // already on cover
      if (block.type === "hr") {
        ensureSpace(doc, 16);
        doc
          .strokeColor("#ddd6c8")
          .lineWidth(0.8)
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .stroke();
        doc.moveDown(0.8);
        continue;
      }
      if (block.type === "heading") {
        const size = block.level === 2 ? 14 : 11.5;
        ensureSpace(doc, size + 18);
        doc.moveDown(block.level === 2 ? 0.55 : 0.35);
        doc.fillColor("#1b2437").font("Helvetica-Bold").fontSize(size).text(block.text);
        doc.moveDown(0.25);
        continue;
      }
      if (block.type === "para") {
        ensureSpace(doc, 24);
        doc.fillColor("#2a3344").font("Helvetica").fontSize(10).text(block.text, { align: "left", lineGap: 2 });
        doc.moveDown(0.45);
        continue;
      }
      if (block.type === "list") {
        for (const item of block.items) {
          ensureSpace(doc, 20);
          const textX = doc.page.margins.left + 14;
          const width = doc.page.width - doc.page.margins.right - textX;
          const y = doc.y;
          doc.fillColor("#2a3344").font("Helvetica").fontSize(10).text("•", doc.page.margins.left, y, {
            width: 12,
            lineBreak: false,
          });
          doc.text(item, textX, y, { width, lineGap: 1.5 });
          doc.moveDown(0.15);
        }
        doc.moveDown(0.35);
        continue;
      }
      if (block.type === "code") {
        ensureSpace(doc, 36);
        doc.fillColor("#3d6b4f").font("Courier").fontSize(9).text(block.text, { lineGap: 1.5 });
        doc.moveDown(0.5);
        continue;
      }
      if (block.type === "table") {
        drawTable(doc, block.rows);
      }
    }

    const range = doc.bufferedPageRange();
    for (let p = range.start; p < range.start + range.count; p += 1) {
      doc.switchToPage(p);
      doc
        .fillColor("#8a8276")
        .font("Helvetica")
        .fontSize(8)
        .text(
          `${manual.title} · page ${p - range.start + 1} of ${range.count}`,
          doc.page.margins.left,
          doc.page.height - 36,
          { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "center" }
        );
    }

    doc.end();
    stream.on("finish", () => resolve(outPath));
    stream.on("error", reject);
  });
}

fs.mkdirSync(outDir, { recursive: true });

const written = [];
for (const manual of MANUALS) {
  // eslint-disable-next-line no-await-in-loop
  const out = await renderManual(manual);
  written.push(out);
  console.log("Wrote", path.relative(root, out));
}

const manifest = {
  generatedAt: new Date().toISOString(),
  manuals: MANUALS.map((m) => ({
    id: m.id || m.outfile.replace(/\.pdf$/, "").replace(/-user-manual$/, ""),
    title: m.title,
    file: m.outfile,
    href: `/help/${m.outfile}`,
  })),
};
fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log("Wrote", path.relative(root, path.join(outDir, "manifest.json")));
console.log(`Done (${written.length} PDFs).`);
