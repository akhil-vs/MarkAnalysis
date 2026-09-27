/**
 * Generates docs/pitch/School-Marks-Analytics-Principal-Pitch.pptx
 * Run: node scripts/generate-principal-pitch-pptx.mjs
 */
import PptxGenJS from "pptxgenjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(
  __dirname,
  "..",
  "docs",
  "pitch",
  "School-Marks-Analytics-Principal-Pitch.pptx",
);

const COLORS = {
  navy: "0B1F33",
  navyMid: "14304A",
  cream: "FFFDF8",
  paper: "F7F4EE",
  ink: "12263A",
  muted: "5A6B7D",
  sage: "2F6B5A",
  sageSoft: "E6F1EC",
  gold: "C4A35A",
  white: "FFFFFF",
  badBg: "FAF5F2",
  badLabel: "8C4632",
  line: "D9D3C8",
};

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "PITCH_WIDE", width: 13.333, height: 7.5 });
pptx.layout = "PITCH_WIDE";
pptx.author = "PencilLabs";
pptx.title = "School Marks Analytics — Principal Meeting Pitch";
pptx.subject = "Principal briefing for school adoption";

function addFooter(slide, page, total = 8, dark = false) {
  const ink = dark ? "C8D0D8" : COLORS.muted;
  slide.addText("School Marks Analytics · PencilLabs", {
    x: 0.5,
    y: 7.1,
    w: 8,
    h: 0.28,
    fontSize: 11,
    fontFace: "Calibri",
    color: ink,
  });
  slide.addText(`${page} / ${total}`, {
    x: 11.5,
    y: 7.1,
    w: 1.3,
    h: 0.28,
    fontSize: 11,
    fontFace: "Calibri",
    color: ink,
    align: "right",
  });
}

function kicker(slide, text, y = 0.45, gold = false) {
  slide.addText(text.toUpperCase(), {
    x: 0.7,
    y,
    w: 12,
    h: 0.35,
    fontSize: 12,
    fontFace: "Calibri",
    bold: true,
    color: gold ? COLORS.gold : COLORS.sage,
    charSpacing: 4,
  });
}

function panel(slide, { x, y, w, h, fill = COLORS.white, line = COLORS.line }) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w,
    h,
    fill: { color: fill },
    line: { color: line, width: 1 },
    rectRadius: 0.12,
  });
}

// —— 1. Title ——
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: COLORS.navy },
  });
  s.addShape(pptx.shapes.OVAL, {
    x: 8.5,
    y: -1.2,
    w: 6,
    h: 5,
    fill: { color: "1F4D40" },
    shadow: { type: "outer", color: "000000", blur: 40, opacity: 0.25 },
  });
  s.addShape(pptx.shapes.OVAL, {
    x: -1.5,
    y: 4.5,
    w: 5,
    h: 4,
    fill: { color: "3A3420" },
  });
  kicker(s, "Principal briefing", 2.0, true);
  s.addText("Exam week, under control.", {
    x: 0.7,
    y: 2.4,
    w: 11,
    h: 1.2,
    fontSize: 44,
    fontFace: "Georgia",
    bold: true,
    color: COLORS.cream,
  });
  s.addText(
    "A role-based marks and results platform for your school — teachers enter, leadership approves, and every official list comes from one source of truth.",
    {
      x: 0.7,
      y: 3.7,
      w: 10.5,
      h: 0.9,
      fontSize: 18,
      fontFace: "Calibri",
      color: "D8E0E8",
    },
  );
  const metas = [
    "30–45 minute conversation",
    "Built for principals & exam co-ordinators",
    "Pilot-ready in one exam cycle",
  ];
  metas.forEach((t, i) => {
    const x = 0.7 + i * 3.9;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y: 5.0,
      w: 3.6,
      h: 0.45,
      fill: { color: "1A3348" },
      line: { color: "3A5568", width: 1 },
      rectRadius: 0.2,
    });
    s.addText(t, {
      x,
      y: 5.05,
      w: 3.6,
      h: 0.35,
      fontSize: 12,
      fontFace: "Calibri",
      color: COLORS.cream,
      align: "center",
    });
  });
  addFooter(s, 1, 8, true);
}

