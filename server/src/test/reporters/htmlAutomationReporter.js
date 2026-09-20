/**
 * Custom node:test reporter that writes HTML + JSON automation reports.
 *
 * Usage:
 *   node --test \
 *     --test-reporter=spec --test-reporter-destination=stdout \
 *     --test-reporter=./src/test/reporters/htmlAutomationReporter.js \
 *     --test-reporter-destination=../reports/manual-automation-report.html \
 *     'src/test/manualWorkflows.automation.test.js'
 *
 * Also writes a sibling `.json` summary next to the HTML destination.
 */
import fs from "node:fs";
import path from "node:path";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadge(status) {
  const colors = {
    pass: "#166534",
    fail: "#991b1b",
    skip: "#92400e",
    todo: "#1e3a8a",
  };
  const bg = {
    pass: "#dcfce7",
    fail: "#fee2e2",
    skip: "#fef3c7",
    todo: "#dbeafe",
  };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;color:${colors[status]};background:${bg[status]}">${status.toUpperCase()}</span>`;
}

function renderHtml(summary) {
  const rows = summary.tests
    .map((t) => {
      const dur = t.duration_ms != null ? `${Math.round(t.duration_ms)} ms` : "—";
      const err = t.error
        ? `<pre style="margin:8px 0 0;white-space:pre-wrap;color:#991b1b;font-size:12px">${esc(t.error)}</pre>`
        : "";
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top">${esc(t.suite || "—")}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top">${esc(t.name)}${err}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">${statusBadge(t.status)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums">${esc(dur)}</td>
      </tr>`;
    })
    .join("\n");

  const passRate =
    summary.totals.tests === 0
      ? "0%"
      : `${Math.round((summary.totals.pass / summary.totals.tests) * 100)}%`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>User Manual Automation Report</title>
</head>
<body style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;color:#0f172a">
  <main style="max-width:1100px;margin:0 auto;padding:32px 20px 64px">
    <header style="margin-bottom:28px">
      <p style="margin:0 0 6px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#64748b">School Marks Analytics</p>
      <h1 style="margin:0 0 8px;font-size:28px;line-height:1.2">User Manual Automation Report</h1>
      <p style="margin:0;color:#475569;max-width:62ch">API workflow coverage derived from the Principal, Exam co-ordinator, and Teacher user manuals.</p>
    </header>

    <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
        <div style="font-size:12px;color:#64748b">Total</div>
        <div style="font-size:28px;font-weight:700">${summary.totals.tests}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
        <div style="font-size:12px;color:#64748b">Passed</div>
        <div style="font-size:28px;font-weight:700;color:#166534">${summary.totals.pass}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
        <div style="font-size:12px;color:#64748b">Failed</div>
        <div style="font-size:28px;font-weight:700;color:#991b1b">${summary.totals.fail}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
        <div style="font-size:12px;color:#64748b">Skipped</div>
        <div style="font-size:28px;font-weight:700;color:#92400e">${summary.totals.skip}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
        <div style="font-size:12px;color:#64748b">Pass rate</div>
        <div style="font-size:28px;font-weight:700">${passRate}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
        <div style="font-size:12px;color:#64748b">Duration</div>
        <div style="font-size:28px;font-weight:700">${Math.round(summary.duration_ms)} ms</div>
      </div>
    </section>

    <section style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin-bottom:24px">
      <h2 style="margin:0 0 8px;font-size:16px">Run metadata</h2>
      <dl style="margin:0;display:grid;grid-template-columns:160px 1fr;gap:6px 12px;font-size:14px">
        <dt style="color:#64748b">Generated</dt><dd style="margin:0">${esc(summary.generatedAt)}</dd>
        <dt style="color:#64748b">Result</dt><dd style="margin:0">${summary.totals.fail ? "FAILED" : "PASSED"}</dd>
        <dt style="color:#64748b">Source manuals</dt><dd style="margin:0">docs/user-manuals/{principal,coordinator,teacher}.md</dd>
      </dl>
    </section>

    <section style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f1f5f9;text-align:left">
            <th style="padding:12px;font-weight:600">Suite (manual section)</th>
            <th style="padding:12px;font-weight:600">Test</th>
            <th style="padding:12px;font-weight:600">Status</th>
            <th style="padding:12px;font-weight:600;text-align:right">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4" style="padding:16px;color:#64748b">No tests recorded.</td></tr>`}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>
`;
}

export default async function* htmlAutomationReporter(source) {
  const tests = [];
  const suiteStack = [];
  let startedAt = Date.now();
  let destination = process.env.MANUAL_AUTOMATION_REPORT_HTML || "";

  for await (const event of source) {
    switch (event.type) {
      case "test:enqueue":
        break;
      case "test:dequeue":
        break;
      case "test:start": {
        const nesting = event.data.nesting ?? 0;
        suiteStack.length = nesting;
        if (event.data.name) suiteStack[nesting] = event.data.name;
        break;
      }
      case "test:pass":
      case "test:fail": {
        // Leaf tests have details; suites also emit pass/fail — keep named cases with file.
        const isSuite = Array.isArray(event.data.details?.type) === false && event.data.details?.type === "suite";
        // Prefer leaf tests: those without nested children reporting as suites.
        if (event.data.details?.type === "suite") break;
        const status =
          event.type === "test:pass"
            ? event.data.skip
              ? "skip"
              : event.data.todo
                ? "todo"
                : "pass"
            : "fail";
        if (isSuite) break;
        const suite = suiteStack.slice(0, -1).filter(Boolean).join(" › ") || suiteStack[0] || "";
        tests.push({
          name: event.data.name,
          suite,
          status,
          duration_ms: event.data.details?.duration_ms ?? null,
          error: event.data.details?.error?.cause?.message
            || event.data.details?.error?.message
            || (status === "fail" ? String(event.data.details?.error || "failed") : null),
          file: event.data.file || null,
        });
        break;
      }
      case "test:diagnostic":
        if (typeof event.data?.message === "string" && event.data.message.startsWith("reportHtml=")) {
          destination = event.data.message.slice("reportHtml=".length);
        }
        break;
      case "test:coverage":
        break;
      default:
        break;
    }
    // Keep the default stream happy when multiple reporters are used.
    yield "";
  }

  const totals = {
    tests: tests.length,
    pass: tests.filter((t) => t.status === "pass").length,
    fail: tests.filter((t) => t.status === "fail").length,
    skip: tests.filter((t) => t.status === "skip").length,
    todo: tests.filter((t) => t.status === "todo").length,
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    totals,
    tests,
  };

  const htmlPath =
    destination ||
    path.resolve(process.cwd(), "../reports/manual-automation-report.html");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, renderHtml(summary), "utf8");

  const jsonPath = htmlPath.replace(/\.html$/i, ".json");
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");

  const mdPath = htmlPath.replace(/\.html$/i, ".md");
  const md = [
    "# User Manual Automation Report",
    "",
    `- Generated: ${summary.generatedAt}`,
    `- Result: ${totals.fail ? "FAILED" : "PASSED"}`,
    `- Totals: ${totals.pass} passed / ${totals.fail} failed / ${totals.skip} skipped (of ${totals.tests})`,
    `- Duration: ${Math.round(summary.duration_ms)} ms`,
    "",
    "| Suite | Test | Status | Duration |",
    "|---|---|---|---:|",
    ...tests.map((t) => {
      const dur = t.duration_ms != null ? `${Math.round(t.duration_ms)} ms` : "—";
      return `| ${t.suite || "—"} | ${t.name.replace(/\|/g, "\\|")} | ${t.status} | ${dur} |`;
    }),
    "",
  ].join("\n");
  fs.writeFileSync(mdPath, md, "utf8");

  yield `Wrote automation reports:\n  HTML  ${htmlPath}\n  JSON  ${jsonPath}\n  MD    ${mdPath}\n`;
}
