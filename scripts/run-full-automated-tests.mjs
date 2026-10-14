#!/usr/bin/env node
/**
 * Senior test-engineer orchestration: run unit, API, manual-role, and E2E
 * suites for every application user type, then write a consolidated report.
 *
 * Usage (from repo root, with Postgres + DATABASE_URL):
 *   PREPARE_DB=1 SEED=1 node scripts/run-full-automated-tests.mjs
 *   node scripts/run-full-automated-tests.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const serverDir = path.join(root, "server");
const clientDir = path.join(root, "client");
const reportsDir = path.join(root, "reports");
const artifactDir = "/opt/cursor/artifacts";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const USER_TYPES = [
  {
    id: "platform_admin",
    label: "Platform admin",
    email: "admin@platform.edu",
    surfaces: ["API platform console", "E2E /platform"],
  },
  {
    id: "principal",
    label: "Principal",
    email: "principal@school.edu",
    surfaces: ["API manual workflows", "E2E principal.spec"],
  },
  {
    id: "exam_coordinator",
    label: "Exam co-ordinator",
    email: "coordinator@school.edu",
    surfaces: ["API manual workflows", "E2E coordinator.spec"],
  },
  {
    id: "teacher",
    label: "Teacher",
    email: "anita.sharma@school.edu / meera.iyer@school.edu",
    surfaces: ["API manual workflows", "E2E teacher.spec", "marks-cycle"],
  },
  {
    id: "principal_riverside",
    label: "Principal (second campus)",
    email: "principal@riverside.school",
    surfaces: ["API tenant isolation"],
  },
  {
    id: "portal_guest",
    label: "Parent / student portal guest",
    email: "(token / access code — no staff login)",
    surfaces: ["API portal links+session", "E2E portal.spec"],
  },
  {
    id: "public_anonymous",
    label: "Public / anonymous",
    email: "(no account)",
    surfaces: ["Landing, login, pilot, privacy, signup gates"],
  },
];

function run(cmd, args, { cwd, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      const s = String(c);
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr.on("data", (c) => {
      const s = String(c);
      stderr += s;
      process.stderr.write(s);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function loadEnvFile(env) {
  const envFile = path.join(serverDir, ".env");
  if (!fs.existsSync(envFile)) return env;
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (env[m[1]] == null) env[m[1]] = val;
  }
  return env;
}

function parseNodeTestTotals(stdout) {
  const pass = Number((stdout.match(/# pass\s+(\d+)/) || [])[1] || 0);
  const fail = Number((stdout.match(/# fail\s+(\d+)/) || [])[1] || 0);
  const skip = Number((stdout.match(/# skip\s+(\d+)/) || [])[1] || 0);
  const todo = Number((stdout.match(/# todo\s+(\d+)/) || [])[1] || 0);
  const tests = Number((stdout.match(/# tests\s+(\d+)/) || [])[1] || pass + fail + skip + todo);
  return { pass, fail, skip, todo, tests };
}

function parsePlaywrightJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    let pass = 0;
    let fail = 0;
    let skip = 0;
    const failedTitles = [];
    const walk = (suite) => {
      for (const s of suite.suites || []) walk(s);
      for (const spec of suite.specs || []) {
        const ok = spec.ok !== false && (spec.tests || []).every((t) =>
          (t.results || []).every((r) => r.status === "passed" || r.status === "skipped")
        );
        const skipped = (spec.tests || []).every((t) =>
          (t.results || []).every((r) => r.status === "skipped")
        );
        if (skipped) skip += 1;
        else if (ok) pass += 1;
        else {
          fail += 1;
          failedTitles.push(spec.title);
        }
      }
    };
    for (const suite of data.suites || []) walk(suite);
    return {
      pass,
      fail,
      skip,
      tests: pass + fail + skip,
      failedTitles,
      durationMs: data.stats?.duration ?? null,
    };
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function maybePrepareDb(env) {
  if (!(env.PREPARE_DB === "1" || env.PREPARE_DB === "true")) return;
  console.log("\n→ Preparing database (PREPARE_DB=1)…");
  const result = await run("npm", ["run", "db:prepare"], {
    cwd: serverDir,
    env: {
      ...env,
      SEED: env.SEED || "1",
      SEED_MODE: env.SEED_MODE || "wipe",
      ALLOW_DESTRUCTIVE_SEED: env.ALLOW_DESTRUCTIVE_SEED || "true",
    },
  });
  if (result.code !== 0) throw new Error("db:prepare failed");
}

async function main() {
  fs.mkdirSync(reportsDir, { recursive: true });
  let env = {
    ...process.env,
    JWT_SECRET: process.env.JWT_SECRET || "api-test-secret-at-least-16",
    CLIENT_ORIGIN:
      process.env.CLIENT_ORIGIN ||
      "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1",
    COOKIE_SECURE: "false",
    RATE_LIMIT_STORE: "memory",
    SEED_FORCE_PASSWORD_CHANGE: process.env.SEED_FORCE_PASSWORD_CHANGE || "false",
    VITE_ENABLE_DEMO_LOGIN: process.env.VITE_ENABLE_DEMO_LOGIN || "true",
    LOGIN_DASHBOARD_BUDGET_MS: process.env.LOGIN_DASHBOARD_BUDGET_MS || "2500",
  };
  env = loadEnvFile(env);
  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL is required. Set it or provide server/.env");
    process.exit(1);
  }

  await maybePrepareDb(env);

  const suites = [];
  const startedAt = new Date().toISOString();

  // 1) Server unit tests (DB-free — matches CI; DATABASE_URL would open Prisma
  // pools in prismaCompat.*.test.js and leave the Node test runner hanging).
  console.log("\n═══ 1/5 Server unit tests ═══\n");
  {
    const t0 = Date.now();
    const unitEnv = { ...env };
    delete unitEnv.DATABASE_URL;
    const result = await run("npm", ["test"], { cwd: serverDir, env: unitEnv });
    const totals = parseNodeTestTotals(result.stdout + "\n" + result.stderr);
    suites.push({
      id: "server-unit",
      name: "Server unit tests",
      layer: "unit",
      exitCode: result.code,
      durationMs: Date.now() - t0,
      ...totals,
      userTypes: ["n/a — lib/middleware"],
    });
  }

  // 2) Client unit tests
  console.log("\n═══ 2/5 Client unit tests ═══\n");
  {
    const t0 = Date.now();
    const unitEnv = { ...env };
    delete unitEnv.DATABASE_URL;
    const result = await run("npm", ["test"], { cwd: clientDir, env: unitEnv });
    const totals = parseNodeTestTotals(result.stdout + "\n" + result.stderr);
    suites.push({
      id: "client-unit",
      name: "Client unit tests",
      layer: "unit",
      exitCode: result.code,
      durationMs: Date.now() - t0,
      ...totals,
      userTypes: ["n/a — SPA helpers"],
    });
  }

  // 3) API integration
  console.log("\n═══ 3/5 API integration tests ═══\n");
  {
    const t0 = Date.now();
    const result = await run("npm", ["run", "test:api"], { cwd: serverDir, env });
    const totals = parseNodeTestTotals(result.stdout + "\n" + result.stderr);
    suites.push({
      id: "api-integration",
      name: "API integration (Postgres)",
      layer: "api",
      exitCode: result.code,
      durationMs: Date.now() - t0,
      ...totals,
      userTypes: [
        "platform_admin",
        "principal",
        "exam_coordinator",
        "teacher",
        "portal_guest",
        "public_anonymous",
      ],
    });
  }

  // 4) Role manual automation (API + manuals)
  console.log("\n═══ 4/5 User-manual role automation ═══\n");
  {
    const t0 = Date.now();
    const htmlReport = path.join(reportsDir, "manual-automation-report.html");
    const reporter = path.join(serverDir, "src/test/reporters/htmlAutomationReporter.js");
    const testFile = path.join(serverDir, "src/test/manualWorkflows.automation.test.js");
    const result = await run(
      process.execPath,
      [
        "--test",
        "--test-reporter=spec",
        "--test-reporter-destination=stdout",
        `--test-reporter=${reporter}`,
        `--test-reporter-destination=${htmlReport}`,
        testFile,
      ],
      {
        cwd: serverDir,
        env: { ...env, MANUAL_AUTOMATION_REPORT_HTML: htmlReport },
      }
    );
    const totals = parseNodeTestTotals(result.stdout + "\n" + result.stderr);
    let manualJson = null;
    const jsonPath = htmlReport.replace(/\.html$/i, ".json");
    if (fs.existsSync(jsonPath)) {
      try {
        manualJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      } catch {
        /* ignore */
      }
    }
    suites.push({
      id: "manual-automation",
      name: "User-manual role automation",
      layer: "api-role",
      exitCode: result.code,
      durationMs: Date.now() - t0,
      ...totals,
      reportHtml: htmlReport,
      reportJson: jsonPath,
      manualSummary: manualJson?.totals || null,
      userTypes: [
        "platform_admin",
        "principal",
        "exam_coordinator",
        "teacher",
        "principal_riverside",
        "portal_guest",
      ],
    });
  }

  // 5) Playwright E2E
  console.log("\n═══ 5/5 Playwright E2E (all roles) ═══\n");
  {
    const t0 = Date.now();
    const result = await run("npx", ["playwright", "test", "--config=e2e/playwright.config.js"], {
      cwd: root,
      env,
    });
    const pw = parsePlaywrightJson(path.join(reportsDir, "playwright-report.json"));
    suites.push({
      id: "e2e-playwright",
      name: "Playwright E2E (browser)",
      layer: "e2e",
      exitCode: result.code,
      durationMs: Date.now() - t0,
      pass: pw?.pass ?? 0,
      fail: pw?.fail ?? (result.code === 0 ? 0 : 1),
      skip: pw?.skip ?? 0,
      tests: pw?.tests ?? 0,
      failedTitles: pw?.failedTitles || [],
      userTypes: [
        "platform_admin",
        "principal",
        "exam_coordinator",
        "teacher",
        "portal_guest",
        "public_anonymous",
      ],
    });
  }

  const finishedAt = new Date().toISOString();
  const totals = suites.reduce(
    (acc, s) => ({
      pass: acc.pass + (s.pass || 0),
      fail: acc.fail + (s.fail || 0),
      skip: acc.skip + (s.skip || 0),
      tests: acc.tests + (s.tests || 0),
      durationMs: acc.durationMs + (s.durationMs || 0),
    }),
    { pass: 0, fail: 0, skip: 0, tests: 0, durationMs: 0 }
  );
  const overallPass = suites.every((s) => s.exitCode === 0) && totals.fail === 0;

  const report = {
    title: "School Marks Analytics — Automated Test Report (All User Types)",
    generatedAt: finishedAt,
    startedAt,
    stamp,
    overall: overallPass ? "PASSED" : "FAILED",
    environment: {
      node: process.version,
      databaseConfigured: Boolean(env.DATABASE_URL),
      demoLogin: env.VITE_ENABLE_DEMO_LOGIN,
    },
    userTypes: USER_TYPES,
    suites,
    totals,
    coverageMatrix: USER_TYPES.map((u) => ({
      ...u,
      coveredBy: suites
        .filter((s) => Array.isArray(s.userTypes) && s.userTypes.includes(u.id))
        .map((s) => s.id),
    })),
    recommendations: [
      overallPass
        ? "All automated suites passed for staff roles, platform admin, portal guest, and public surfaces."
        : "Investigate failed suites first (see suite.failedTitles / manual HTML report).",
      "Keep portal guest E2E deep-path (issue link → open marks) as an API+UI paired case when seed marks exist.",
      "CI already runs unit + API + E2E; prefer npm run test:full-report locally before pilot releases.",
    ],
  };

  const jsonOut = path.join(reportsDir, "full-automated-test-report.json");
  const mdOut = path.join(reportsDir, "full-automated-test-report.md");
  const htmlOut = path.join(reportsDir, "full-automated-test-report.html");
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));

  const md = [
    `# ${report.title}`,
    "",
    `**Result:** ${report.overall}  `,
    `**Generated:** ${report.generatedAt}  `,
    `**Totals:** ${totals.pass} passed / ${totals.fail} failed / ${totals.skip} skipped (${totals.tests} tests)  `,
    `**Duration:** ${(totals.durationMs / 1000).toFixed(1)}s`,
    "",
    "## User types under test",
    "",
    "| User type | Account | Covered by |",
    "|---|---|---|",
    ...report.coverageMatrix.map(
      (u) =>
        `| ${u.label} | \`${u.email}\` | ${u.coveredBy.length ? u.coveredBy.join(", ") : "_gap_"} |`
    ),
    "",
    "## Suite results",
    "",
    "| Suite | Layer | Pass | Fail | Skip | Exit | Duration |",
    "|---|---|---:|---:|---:|---:|---:|",
    ...suites.map(
      (s) =>
        `| ${s.name} | ${s.layer} | ${s.pass || 0} | ${s.fail || 0} | ${s.skip || 0} | ${s.exitCode} | ${((s.durationMs || 0) / 1000).toFixed(1)}s |`
    ),
    "",
    "## Recommendations",
    "",
    ...report.recommendations.map((r) => `- ${r}`),
    "",
    "## Artifacts",
    "",
    `- JSON: \`${jsonOut}\``,
    `- Manual automation HTML: \`reports/manual-automation-report.html\``,
    `- Playwright HTML: \`reports/playwright-html/index.html\``,
    "",
  ].join("\n");
  fs.writeFileSync(mdOut, md);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(report.title)}</title>