// —— 2. Problem ——
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: COLORS.paper },
  });
  kicker(s, "The reality today");
  s.addText("Results still live in scattered spreadsheets.", {
    x: 0.7,
    y: 0.85,
    w: 12,
    h: 0.7,
    fontSize: 30,
    fontFace: "Georgia",
    bold: true,
    color: COLORS.navy,
  });
  s.addText(
    "After every exam, leadership chases incomplete registers, merges files by hand, and hopes the consolidated list matches what parents will see.",
    {
      x: 0.7,
      y: 1.55,
      w: 12,
      h: 0.55,
      fontSize: 15,
      fontFace: "Calibri",
      color: COLORS.muted,
    },
  );

  panel(s, { x: 0.7, y: 2.3, w: 5.8, h: 4.3, fill: COLORS.badBg, line: "E8D5CC" });
  s.addText("COMMON FRICTIONS", {
    x: 0.95,
    y: 2.5,
    w: 5.3,
    h: 0.3,
    fontSize: 11,
    fontFace: "Calibri",
    bold: true,
    color: COLORS.badLabel,
    charSpacing: 2,
  });
  s.addText(
    [
      { text: "Teachers keep personal mark sheets", options: { bullet: true } },
      { text: "Office consolidates under deadline pressure", options: { bullet: true } },
      { text: "Incomplete papers still print as “final”", options: { bullet: true } },
      { text: "Little audit trail when a mark is questioned", options: { bullet: true } },
      { text: "Year-on-year comparison means another weekend in Excel", options: { bullet: true } },
    ],
    {
      x: 0.95,
      y: 3.0,
      w: 5.3,
      h: 3.2,
      fontSize: 15,
      fontFace: "Calibri",
      color: COLORS.ink,
      paraSpacing: 10,
    },
  );

  panel(s, { x: 6.85, y: 2.3, w: 5.8, h: 4.3, fill: COLORS.sageSoft, line: "B7D0C6" });
  s.addText("WHAT LEADERSHIP NEEDS", {
    x: 7.1,
    y: 2.5,
    w: 5.3,
    h: 0.3,
    fontSize: 11,
    fontFace: "Calibri",
    bold: true,
    color: COLORS.sage,
    charSpacing: 2,
  });
  s.addText(
    [
      { text: "One place to see what is still missing", options: { bullet: true } },
      { text: "A clear gate before anything becomes official", options: { bullet: true } },
      { text: "School letterhead on every download", options: { bullet: true } },
      { text: "Answers ready for board and parent meetings", options: { bullet: true } },
      { text: "Staff access you control, not shared passwords", options: { bullet: true } },
    ],
    {
      x: 7.1,
      y: 3.0,
      w: 5.3,
      h: 3.2,
      fontSize: 15,
      fontFace: "Calibri",
      color: COLORS.ink,
      paraSpacing: 10,
    },
  );
  addFooter(s, 2);
}

// —— 3. Solution / workflow ——
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: COLORS.paper },
  });
  kicker(s, "School Marks Analytics");
  s.addText("One controlled workflow from draft to official.", {
    x: 0.7,
    y: 0.85,
    w: 12,
    h: 0.7,
    fontSize: 28,
    fontFace: "Georgia",
    bold: true,
    color: COLORS.navy,
  });
  s.addText(
    "Marks stay draft until submitted and approved. Only approved data feeds analytics, ranks, consolidated lists, report cards, and the parent portal.",
    {
      x: 0.7,
      y: 1.55,
      w: 12,
      h: 0.55,
      fontSize: 15,
      fontFace: "Calibri",
      color: COLORS.muted,
    },
  );

  const chips = [
    "Teachers enter drafts",
    "Submit",
    "Principal / Co-ordinator approve",
    "Analytics · CML · Hall tickets",
  ];
  chips.forEach((t, i) => {
    const x = 0.5 + i * 3.2;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y: 2.35,
      w: 2.9,
      h: 0.55,
      fill: { color: COLORS.sageSoft },
      line: { color: "B7D0C6", width: 1 },
      rectRadius: 0.25,
    });
    s.addText(t, {
      x,
      y: 2.42,
      w: 2.9,
      h: 0.4,
      fontSize: 12,
      fontFace: "Calibri",
      bold: true,
      color: COLORS.sage,
      align: "center",
    });
    if (i < 3) {
      s.addText("→", {
        x: x + 2.85,
        y: 2.4,
        w: 0.35,
        h: 0.4,
        fontSize: 16,
        color: COLORS.gold,
        align: "center",
      });
    }
  });

  const stats = [
    ["Your school", "Isolated campus data — staff, marks, and exams never mix with another school."],
    ["Your brand", "Name, address, and crest print as letterhead on PDFs and Excel downloads."],
    ["Your control", "Join code + principal approval. You decide who enters and what becomes official."],
  ];
  stats.forEach(([title, body], i) => {
    const x = 0.7 + i * 4.1;
    panel(s, { x, y: 3.3, w: 3.9, h: 3.2 });
    s.addText(title, {
      x: x + 0.25,
      y: 3.55,
      w: 3.4,
      h: 0.45,
      fontSize: 20,
      fontFace: "Georgia",
      bold: true,
      color: COLORS.navy,
    });
    s.addText(body, {
      x: x + 0.25,
      y: 4.2,
      w: 3.4,
      h: 1.9,
      fontSize: 14,
      fontFace: "Calibri",
      color: COLORS.muted,
    });
  });
  addFooter(s, 3);
}

