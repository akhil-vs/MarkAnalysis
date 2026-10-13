#!/usr/bin/env node
/** Quick cold→warm verification after perf fixes. */
import http from "node:http";
import pg from "pg";

const API = "http://127.0.0.1:4000";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://marks:marks@localhost:5432/marks?schema=public";

async function clearRateLimits() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query('DELETE FROM "RateLimitBucket"');
  await client.end();
}

function request(method, path, { body, cookie } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  const headers = { Accept: "application/json" };
  if (payload) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(payload);
  }
  if (cookie) headers.Cookie = cookie;
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const req = http.request(API + path, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          ms: performance.now() - t0,
          bytes: Buffer.concat(chunks).length,
          body: Buffer.concat(chunks),
          setCookie: res.headers["set-cookie"] || [],
        });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(email) {
  const res = await request("POST", "/api/auth/login", {
    body: { email, password: "password123" },
  });
  if (res.status !== 200) throw new Error(`login ${res.status}`);
  return res.setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function series(cookie, name, path) {
  const cold = await request("GET", path, { cookie });
  const warm1 = await request("GET", path, { cookie });
  const warm2 = await request("GET", path, { cookie });
  const warmAvg = (warm1.ms + warm2.ms) / 2;
  const flag = cold.status >= 400 ? "FAIL" : cold.ms > 500 ? "SLOW" : cold.ms > 200 ? "WARN" : "ok";
  console.log(
    `${flag.padEnd(4)} ${cold.ms.toFixed(0).padStart(5)}→${warmAvg.toFixed(0).padStart(4)}ms  ${(cold.bytes / 1024).toFixed(1).padStart(7)}KB  [${cold.status}] ${name}`
  );
  return { name, coldMs: cold.ms, warmAvgMs: warmAvg, status: cold.status, bytes: cold.bytes };
}

async function main() {
  await clearRateLimits();
  const principal = await login("principal@school.edu");
  const coordinator = await login("coordinator@school.edu");
  const exams = JSON.parse((await request("GET", "/api/exams", { cookie: principal })).body.toString());
  const examList = Array.isArray(exams) ? exams : exams.exams || [];
  const examId = examList[0]?.id;
  const q = examId ? `?examId=${examId}` : "";
  await clearRateLimits();

  const rows = [];
  for (const [name, path, cookie] of [
    ["school summary", "/api/analytics/school?include=summary", principal],
    ["school detail", `/api/analytics/school?include=detail${examId ? `&examId=${examId}` : ""}`, principal],
    ["classes-overview", `/api/analytics/classes-overview${q}`, principal],
    ["subjects-overview", `/api/analytics/subjects-overview${q}`, principal],
    ["staff", `/api/analytics/staff${q}`, principal],
    ["compare/years", "/api/analytics/compare/years", principal],
    ["registers", `/api/registers${q}`, coordinator],
    ["coordinator dash", `/api/analytics/coordinator${q}`, coordinator],
  ]) {
    rows.push(await series(cookie, name, path));
  }

  const students = JSON.parse(
    (await request("GET", "/api/students?page=1&pageSize=1", { cookie: principal })).body.toString()
  );
  const studentId = (students.items || students.students || [])[0]?.id;
  const classes = JSON.parse((await request("GET", "/api/classes", { cookie: principal })).body.toString());
  const classList = Array.isArray(classes) ? classes : classes.items || [];
  if (studentId) rows.push(await series(principal, "student detail", `/api/analytics/student/${studentId}`));
  if (classList[0]?.id) {
    rows.push(
      await series(principal, "class detail", `/api/analytics/class/${classList[0].id}${q}`)
    );
  }

  console.log("\n=== Summary vs baseline (pre-fix cold) ===");
  const baseline = {
    "school detail": 1020,
    "classes-overview": 676,
    "subjects-overview": 705,
    staff: 777,
    "compare/years": 644,
    registers: 99,
  };
  for (const r of rows) {
    const b = baseline[r.name];
    if (!b) continue;
    const pct = (((b - r.coldMs) / b) * 100).toFixed(0);
    console.log(`${r.name}: ${b}ms → ${r.coldMs.toFixed(0)}ms (${pct}% faster)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
