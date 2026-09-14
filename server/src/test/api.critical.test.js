import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { runWithoutTenant, runWithTenant } from "../lib/tenant.js";
import { loginAs, startTestServer } from "./httpHarness.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("API critical path: tenancy, exports ACL, official CML", () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>> | null} */
  let server = null;
  /** @type {string[]} */
  const createdMarkIds = [];
  const created = {
    users: /** @type {string[]} */ ([]),
    students: /** @type {string[]} */ ([]),
    subjects: /** @type {string[]} */ ([]),
    exams: /** @type {string[]} */ ([]),
    classSections: /** @type {string[]} */ ([]),
  };

  before(async () => {
    if (!hasDb) return;
    process.env.JWT_SECRET ||= "api-test-secret";
    process.env.CLIENT_ORIGIN ||= "http://127.0.0.1";
    process.env.COOKIE_SECURE = "false";
    process.env.RATE_LIMIT_STORE = "memory";
    delete process.env.VERCEL;
    server = await startTestServer();
  });

  after(async () => {
    await runWithoutTenant(async () => {
      if (createdMarkIds.length) {
        await prisma.mark.deleteMany({ where: { id: { in: createdMarkIds } } });
      }
      if (created.students.length) {
        await prisma.student.deleteMany({ where: { id: { in: created.students } } });
      }
      if (created.exams.length) {
        await prisma.exam.deleteMany({ where: { id: { in: created.exams } } });
      }
      if (created.subjects.length) {
        await prisma.subject.deleteMany({ where: { id: { in: created.subjects } } });
      }
      if (created.classSections.length) {
        await prisma.classSection.deleteMany({ where: { id: { in: created.classSections } } });
      }
      if (created.users.length) {
        await prisma.user.deleteMany({ where: { id: { in: created.users } } });
      }
    });
    if (server) await server.close();
  });

  it("awaiting-approvals countOnly is tenant-scoped", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");

    const green = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(green.status, 200, green.text);
    const before = await server.request("/api/analytics/awaiting-approvals?countOnly=1", {
      jar: green.jar,
    });
    assert.equal(before.status, 200, before.text);
    const beforeCount = Number(before.json?.count) || 0;

    const riverside = await runWithoutTenant(() =>
      prisma.school.findFirst({ where: { slug: "riverside" } })
    );
    assert.ok(riverside, "riverside seed school missing");

    const passwordHash = await runWithoutTenant(async () => {
      const donor = await prisma.user.findFirst({
        where: { email: "principal@riverside.school" },
        select: { passwordHash: true },
      });
      assert.ok(donor?.passwordHash);
      return donor.passwordHash;
    });

    const mark = await runWithTenant(riverside.id, async () => {
      // Riverside seed only has a principal — build a minimal submitted register.
      const teacher = await prisma.user.create({
        data: {
          tenantId: riverside.id,
          name: "Riverside Probe Teacher",
          email: `riv-probe-${Date.now()}@riverside.school`,
          schoolId: `RIV-P-${Date.now().toString(36).slice(-5)}`,
          passwordHash,
          role: "TEACHER",
          status: "ACTIVE",
        },
      });
      created.users.push(teacher.id);

      const section = await prisma.classSection.create({
        data: {
          tenantId: riverside.id,
          className: "9",
          section: "Z",
        },
      });
      created.classSections.push(section.id);

      const subject = await prisma.subject.create({
        data: {
          tenantId: riverside.id,
          name: "Mathematics",
          className: "9",
          maxMarks: 100,
        },
      });
      created.subjects.push(subject.id);

      const exam = await prisma.exam.create({
        data: {
          tenantId: riverside.id,
          name: "Critical Path Probe",
          term: "Term 1",
          academicYear: "2025-26",
          date: new Date("2025-12-01"),
          type: "UNIT_TEST",
        },
      });
      created.exams.push(exam.id);

      const student = await prisma.student.create({
        data: {
          tenantId: riverside.id,
          name: "Probe Student",
          rollNo: "Z01",
          classSectionId: section.id,
          academicYear: "2025-26",
          status: "ACTIVE",
        },
      });
      created.students.push(student.id);

      return prisma.mark.create({
        data: {
          tenantId: riverside.id,
          studentId: student.id,
          subjectId: subject.id,
          examId: exam.id,
          marksObtained: 40,
          enteredById: teacher.id,
          status: "SUBMITTED",
        },
      });
    });
    createdMarkIds.push(mark.id);

    const after = await server.request("/api/analytics/awaiting-approvals?countOnly=1", {
      jar: green.jar,
    });
    assert.equal(after.status, 200, after.text);
    assert.equal(
      Number(after.json?.count) || 0,
      beforeCount,
      "greenfield awaiting count leaked riverside submissions"
    );

    const rivLogin = await loginAs(server, { email: "principal@riverside.school" });
    assert.equal(rivLogin.status, 200, rivLogin.text);
    const rivCount = await server.request("/api/analytics/awaiting-approvals?countOnly=1", {
      jar: rivLogin.jar,
    });
    assert.equal(rivCount.status, 200, rivCount.text);
    assert.ok(
      (Number(rivCount.json?.count) || 0) >= 1,
      "riverside principal should see the submitted register"
    );
  });

  it("teachers cannot download report cards outside their classes", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");

    const login = await loginAs(server, { email: "anita.sharma@school.edu" });
    assert.equal(login.status, 200, login.text);

    const scope = await runWithoutTenant(async () => {
      const teacher = await prisma.user.findFirst({
        where: { email: "anita.sharma@school.edu" },
      });
      assert.ok(teacher);
      const assigned = await prisma.teacherAssignment.findMany({
        where: { userId: teacher.id },
        select: { classSectionId: true },
      });
      const homeroom = await prisma.classSection.findMany({
        where: { classTeacherId: teacher.id },
        select: { id: true },
      });
      const allowedIds = [
        ...new Set([
          ...assigned.map((a) => a.classSectionId),
          ...homeroom.map((c) => c.id),
        ]),
      ];
      const outsider = await prisma.student.findFirst({
        where: {
          tenantId: teacher.tenantId,
          status: "ACTIVE",
          ...(allowedIds.length ? { classSectionId: { notIn: allowedIds } } : {}),
        },
      });
      const insider = allowedIds.length
        ? await prisma.student.findFirst({
            where: {
              tenantId: teacher.tenantId,
              status: "ACTIVE",
              classSectionId: { in: allowedIds },
            },
          })
        : null;
      return { outsider, insider };
    });

    if (!scope.outsider) return t.skip("no out-of-scope student in seed");
    if (!scope.insider) return t.skip("no in-scope student in seed");

    const denied = await server.request(`/api/exports/report-card/${scope.outsider.id}`, {
      jar: login.jar,
    });
    assert.equal(denied.status, 403, denied.text);

    const allowed = await server.request(`/api/exports/report-card/${scope.insider.id}`, {
      jar: login.jar,
    });
    assert.ok([200, 404].includes(allowed.status), `unexpected ${allowed.status} ${allowed.text}`);
    assert.notEqual(allowed.status, 403);
  });

  it("official consolidated download returns 409 when incomplete", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");

    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);

    const status = await server.request("/api/exports/consolidated", { jar: login.jar });
    assert.equal(status.status, 200, status.text);
    const incomplete = (status.json?.classes || []).find((c) => !c.ready);
    if (!incomplete) return t.skip("seed has no incomplete consolidated class");

    const res = await server.request(
      `/api/exports/consolidated/${incomplete.id}?format=pdf&official=1`,
      { jar: login.jar }
    );
    assert.equal(res.status, 409, res.text);
    assert.equal(res.json?.code, "INCOMPLETE_CML");
  });
});