// —— 4. Roles ——
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: COLORS.paper },
  });
  kicker(s, "Built for how schools already work");
  s.addText("Three roles. Clear accountability.", {
    x: 0.7,
    y: 0.85,
    w: 12,
    h: 0.6,
    fontSize: 30,
    fontFace: "Georgia",
    bold: true,
    color: COLORS.navy,
  });

  const roles = [
    [
      "Principal",
      [
        "School profile & branding",
        "Staff access & role permissions",
        "Approve or moderate registers",
        "Leadership insights & audit trail",
        "Official CML & hall tickets",
      ],
    ],
    [
      "Exam co-ordinator",
      [
        "Records, exams & paper dates",
        "Chase pending uploads",
        "Enter marks when covering gaps",
        "Approve registers day-to-day",
        "Produce CML & hall tickets",
      ],
    ],
    [
      "Teachers",
      [
        "Enter assigned subject registers",
        "Save draft, then submit",
        "Bulk upload with preview",
        "Class teachers see their section",
        "In-app notices & deadlines",
      ],
    ],
  ];
  roles.forEach(([title, items], i) => {
    const x = 0.7 + i * 4.1;
    panel(s, { x, y: 1.7, w: 3.9, h: 4.9 });
    s.addText(title, {
      x: x + 0.25,
      y: 1.95,
      w: 3.4,
      h: 0.45,
      fontSize: 20,
      fontFace: "Georgia",
      bold: true,
      color: COLORS.navy,
    });
    s.addText(
      items.map((t) => ({ text: t, options: { bullet: true } })),
      {
        x: x + 0.25,
        y: 2.55,
        w: 3.4,
        h: 3.7,
        fontSize: 14,
        fontFace: "Calibri",
        color: COLORS.muted,
        paraSpacing: 10,
      },
    );
  });
  addFooter(s, 4);
}

// —— 5. Outcomes ——
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: COLORS.paper },
  });
  kicker(s, "Outcomes for the principal");
  s.addText("Fewer exam-week surprises. Clearer answers.", {
    x: 0.7,
    y: 0.85,
    w: 12,
    h: 0.6,
    fontSize: 28,
    fontFace: "Georgia",
    bold: true,
    color: COLORS.navy,
  });

  const outcomes = [
    ["Pending uploads, early", "See empty registers and papers waiting for approval. Notify teachers by deadline or incomplete mark list — without ten WhatsApp threads."],
    ["Official only when ready", "Preview downloads stay watermarked. Official consolidated lists unlock only when every subject in the division is approved."],
    ["Insights that travel upstairs", "Class, subject, teacher, and year-on-year views — plus Deep insights for readiness, division gaps, and improvement cohorts."],
    ["Parent-ready outputs", "Hall tickets with photos and paper dates. Report cards with your letterhead. Read-only portal links for approved marks only."],
  ];
  outcomes.forEach(([title, body], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.7 + col * 6.2;
    const y = 1.7 + row * 2.45;
    panel(s, { x, y, w: 5.9, h: 2.25 });
    s.addText(title, {
      x: x + 0.3,
      y: y + 0.25,
      w: 5.3,
      h: 0.4,
      fontSize: 18,
      fontFace: "Georgia",
      bold: true,
      color: COLORS.navy,
    });
    s.addText(body, {
      x: x + 0.3,
      y: y + 0.75,
      w: 5.3,
      h: 1.2,
      fontSize: 14,
      fontFace: "Calibri",
      color: COLORS.muted,
    });
  });
  addFooter(s, 5);
}

// —— 6. Agenda ——
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: COLORS.paper },
  });
  kicker(s, "In this meeting");
  s.addText("A walkthrough of your exam-week path.", {
    x: 0.7,
    y: 0.85,
    w: 12,
    h: 0.55,
    fontSize: 28,
    fontFace: "Georgia",
    bold: true,
    color: COLORS.navy,
  });

  const steps = [
    ["0–8 min", "Listen.", "Confirm how marks move today — who enters, who finalises, where things break."],
    ["8–12 min", "Pitch.", "One workflow: draft → approve → official outputs and analytics."],
    ["12–28 min", "Live demo.", "Pending uploads → approve → consolidated list → school letterhead & staff join code."],
    ["28–45 min", "Fit & ask.", "Objections, pilot scope, named champion, and a start date."],
  ];
  steps.forEach(([time, title, body], i) => {
    const y = 1.6 + i * 1.2;
    panel(s, { x: 0.7, y, w: 12, h: 1.05 });
    s.addText(time, {
      x: 0.95,
      y: y + 0.3,
      w: 1.6,
      h: 0.4,
      fontSize: 14,
      fontFace: "Calibri",
      bold: true,
      color: COLORS.sage,
    });
    s.addText(
      [
        { text: title + " ", options: { bold: true, color: COLORS.navy } },
        { text: body, options: { color: COLORS.muted } },
      ],
      {
        x: 2.7,
        y: y + 0.28,
        w: 9.6,
        h: 0.5,
        fontSize: 15,
        fontFace: "Calibri",
      },
    );
  });
  addFooter(s, 6);
}

