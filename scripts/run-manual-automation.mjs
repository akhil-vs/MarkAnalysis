#!/usr/bin/env node
/**
 * Run user-manual automation tests and write HTML / JSON / Markdown reports.
 *
 * Usage (from repo root):
 *   node scripts/run-manual-automation.mjs
 *   PREPARE_DB=1 SEED=1 node scripts/run-manual-automation.mjs
 *
 * Or via npm:
 *   npm run test:manual-automation
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const serverDir = path.join(root, "server");
const reportsDir = path.join(root, "reports");
const htmlReport = path.join(reportsDir, "manual-automation-report.html");
const artifactDir = "/opt/cursor/artifacts";

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
  if (result.code !== 0) {
    throw new Error("db:prepare failed");
  }
}

async function main() {
  fs.mkdirSync(reportsDir, { recursive: true });

  const env = {
    ...process.env,
    JWT_SECRET: process.env.JWT_SECRET || "api-test-secret",
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "http://127.0.0.1",
    COOKIE_SECURE: "false",
    RATE_LIMIT_STORE: "memory",
    MANUAL_AUTOMATION_REPORT_HTML: htmlReport,
  };

  if (!env.DATABASE_URL) {
    // Load server/.env if present
    const envFile = path.join(serverDir, ".env");
    if (fs.existsSync(envFile)) {
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
    }
  }

  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL is required. Set it or provide server/.env");
    process.exit(1);
  }

  await maybePrepareDb(env);

  console.log("\n→ Running user-manual automation tests…\n");
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
    { cwd: serverDir, env }
  );

  // Copy reports into artifacts when the Cloud Agent mount is present.
  if (fs.existsSync(path.dirname(artifactDir))) {
    fs.mkdirSync(artifactDir, { recursive: true });
    for (const ext of [".html", ".json", ".md"]) {
      const src = htmlReport.replace(/\.html$/i, ext);
      if (fs.existsSync(src)) {
        const dest = path.join(artifactDir, path.basename(src));
        fs.copyFileSync(src, dest);
        console.log(`Copied ${path.basename(src)} → ${dest}`);
      }
    }
  }

  const jsonPath = htmlReport.replace(/\.html$/i, ".json");
  if (fs.existsSync(jsonPath)) {
    const summary = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    console.log("\n=== Automation summary ===");
    console.log(
      `Result: ${summary.totals.fail ? "FAILED" : "PASSED"} · ${summary.totals.pass} passed / ${summary.totals.fail} failed / ${summary.totals.skip} skipped`
    );
    console.log(`HTML report: ${htmlReport}`);
    console.log(`JSON report: ${jsonPath}`);
  } else {
    console.warn("HTML/JSON report was not produced — check reporter output above.");
  }

  process.exit(result.code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
