import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import { accessCookieMaxAgeMs } from "../lib/authCookies.js";
import { invalidateExamCatalog } from "../lib/examCatalog.js";
import { prisma } from "../lib/prisma.js";
import { runWithTenant, runWithoutTenant } from "../lib/tenant.js";
import { MAX_CLASS_SECTION_IDS } from "../lib/studentQuery.js";
import { SPREADSHEET_MAX_BYTES } from "../lib/uploadLimits.js";
import { loginAs, startTestServer } from "./httpHarness.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("launch flows: session, marks cycle, bounded lists, uploads", () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>> | null} */
  let server = null;
  const created = {
    users: /** @type {string[]} */ ([]),
    students: /** @type {string[]} */ ([]),
    subjects: /** @type {string[]} */ ([]),
    exams: /** @type {string[]} */ ([]),
    classSections: /** @type {string[]} */ ([]),
    assignments: /** @type {string[]} */ ([]),
    marks: /** @type {string[]} */ ([]),
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
    try {
      await runWithoutTenant(async () => {
        const fixtures = await prisma.user.findMany({
          where: {
            OR: [
              { email: { startsWith: "launch-temp-" } },
              { email: { startsWith: "launch-probe-" } },
              { email: { startsWith: "launch-out-" } },
            ],
          },
          select: { id: true },
        });
        const userIds = [...new Set([...created.users, ...fixtures.map((row) => row.id)])];
        if (created.marks.length) {
          await prisma.mark.deleteMany({ where: { id: { in: created.marks } } });
        }
        if (userIds.length) {
          await prisma.mark.deleteMany({ where: { enteredById: { in: userIds } } });
          await prisma.markAudit.deleteMany({ where: { changedById: { in: userIds } } });
          await prisma.activityAudit.deleteMany({ where: { actorId: { in: userIds } } });
        }
        if (created.assignments.length) {
          await prisma.teacherAssignment.deleteMany({ where: { id: { in: created.assignments } } });
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
        if (userIds.length) {
          await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        }
      });
    } finally {
      if (server) await server.close();
    }
  });

  it("login access-cookie Max-Age follows JWT_ACCESS_EXPIRES", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const previous = process.env.JWT_ACCESS_EXPIRES;
    process.env.JWT_ACCESS_EXPIRES = "1h";
    try {
      const login = await loginAs(server, { email: "principal@school.edu" });
      assert.equal(login.status, 200, login.text);
      const cookies = login.headers.getSetCookie?.() || [];
      const access = cookies.find((line) => line.startsWith("sma_access="));
      assert.ok(access, cookies.join(" | "));
      assert.match(access, /Max-Age=3600/);
      assert.equal(accessCookieMaxAgeMs("1h"), 60 * 60 * 1000);
    } finally {
      if (previous === undefined) delete process.env.JWT_ACCESS_EXPIRES;
      else process.env.JWT_ACCESS_EXPIRES = previous;
    }
  });

  it("a temporary password can be replaced and then the session is a normal one", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const school = await runWithoutTenant(() =>
      prisma.user.findFirst({
        where: { email: "principal@school.edu" },
        select: { tenantId: true, passwordHash: true },
      })
    );
    assert.ok(school?.tenantId && school.passwordHash);
    const email = `launch-temp-${Date.now()}@school.edu`;
    const user = await runWithTenant(school.tenantId, () =>
      prisma.user.create({
        data: {
          tenantId: school.tenantId,
          name: "Launch Temp",
          email,
          schoolId: `LP-${Date.now().toString(36).slice(-5)}`,
          passwordHash: school.passwordHash,
          role: "TEACHER",
          status: "ACTIVE",
          mustChangePassword: true,
        },
      })
    );
    created.users.push(user.id);

    const login = await loginAs(server, { email, password: "password123" });
    assert.equal(login.status, 200, login.text);
    assert.equal(login.json?.user?.mustChangePassword, true);

    const changed = await server.request("/api/auth/change-password", {
      method: "POST",
      jar: login.jar,
      body: { currentPassword: "password123", newPassword: "password1234" },
    });
    assert.equal(changed.status, 200, changed.text);

    const me = await server.request("/api/auth/me", { jar: login.jar });
    assert.equal(me.status, 200, me.text);
    assert.equal(me.json?.user?.mustChangePassword, false);
  });

  it("deep health reports the platform admin flag", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const res = await server.request("/api/health?deep=1");
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json?.platformAdmin?.ok, true);
    assert.equal(typeof res.json?.platformAdmin?.required, "boolean");
  });

  it("a student list with too many section ids stays bounded", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const principal = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(principal.status, 200, principal.text);
    const classes = await server.request("/api/classes", { jar: principal.jar });
    assert.equal(classes.status, 200, classes.text);
    const section = (Array.isArray(classes.json) ? classes.json : classes.json?.items || [])[0];
    assert.ok(section?.id, classes.text);

    const roster = await server.request(`/api/students?classSectionIds=${encodeURIComponent(section.id)}`, {
      jar: principal.jar,
    });
    assert.equal(roster.status, 200, roster.text);
    const rows = Array.isArray(roster.json) ? roster.json : roster.json?.items || [];
    assert.ok(rows.length >= 1, "expected students in the first section");
    assert.ok(rows.every((row) => row.classSectionId === section.id));

    const tooMany = Array.from({ length: MAX_CLASS_SECTION_IDS + 1 }, (_, i) => `missing-${i}`).join(",");
    const bounded = await server.request(`/api/students?classSectionIds=${encodeURIComponent(tooMany)}`, {
      jar: principal.jar,
    });
    assert.equal(bounded.status, 400, bounded.text);
    assert.match(bounded.json?.error || "", /at most 40/);
  });

  it("rejects a spreadsheet larger than the API limit", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const teacher = await loginAs(server, { email: "meera.iyer@school.edu" });
    assert.equal(teacher.status, 200, teacher.text);
    const form = new FormData();
    form.set("classSectionId", "unused");
    form.set("examId", "unused");
    form.set("file", new Blob([new Uint8Array(SPREADSHEET_MAX_BYTES + 1)]), "marks.xlsx");
    const res = await fetch(`${server.baseUrl}/api/marks/upload`, {
      method: "POST",
      headers: { cookie: teacher.jar.header() },
      body: form,
    });
    const text = await res.text();
    assert.equal(res.status, 400, text);
    assert.match(text, /too large/i);
  });

  it("saves a draft, approves it, and downloads the official consolidated list", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const principalLogin = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(principalLogin.status, 200, principalLogin.text);
    const coord = await loginAs(server, { email: "coordinator@school.edu" });
    assert.equal(coord.status, 200, coord.text);

    const donor = await runWithoutTenant(() =>
      prisma.user.findFirst({
        where: { email: "principal@school.edu" },
        select: { tenantId: true, passwordHash: true },
      })
    );
    assert.ok(donor?.tenantId);
    const stamp = Date.now().toString(36);

    const fixture = await runWithTenant(donor.tenantId, async () => {
      const teacher = await prisma.user.create({
        data: {
          tenantId: donor.tenantId,
          name: "Launch Probe Teacher",
          email: `launch-probe-${stamp}@school.edu`,
          schoolId: `LP-${stamp}`,
          passwordHash: donor.passwordHash,
          role: "TEACHER",
          status: "ACTIVE",
        },
      });
      const section = await prisma.classSection.create({
        data: { tenantId: donor.tenantId, className: `LP${stamp}`, section: "A" },
      });
      const subject = await prisma.subject.create({
        data: {
          tenantId: donor.tenantId,
          name: "Probe",
          className: section.className,
          maxMarks: 100,
        },
      });
      const exam = await prisma.exam.create({
        data: {
          tenantId: donor.tenantId,
          name: "Launch Probe",
          term: "Term 1",
          academicYear: "2025-26",
          date: new Date("2026-06-01"),
          type: "UNIT_TEST",
          marksEntryDeadline: new Date("2027-06-01"),
          includedClassNames: [section.className],
        },
      });
      const student = await prisma.student.create({
        data: {
          tenantId: donor.tenantId,
          name: "Launch Probe Pupil",
          rollNo: "1",
          classSectionId: section.id,
          academicYear: "2025-26",
          status: "ACTIVE",
        },
      });
      const assignment = await prisma.teacherAssignment.create({
        data: {
          tenantId: donor.tenantId,
          userId: teacher.id,
          classSectionId: section.id,
          subjectId: subject.id,
        },
      });
      invalidateExamCatalog();
      return { teacher, section, subject, exam, student, assignment };
    });
    created.users.push(fixture.teacher.id);
    created.classSections.push(fixture.section.id);
    created.subjects.push(fixture.subject.id);
    created.exams.push(fixture.exam.id);
    created.students.push(fixture.student.id);
    created.assignments.push(fixture.assignment.id);

    const teacher = await loginAs(server, { email: fixture.teacher.email });
    assert.equal(teacher.status, 200, teacher.text);

    const riverside = await runWithoutTenant(() =>
      prisma.school.findFirst({ where: { slug: "riverside" }, select: { id: true } })
    );
    assert.ok(riverside, "riverside seed school missing");
    const outsiderHash = await runWithoutTenant(async () => {
      const donor = await prisma.user.findFirst({
        where: { email: "principal@riverside.school" },
        select: { passwordHash: true },
      });
      assert.ok(donor?.passwordHash);
      return donor.passwordHash;
    });
    const outsiderUser = await runWithTenant(riverside.id, () =>
      prisma.user.create({
        data: {
          tenantId: riverside.id,
          name: "Launch Outsider",
          email: `launch-out-${stamp}@riverside.school`,
          schoolId: `LO-${stamp}`,
          passwordHash: outsiderHash,
          role: "TEACHER",
          status: "ACTIVE",
        },
      })
    );
    created.users.push(outsiderUser.id);
    const outsiderLogin = await loginAs(server, { email: outsiderUser.email });
    assert.equal(outsiderLogin.status, 200, outsiderLogin.text);

    const entry = {
      studentId: fixture.student.id,
      subjectId: fixture.subject.id,
      marksObtained: 41,
    };
    const [saved, outsider] = await Promise.all([
      server.request("/api/marks", {
        method: "PUT",
        jar: teacher.jar,
        body: { examId: fixture.exam.id, entries: [entry] },
      }),
      server.request("/api/marks", {
        method: "PUT",
        jar: outsiderLogin.jar,
        body: {
          examId: fixture.exam.id,
          entries: [{ ...entry, marksObtained: 99 }],
        },
      }),
    ]);
    assert.equal(saved.status, 200, saved.text);
    assert.equal(outsider.status, 200, outsider.text);
    assert.ok(
      (outsider.json?.results || []).some((row) => row.error),
      outsider.text
    );
    const markRow = await runWithoutTenant(() =>
      prisma.mark.findFirst({
        where: { studentId: fixture.student.id, examId: fixture.exam.id },
      })
    );
    assert.ok(markRow);
    created.marks.push(markRow.id);
    assert.equal(markRow.status, "DRAFT");
    assert.equal(markRow.enteredById, fixture.teacher.id);
    assert.equal(markRow.marksObtained, 41);

    const submitted = await server.request("/api/marks/submit", {
      method: "POST",
      jar: teacher.jar,
      body: {
        examId: fixture.exam.id,
        classSectionId: fixture.section.id,
        subjectId: fixture.subject.id,
      },
    });
    assert.equal(submitted.status, 200, submitted.text);
    assert.ok((submitted.json?.submitted || 0) >= 1);

    const approved = await server.request("/api/marks/approve", {
      method: "POST",
      jar: coord.jar,
      body: {
        examId: fixture.exam.id,
        classSectionId: fixture.section.id,
        subjectId: fixture.subject.id,
        teacherId: fixture.teacher.id,
      },
    });
    assert.equal(approved.status, 200, approved.text);
    assert.ok((approved.json?.approved || 0) >= 1);

    const download = await server.request(
      `/api/exports/consolidated/${fixture.section.id}?examId=${fixture.exam.id}&format=xlsx&official=1`,
      { jar: principalLogin.jar }
    );
    assert.equal(download.status, 200, download.text.slice(0, 300));
    assert.match(download.headers.get("content-type") || "", /spreadsheet/);
    assert.ok(download.text.startsWith("PK"), "official workbook is an xlsx zip");
  });
});