// —— 7. Pilot ——
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: COLORS.paper },
  });
  kicker(s, "Low-risk next step");
  s.addText("A 2–4 week pilot on one exam cycle.", {
    x: 0.7,
    y: 0.85,
    w: 12,
    h: 0.55,
    fontSize: 28,
    fontFace: "Georgia",
    bold: true,
    color: COLORS.navy,
  });
  s.addText(
    "One grade or section set. Your exam co-ordinator owns the calendar and approvals. One class teacher enters marks. We support setup in week one.",
    {
      x: 0.7,
      y: 1.5,
      w: 12,
      h: 0.55,
      fontSize: 15,
      fontFace: "Calibri",
      color: COLORS.muted,
    },
  );

  panel(s, { x: 0.7, y: 2.3, w: 5.9, h: 4.2 });
  s.addText("Pilot success looks like", {
    x: 0.95,
    y: 2.55,
    w: 5.4,
    h: 0.4,
    fontSize: 18,
    fontFace: "Georgia",
    bold: true,
    color: COLORS.navy,
  });
  s.addText(
    [
      { text: "Official CML produced without a spreadsheet merge", options: { bullet: true } },
      { text: "Incomplete registers visible before parent day", options: { bullet: true } },
      { text: "Coordinator and one teacher can run the loop unaided", options: { bullet: true } },
    ],
    {
      x: 0.95,
      y: 3.2,
      w: 5.4,
      h: 2.8,
      fontSize: 15,
      fontFace: "Calibri",
      color: COLORS.muted,
      paraSpacing: 12,
    },
  );

  panel(s, { x: 6.85, y: 2.3, w: 5.9, h: 4.2 });
  s.addText("What we need from you", {
    x: 7.1,
    y: 2.55,
    w: 5.4,
    h: 0.4,
    fontSize: 18,
    fontFace: "Georgia",
    bold: true,
    color: COLORS.navy,
  });
  s.addText(
    [
      { text: "Pilot start date and exam name", options: { bullet: true } },
      { text: "Classes / sections in scope", options: { bullet: true } },
      { text: "Named co-ordinator + one class teacher", options: { bullet: true } },
      { text: "School display name and logo for letterhead", options: { bullet: true } },
    ],
    {
      x: 7.1,
      y: 3.2,
      w: 5.4,
      h: 2.8,
      fontSize: 15,
      fontFace: "Calibri",
      color: COLORS.muted,
      paraSpacing: 12,
    },
  );
  addFooter(s, 7);
}

// —— 8. Closing ——
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: COLORS.navy },
  });
  kicker(s, "Closing ask", 0.55, true);
  s.addText("Shall we run your next unit or mid-term on the platform?", {
    x: 0.7,
    y: 1.0,
    w: 12,
    h: 1.0,
    fontSize: 28,
    fontFace: "Georgia",
    bold: true,
    color: COLORS.cream,
  });

  const asks = [
    "Nominate the principal and exam co-ordinator as leadership accounts.",
    "Confirm board grading rules — pass percent, distinction, grade bands.",
    "Schedule a setup window for classes, subjects, roll, and teacher assignments.",
    "Treat the next scheduled exam as the first live cycle — CML and hall tickets from approved registers only.",
  ];
  asks.forEach((text, i) => {
    const y = 2.2 + i * 1.0;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.7,
      y,
      w: 12,
      h: 0.85,
      fill: { color: "16324A" },
      line: { color: "2A4A62", width: 1 },
      rectRadius: 0.1,
    });
    s.addShape(pptx.shapes.OVAL, {
      x: 0.95,
      y: y + 0.2,
      w: 0.45,
      h: 0.45,
      fill: { color: COLORS.gold },
    });
    s.addText(String(i + 1), {
      x: 0.95,
      y: y + 0.25,
      w: 0.45,
      h: 0.35,
      fontSize: 14,
      fontFace: "Calibri",
      bold: true,
      color: COLORS.navy,
      align: "center",
    });
    s.addText(text, {
      x: 1.65,
      y: y + 0.22,
      w: 10.7,
      h: 0.45,
      fontSize: 15,
      fontFace: "Calibri",
      color: COLORS.cream,
    });
  });
  addFooter(s, 8, 8, true);
}

await pptx.writeFile({ fileName: outPath });
console.log(`Wrote ${outPath}`);