<style>
  :root { color-scheme: light; font-family: "IBM Plex Sans", system-ui, sans-serif; }
  body { margin: 0; background: #f6f4ef; color: #1c1917; }
  main { max-width: 960px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
  h1 { font-family: "IBM Plex Serif", Georgia, serif; font-size: 1.75rem; margin: 0 0 .5rem; }
  .badge { display: inline-block; padding: .25rem .7rem; border-radius: 999px; font-weight: 600; font-size: .85rem; }
  .pass { background: #dcfce7; color: #166534; }
  .fail { background: #fee2e2; color: #991b1b; }
  table { width: 100%; border-collapse: collapse; background: #fff; margin: 1rem 0 1.5rem; }
  th, td { text-align: left; padding: .55rem .7rem; border-bottom: 1px solid #e7e5e4; font-size: .92rem; }
  th { background: #fafaf9; }
  .meta { color: #57534e; font-size: .95rem; }
  ul { line-height: 1.5; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(report.title)}</h1>
  <p><span class="badge ${overallPass ? "pass" : "fail"}">${escapeHtml(report.overall)}</span></p>
  <p class="meta">${escapeHtml(report.generatedAt)} · ${totals.pass} passed / ${totals.fail} failed / ${totals.skip} skipped · ${(totals.durationMs / 1000).toFixed(1)}s</p>
  <h2>User types</h2>
  <table><thead><tr><th>User type</th><th>Account</th><th>Covered by</th></tr></thead><tbody>
  ${report.coverageMatrix
    .map(
      (u) =>
        `<tr><td>${escapeHtml(u.label)}</td><td><code>${escapeHtml(u.email)}</code></td><td>${escapeHtml(u.coveredBy.join(", ") || "gap")}</td></tr>`
    )
    .join("")}
  </tbody></table>
  <h2>Suites</h2>
  <table><thead><tr><th>Suite</th><th>Layer</th><th>Pass</th><th>Fail</th><th>Skip</th><th>Exit</th><th>Duration</th></tr></thead><tbody>
  ${suites
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.layer)}</td><td>${s.pass || 0}</td><td>${s.fail || 0}</td><td>${s.skip || 0}</td><td>${s.exitCode}</td><td>${((s.durationMs || 0) / 1000).toFixed(1)}s</td></tr>`
    )
    .join("")}
  </tbody></table>
  <h2>Recommendations</h2>
  <ul>${report.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
</main>
</body>
</html>`;
  fs.writeFileSync(htmlOut, html);

  if (fs.existsSync(path.dirname(artifactDir))) {
    fs.mkdirSync(artifactDir, { recursive: true });
    for (const file of [jsonOut, mdOut, htmlOut]) {
      fs.copyFileSync(file, path.join(artifactDir, path.basename(file)));
    }
    for (const name of [
      "manual-automation-report.html",
      "manual-automation-report.json",
      "manual-automation-report.md",
      "playwright-report.json",
      "playwright-junit.xml",
    ]) {
      const src = path.join(reportsDir, name);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(artifactDir, name));
      }
    }
  }

  console.log("\n=== Full automated test report ===");
  console.log(`Result: ${report.overall}`);
  console.log(
    `Totals: ${totals.pass} passed / ${totals.fail} failed / ${totals.skip} skipped`
  );
  console.log(`Markdown: ${mdOut}`);
  console.log(`HTML: ${htmlOut}`);
  console.log(`JSON: ${jsonOut}`);

  process.exit(overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
