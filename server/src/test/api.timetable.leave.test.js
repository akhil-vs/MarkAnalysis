import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { runWithoutTenant, runWithTenant } from "../lib/tenant.js";
import { loginAs, startTestServer } from "./httpHarness.js";
import { ensureTeacherLeaveSchema } from "../lib/ensureSchema.js";
import { weekRangeContaining } from "../lib/teacherHours.js";

const hasDb = Boolean(process.env.DATABASE_URL);

function todayYmd() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isoWeekday(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

describe("API timetable leave + substitutes", () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>> | null} */
  let server = null;
  let tenantId = null;
  /** @type {string[]} */
  const leaveIds = [];
  /** @type {string[]} */
  const subIds = [];

  before(async () => {
    if (!hasDb) return;
    process.env.JWT_SECRET ||= "api-test-secret";
    process.env.CLIENT_ORIGIN ||= "http://127.0.0.1";
    process.env.COOKIE_SECURE = "false";
    process.env.RATE_LIMIT_STORE = "memory";
    delete process.env.VERCEL;
    await runWithoutTenant(async () => {
      await ensureTeacherLeaveSchema();
      const school = await prisma.school.findFirst({ where: { slug: "greenwood" } });
      tenantId = school?.id || (await prisma.school.findFirst())?.id;
    });
    server = await startTestServer();
  });

  after(async () => {
    if (tenantId) {
      await runWithTenant(tenantId, async () => {
        if (subIds.length) await prisma.timetableSubstitution.deleteMany({ where: { id: { in: subIds } } });
        if (leaveIds.length) await prisma.teacherLeave.deleteMany({ where: { id: { in: leaveIds } } });
      });
    }
    if (server) await server.close();
  });

  it("records leave, shows uncovered on daily board, assigns balanced cover", async (t) => {
    if (!server || !tenantId) return t.skip("DATABASE_URL not set");

    const principal = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(principal.status, 200, principal.text);

    const teachersRes = await server.request("/api/timetable/teachers", { jar: principal.jar });
    assert.equal(teachersRes.status, 200, teachersRes.text);
    const teachers = teachersRes.json;
    assert.ok(Array.isArray(teachers) && teachers.length >= 2);

    // Pick a teacher who has at least one weekly slot.
    const withSlots = teachers.filter((t) => (t.entryCount || 0) > 0);
    assert.ok(withSlots.length >= 1, "need seeded timetable entries");
    const onLeave = withSlots[0];

    // Clear any leftover active leave for a clean run.
    await runWithTenant(tenantId, async () => {
      await prisma.timetableSubstitution.deleteMany({ where: { originalTeacherId: onLeave.id } });
      await prisma.teacherLeave.deleteMany({ where: { teacherId: onLeave.id } });
    });

    // Find a calendar date matching one of their teaching weekdays.
    let dateYmd = todayYmd();
    let entry = null;
    await runWithTenant(tenantId, async () => {
      const entries = await prisma.timetableEntry.findMany({
        where: { teacherId: onLeave.id },
        include: { period: true, subject: true, classSection: true },
      });
      assert.ok(entries.length, "teacher should have entries");
      entry = entries[0];
      // Walk forward up to 14 days to hit matching weekday.
      for (let i = 0; i < 14; i++) {
        const [y, m, d] = dateYmd.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d + i));
        const ymd = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
        if (isoWeekday(ymd) === entry.dayOfWeek) {
          dateYmd = ymd;
          break;
        }
      }
    });

    const create = await server.request("/api/timetable/leaves", {
      method: "POST",
      jar: principal.jar,
      body: {
        teacherId: onLeave.id,
        startDate: dateYmd,
        endDate: dateYmd,
        reason: "API test leave",
        suggestCovers: true,
      },
    });
    assert.equal(create.status, 201, create.text);
    assert.ok(create.json?.leave?.id);
    leaveIds.push(create.json.leave.id);
    assert.ok(create.json.plan);
    assert.ok((create.json.plan.suggestions?.length || 0) + (create.json.plan.uncovered?.length || 0) >= 1);

    const day = await server.request(`/api/timetable/day?date=${encodeURIComponent(dateYmd)}`, {
      jar: principal.jar,
    });
    assert.equal(day.status, 200, day.text);
    assert.ok(day.json.summary.onLeaveCount >= 1);
    assert.ok(day.json.summary.uncoveredCount >= 1);

    const leaveTeacher = (day.json.teachers || []).find((t) => t.id === onLeave.id);
    assert.ok(leaveTeacher?.onLeave);

    const suggest = await server.request(
      `/api/timetable/substitutes/suggest?date=${encodeURIComponent(dateYmd)}&periodId=${encodeURIComponent(entry.periodId)}&classSectionId=${encodeURIComponent(entry.classSectionId)}&subjectId=${encodeURIComponent(entry.subjectId)}&originalTeacherId=${encodeURIComponent(onLeave.id)}`,
      { jar: principal.jar }
    );
    assert.equal(suggest.status, 200, suggest.text);
    assert.ok(Array.isArray(suggest.json.candidates));
    assert.ok(suggest.json.candidates.length >= 1, "expected ranked substitutes");
    const pick = suggest.json.candidates[0];

    const assign = await server.request("/api/timetable/substitutes", {
      method: "POST",
      jar: principal.jar,
      body: {
        date: dateYmd,
        periodId: entry.periodId,
        classSectionId: entry.classSectionId,
        subjectId: entry.subjectId,
        originalTeacherId: onLeave.id,
        substituteTeacherId: pick.id,
        leaveId: create.json.leave.id,
        sourceTimetableEntryId: entry.id,
      },
    });
    assert.equal(assign.status, 201, assign.text);
    assert.ok(assign.json.substitutions?.[0]?.id);
    subIds.push(assign.json.substitutions[0].id);

    const day2 = await server.request(`/api/timetable/day?date=${encodeURIComponent(dateYmd)}`, {
      jar: principal.jar,
    });
    assert.equal(day2.status, 200, day2.text);
    assert.ok(day2.json.summary.coverCount >= 1);

    const free = await server.request(
      `/api/timetable/free?date=${encodeURIComponent(dateYmd)}&periodId=${encodeURIComponent(entry.periodId)}`,
      { jar: principal.jar }
    );
    assert.equal(free.status, 200, free.text);
    assert.ok((free.json.onLeave || []).some((t) => t.id === onLeave.id));
    assert.ok(!(free.json.free || []).some((t) => t.id === onLeave.id));
    assert.ok(!(free.json.free || []).some((t) => t.id === pick.id), "cover teacher not free");

    const cancel = await server.request(`/api/timetable/leaves/${create.json.leave.id}`, {
      method: "DELETE",
      jar: principal.jar,
    });
    assert.equal(cancel.status, 200, cancel.text);
  });

  it("teacher requests leave pending; principal approves onto timetable", async (t) => {
    if (!server || !tenantId) return t.skip("DATABASE_URL not set");

    const teacherLogin = await loginAs(server, { email: "anita.sharma@school.edu" });
    assert.equal(teacherLogin.status, 200, teacherLogin.text);
    const principal = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(principal.status, 200, principal.text);

    let teacherId = null;
    let dateYmd = todayYmd();
    await runWithTenant(tenantId, async () => {
      const teacher = await prisma.user.findFirst({
        where: { email: "anita.sharma@school.edu", role: "TEACHER" },
      });
      assert.ok(teacher);
      teacherId = teacher.id;
      await prisma.timetableSubstitution.deleteMany({ where: { originalTeacherId: teacherId } });
      await prisma.teacherLeave.deleteMany({ where: { teacherId } });
      const entries = await prisma.timetableEntry.findMany({ where: { teacherId } });
      if (entries.length) {
        for (let i = 0; i < 14; i++) {
          const [y, m, d] = dateYmd.split("-").map(Number);
          const dt = new Date(Date.UTC(y, m - 1, d + i));
          const ymd = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
          if (isoWeekday(ymd) === entries[0].dayOfWeek) {
            dateYmd = ymd;
            break;
          }
        }
      }
    });

    const request = await server.request("/api/timetable/leaves", {
      method: "POST",
      jar: teacherLogin.jar,
      body: {
        teacherId,
        startDate: dateYmd,
        endDate: dateYmd,
        reason: "Teacher self request",
        suggestCovers: false,
      },
    });
    assert.equal(request.status, 201, request.text);
    assert.equal(request.json?.leave?.status, "PENDING");
    leaveIds.push(request.json.leave.id);

    const dayPending = await server.request(`/api/timetable/day?date=${encodeURIComponent(dateYmd)}`, {
      jar: principal.jar,
    });
    assert.equal(dayPending.status, 200, dayPending.text);
    const before = (dayPending.json.teachers || []).find((t) => t.id === teacherId);
    assert.equal(Boolean(before?.onLeave), false, "pending leave must not overlay timetable");

    const approve = await server.request(`/api/timetable/leaves/${request.json.leave.id}`, {
      method: "PATCH",
      jar: principal.jar,
      body: { status: "ACTIVE", suggestCovers: false },
    });
    assert.equal(approve.status, 200, approve.text);
    const approvedLeave = approve.json?.leave || approve.json;
    assert.equal(approvedLeave.status, "ACTIVE");

    const dayActive = await server.request(`/api/timetable/day?date=${encodeURIComponent(dateYmd)}`, {
      jar: principal.jar,
    });
    assert.equal(dayActive.status, 200, dayActive.text);
    const after = (dayActive.json.teachers || []).find((t) => t.id === teacherId);
    assert.ok(after?.onLeave, "approved leave must show on daily board");

    const reopen = await server.request(`/api/timetable/leaves/${request.json.leave.id}`, {
      method: "PATCH",
      jar: principal.jar,
      body: { status: "PENDING" },
    });
    assert.equal(reopen.status, 400, reopen.text);
    assert.match(reopen.json?.error || "", /Cannot change leave status/i);
  });

  it("returns teacher hours history for the default window", async (t) => {
    if (!server || !tenantId) return t.skip("DATABASE_URL not set");

    const principal = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(principal.status, 200, principal.text);

    const teachersRes = await server.request("/api/timetable/teachers", { jar: principal.jar });
    assert.equal(teachersRes.status, 200, teachersRes.text);
    const teacher = (teachersRes.json || []).find((row) => (row.entryCount || 0) > 0);
    assert.ok(teacher, "need a teacher with timetable slots");

    const bad = await server.request(`/api/timetable/teachers/${teacher.id}/hours?from=2026-09-23&to=2026-09-01`, {
      jar: principal.jar,
    });
    assert.equal(bad.status, 400, bad.text);

    const hours = await server.request(`/api/timetable/teachers/${teacher.id}/hours`, { jar: principal.jar });
    assert.equal(hours.status, 200, hours.text);
    assert.equal(hours.json?.teacher?.id, teacher.id);
    assert.ok(Array.isArray(hours.json?.days));
    assert.ok(hours.json?.from && hours.json?.to);
    assert.ok(Array.isArray(hours.json?.workingDays));
    assert.ok(hours.json.days.length <= hours.json.workingDays.length);
    const expected = weekRangeContaining(todayYmd(), hours.json.workingDays);
    assert.equal(hours.json.from, expected.from);
    assert.equal(hours.json.to, expected.to);
    for (const day of hours.json.days) {
      assert.ok(hours.json.workingDays.includes(day.dayOfWeek));
    }
    assert.ok(hours.json?.summary);
    assert.equal(typeof hours.json.summary.taughtMinutes, "number");
    assert.equal(typeof hours.json.summary.extraMinutes, "number");

    const weekRes = await server.request(`/api/timetable/teachers/${teacher.id}/hours?week=2026-09-23`, {
      jar: principal.jar,
    });
    assert.equal(weekRes.status, 200, weekRes.text);
    const weekExpected = weekRangeContaining("2026-09-23", weekRes.json.workingDays);
    assert.equal(weekRes.json.from, weekExpected.from);
    assert.equal(weekRes.json.to, weekExpected.to);
    assert.ok(!weekRes.json.days.some((day) => !weekRes.json.workingDays.includes(day.dayOfWeek)));

    const rangeRes = await server.request(
      `/api/timetable/teachers/${teacher.id}/hours?from=2026-09-14&to=2026-09-23`,
      { jar: principal.jar }
    );
    assert.equal(rangeRes.status, 200, rangeRes.text);
    assert.equal(rangeRes.json.from, "2026-09-14");
    assert.equal(rangeRes.json.to, "2026-09-23");
    assert.ok(rangeRes.json.days.length <= rangeRes.json.workingDays.length + 3);
  });
});
