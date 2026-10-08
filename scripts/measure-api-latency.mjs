#!/usr/bin/env node
/**
 * Measure wall-clock latency for UI-critical APIs against a running local API.
 * Usage: node scripts/measure-api-latency.mjs [baseUrl]
 */
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.argv[2] || process.env.API_BASE || "http://localhost:4000";
const PASSWORD = "password123";
const RUNS = Math.max(1, Number(process.env.RUNS || 3));

const ACCOUNTS = {
  principal: "principal@school.edu",
  coordinator: "coordinator@school.edu",
  teacher: "anita.sharma@school.edu",
};

function jarFromSetCookie(headers) {
  const raw = headers.getSetCookie?.() || [];
  const map = new Map();
  for (const line of raw) {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    if (i > 0) map.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return map;
}

function mergeJar(jar, headers) {
  for (const [k, v] of jarFromSetCookie(headers)) jar.set(k, v);
  return jar;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login(email) {
  const jar = new Map();
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const ms = performance.now() - t0;
  mergeJar(jar, res.headers);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login ${email} ${res.status}: ${JSON.stringify(body)}`);
  return {
    jar,
    ms,
    status: res.status,
    role: body.role,
    examId: body.workspace?.examId || body.dashboard?.examId || null,
    hasDashboard: Boolean(body.dashboard),
    dashboardPath: body.dashboardPath || null,
  };
}

async function timed(jar, method, path, { body } = {}) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Cookie: cookieHeader(jar),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const buf = await res.arrayBuffer();
  const ms = performance.now() - t0;
  mergeJar(jar, res.headers);
  return {
    method,
    path,
    status: res.status,
    bytes: buf.byteLength,
    ms: Math.round(ms * 10) / 10,
  };
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
    max: sorted[sorted.length - 1],
    mean: Math.round((sum / sorted.length) * 10) / 10,
  };
}

async function measureRole(roleName, email) {
  const session = await login(email);
  const examQ = session.examId ? `?examId=${encodeURIComponent(session.examId)}` : "";
  const examAmp = session.examId ? `&examId=${encodeURIComponent(session.examId)}` : "";

  /** UI-critical paths for this role (first paint + shell). */
  const endpoints = [
    ["GET", "/api/auth/me"],
    ["GET", "/api/me/workspace"],
    ["GET", "/api/school"],
    ["GET", "/api/classes"],
    ["GET", "/api/exams"],
    ["GET", "/api/subjects"],
    ["GET", "/api/notifications/unread-count"],
  ];

  if (roleName === "principal" || roleName === "coordinator") {
    endpoints.push(
      ["GET", "/api/analytics/awaiting-approvals?countOnly=1"],
      ["GET", "/api/mark-access/count?status=PENDING"],
      ["GET", "/api/analytics/pending-uploads"],
      ["GET", "/api/approvals/inbox?tab=registers"],
      ["GET", "/api/approvals/inbox?tab=access"],
      ["GET", "/api/exports/consolidated"],
      ["GET", "/api/hall-tickets"],
      ["GET", "/api/users?page=1&pageSize=25"],
      ["GET", "/api/users/staff-roles"],
      ["GET", "/api/insights/home"],
      ["GET", "/api/school/setup-status"],
      ["GET", "/api/mark-access?status=PENDING"],
      ["GET", "/api/analytics/awaiting-approvals"]
    );
  }
  if (roleName === "principal") {
    endpoints.push(
      ["GET", "/api/analytics/school?include=summary"],
      ["GET", `/api/analytics/school?include=detail${examAmp}`]
    );
  }
  if (roleName === "coordinator") {
    endpoints.push(["GET", "/api/analytics/coordinator"]);
  }
  if (roleName === "teacher") {
    endpoints.push(
      ["GET", "/api/analytics/teacher"],
      ["GET", `/api/registers${examQ}`],
      ["GET", "/api/notifications?limit=20"],
      ["GET", "/api/marks"]
    );
  }

  // Marks register path needs a class+exam — pick first class if available
  const classesRes = await timed(session.jar, "GET", "/api/classes");
  let classId = null;
  try {
    const classes = JSON.parse(Buffer.from(await (async () => {
      const r = await fetch(`${BASE}/api/classes`, { headers: { Cookie: cookieHeader(session.jar) } });
      return r.arrayBuffer();
    })()).toString());
    const list = Array.isArray(classes) ? classes : classes.items || classes.classes || [];
    classId = list[0]?.id || null;
  } catch {
    /* ignore */
  }
  void classesRes;
  if (classId && session.examId && (roleName === "principal" || roleName === "coordinator" || roleName === "teacher")) {
    endpoints.push([
      "GET",
      `/api/marks?classSectionId=${encodeURIComponent(classId)}&examId=${encodeURIComponent(session.examId)}`,
    ]);
  }

  const byPath = new Map();
  for (let run = 0; run < RUNS; run++) {
    for (const [method, path] of endpoints) {
      const row = await timed(session.jar, method, path);
      const key = `${method} ${path.split("?")[0]}${path.includes("?") ? "?" + path.split("?")[1] : ""}`;
      // Normalize query for grouping: keep meaningful query shape
      const groupKey = `${method} ${path}`;
      if (!byPath.has(groupKey)) byPath.set(groupKey, []);
      byPath.get(groupKey).push(row);
      void key;
    }
  }

  const rows = [...byPath.entries()].map(([path, samples]) => {
    const msList = samples.map((s) => s.ms);
    const last = samples[samples.length - 1];
    const warm = msList.length > 1 ? stats(msList.slice(1)) : null;
    return {
      path,
      method: last.method,
      status: last.status,
      bytes: last.bytes,
      coldMs: msList[0],
      ...stats(msList),
      warmMedian: warm?.median ?? null,
    };
  });

  rows.sort((a, b) => b.coldMs - a.coldMs);

  return {
    role: roleName,
    email,
    loginMs: Math.round(session.ms * 10) / 10,
    loginHasDashboard: session.hasDashboard,
    dashboardPath: session.dashboardPath,
    examId: session.examId,
    endpoints: rows,
  };
}

async function main() {
  const healthT0 = performance.now();
  const health = await fetch(`${BASE}/api/health`);
  const healthMs = Math.round((performance.now() - healthT0) * 10) / 10;
  if (!health.ok) throw new Error(`API not healthy at ${BASE}`);

  const results = {
    base: BASE,
    measuredAt: new Date().toISOString(),
    runsPerEndpoint: RUNS,
    healthMs,
    roles: {},
  };

  for (const [role, email] of Object.entries(ACCOUNTS)) {
    process.stderr.write(`Measuring ${role}…\n`);
    results.roles[role] = await measureRole(role, email);
  }

  // Screen-level parallel estimates (max of parallel fan-out + sum of waterfall)
  function pick(role, substr) {
    const eps = results.roles[role].endpoints;
    const hit = eps.find((e) => e.path.includes(substr));
    return hit?.median ?? null;
  }

  results.screens = {
    sharedShell_principal: {
      note: "Parallel: me + workspace + school + badge counts + unread; catalogs warm in background",
      apis: {
        me: pick("principal", "/api/auth/me"),
        workspace: pick("principal", "/api/me/workspace"),
        school: pick("principal", "/api/school"),
        awaitingCount: pick("principal", "awaiting-approvals?countOnly"),
        markAccessCount: pick("principal", "mark-access/count"),
        unread: pick("principal", "unread-count"),
      },
      estimatedWallMs: Math.max(
        ...[
          pick("principal", "/api/auth/me"),
          pick("principal", "/api/me/workspace"),
          pick("principal", "/api/school"),
          pick("principal", "awaiting-approvals?countOnly"),
          pick("principal", "mark-access/count"),
          pick("principal", "unread-count"),
        ].filter((n) => n != null)
      ),
    },
    principalDashboard: {
      note: "After login embed or prefetch: school summary; then detail + widgets in parallel",
      loginMs: results.roles.principal.loginMs,
      loginEmbedsDashboard: results.roles.principal.loginHasDashboard,
      summary: pick("principal", "include=summary") ?? pick("principal", "school?include=summary"),
      detail: pick("principal", "include=detail"),
      awaiting: pick("principal", "/api/analytics/awaiting-approvals") &&
        results.roles.principal.endpoints.find((e) => e.path === "GET /api/analytics/awaiting-approvals")?.median,
      markAccess: pick("principal", "/api/mark-access?status=PENDING"),
    },
    coordinatorDashboard: {
      loginMs: results.roles.coordinator.loginMs,
      coordinator: pick("coordinator", "/api/analytics/coordinator"),
    },
    teacherDashboard: {
      loginMs: results.roles.teacher.loginMs,
      teacher: pick("teacher", "/api/analytics/teacher"),
      registers: pick("teacher", "/api/registers"),
      notifications: pick("teacher", "/api/notifications?limit=20"),
    },
    markProgress: { pendingUploads: pick("principal", "pending-uploads") },
    approvals: {
      registers: pick("principal", "inbox?tab=registers"),
      access: pick("principal", "inbox?tab=access"),
    },
    insightsHome: { home: pick("principal", "/api/insights/home") },
    staff: {
      users: pick("principal", "/api/users?page=1"),
      staffRoles: pick("principal", "staff-roles"),
      classes: pick("principal", "/api/classes"),
      subjects: pick("principal", "/api/subjects"),
    },
    consolidated: { list: pick("principal", "exports/consolidated") },
    hallTickets: { list: pick("principal", "/api/hall-tickets") },
  };

  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  const outPath = "/opt/cursor/artifacts/api-latency-report.json";
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  // Markdown table for humans
  const lines = [];
  lines.push(`# API latency report`);
  lines.push(`Base: \`${BASE}\` · ${results.measuredAt} · ${RUNS} runs/endpoint (median reported)`);
  lines.push(`Health: **${healthMs} ms**`);
  lines.push("");
  for (const role of Object.keys(results.roles)) {
    const r = results.roles[role];
    lines.push(`## ${role} (login **${r.loginMs} ms**, dashboard embed: ${r.loginHasDashboard})`);
    lines.push("");
    lines.push(`| API | status | cold ms | warm median | bytes |`);
    lines.push(`|-----|--------|---------|-------------|-------|`);
    for (const e of r.endpoints) {
      lines.push(
        `| \`${e.path}\` | ${e.status} | **${e.coldMs}** | ${e.warmMedian ?? "—"} | ${e.bytes} |`
      );
    }
    lines.push("");
  }
  lines.push(`## Screen load estimates (median, local)`);
  lines.push("");
  lines.push(`| Screen | Dominant APIs | Est. wall-clock* |`);
  lines.push(`|--------|---------------|------------------|`);
  const shell = results.screens.sharedShell_principal;
  lines.push(
    `| Shared shell (leadership) | me, workspace, school, badge counts, unread | ~**${shell.estimatedWallMs} ms** (parallel max) |`
  );
  lines.push(
    `| Principal dashboard | login ${results.roles.principal.loginMs} ms (embed=${results.roles.principal.loginHasDashboard}); school analytics | see detail rows |`
  );
  lines.push(
    `| Mark progress | pending-uploads | **${results.screens.markProgress.pendingUploads} ms** |`
  );
  lines.push(
    `| Approvals | inbox registers / access | **${results.screens.approvals.registers}** / **${results.screens.approvals.access} ms** |`
  );
  lines.push(
    `| Insights home | insights/home | **${results.screens.insightsHome.home} ms** |`
  );
  lines.push(
    `| Staff | users∥classes∥subjects∥staff-roles | max of those medians |`
  );
  lines.push(`| Consolidated | exports/consolidated | **${results.screens.consolidated.list} ms** |`);
  lines.push(`| Hall tickets | hall-tickets | **${results.screens.hallTickets.list} ms** |`);
  lines.push("");
  lines.push(`\\* Wall-clock ≈ slowest request in a parallel fan-out, plus any waterfall steps. Local Postgres; production (Vercel + remote DB) is typically slower.`);

  const mdPath = "/opt/cursor/artifacts/api-latency-report.md";
  writeFileSync(mdPath, lines.join("\n"));
  console.log(lines.join("\n"));
  console.error(`\nWrote ${outPath} and ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
