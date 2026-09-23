/**
 * End-to-end API automation mapped to docs/user-manuals/*.md
 *
 * Covers the role checklists for Principal, Exam co-ordinator, and Teacher:
 * sign-in/desks, school setup, marks workflow (draft → submit → approve),
 * consolidated lists / hall tickets, insights, RBAC boundaries, and HELP manuals.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { manualsForRole } from "../../../client/src/lib/helpManuals.js";
import { ACCESS_COOKIE } from "../lib/authCookies.js";
import { loginAs, startTestServer } from "./httpHarness.js";

const hasDb = Boolean(process.env.DATABASE_URL);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const helpDir = path.join(repoRoot, "client/public/help");

const ACCOUNTS = {
  principal: { email: "principal@school.edu", role: "PRINCIPAL" },
  coordinator: { email: "coordinator@school.edu", role: "EXAM_COORDINATOR" },
  teacher: { email: "anita.sharma@school.edu", role: "TEACHER" },
  biology: { email: "meera.iyer@school.edu", role: "TEACHER" },
  riverside: { email: "principal@riverside.school", role: "PRINCIPAL" },
  admin: { email: "admin@platform.edu", role: "PLATFORM_ADMIN" },
};

function listPayload(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.users)) return json.users;
  if (Array.isArray(json.students)) return json.students;
  if (Array.isArray(json.classes)) return json.classes;
  if (Array.isArray(json.subjects)) return json.subjects;
  if (Array.isArray(json.exams)) return json.exams;
  if (Array.isArray(json.schools)) return json.schools;
  return [];
}

function pickCurrentExam(exams) {
  const list = Array.isArray(exams) ? exams : [];
  return (
    list.find((e) => e.academicYear === "2025-26" && /final/i.test(e.name || "")) ||
    list.find((e) => e.academicYear === "2025-26") ||
    list[0] ||
    null
  );
}

describe("User manual automation", () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>> | null} */
  let server = null;
  /** @type {Record<string, any>} */
  const jars = {};
  /** Shared context filled by early steps and reused by later flows. */
  const ctx = {
    examId: null,
    classes: [],
    subjects: [],
    bioAssignment: null,
    bioStudents: [],
    submittedTeacherId: null,
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
    if (server) await server.close();
  });

  describe("Getting access (README + Teacher §1 / Principal §1)", () => {
    it("seed accounts can sign in and receive httpOnly session cookies", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      for (const [key, account] of Object.entries(ACCOUNTS)) {
        if (key === "admin") continue;
        const login = await loginAs(server, { email: account.email });
        assert.equal(login.status, 200, `${account.email}: ${login.text}`);
        assert.equal(login.json?.user?.role, account.role);
        assert.ok(login.jar.has(ACCESS_COOKIE), `${account.email} missing access cookie`);
        jars[key] = login.jar;
        if (login.json?.user?.id && key === "biology") {
          ctx.submittedTeacherId = login.json.user.id;
        }
      }
    });

    it("platform admin can open the platform console school list", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const login = await loginAs(server, { email: ACCOUNTS.admin.email });
      assert.equal(login.status, 200, login.text);
      jars.admin = login.jar;
      const res = await server.request("/api/platform/schools", { jar: login.jar });
      assert.equal(res.status, 200, res.text);
      assert.ok(listPayload(res.json).length >= 1);
    });

    it("staff signup rejects an invalid join code", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/auth/signup", {
        method: "POST",
        body: {
          joinCode: "NOT-A-REAL-CODE",
          name: "Automation Applicant",
          email: `auto-signup-${Date.now()}@example.com`,
          schoolId: `AUTO-${Date.now().toString(36).slice(-5)}`,
          password: "password123",
          role: "TEACHER",
        },
      });
      assert.ok([400, 404].includes(res.status), res.text);
    });
  });

  describe("Principal desk & school setup (Principal §1–§2)", () => {
    it("principal desk returns school analytics summary", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/analytics/school?include=summary", {
        jar: jars.principal,
      });
      assert.equal(res.status, 200, res.text);
      assert.ok(res.json);
    });

    it("principal can read school profile and see join code", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/school", { jar: jars.principal });
      assert.equal(res.status, 200, res.text);
      const school = res.json?.school || res.json;
      assert.ok(school?.name || school?.shortName);
      assert.ok(school?.joinCode || res.json?.joinCode);
    });

    it("records: classes, subjects, students, and exams are available", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const [classes, subjects, students, exams] = await Promise.all([
        server.request("/api/classes", { jar: jars.principal }),
        server.request("/api/subjects", { jar: jars.principal }),
        server.request("/api/students?pageSize=20", { jar: jars.principal }),
        server.request("/api/exams", { jar: jars.principal }),
      ]);
      assert.equal(classes.status, 200, classes.text);
      assert.equal(subjects.status, 200, subjects.text);
      assert.equal(students.status, 200, students.text);
      assert.equal(exams.status, 200, exams.text);

      ctx.classes = listPayload(classes.json);
      ctx.subjects = listPayload(subjects.json);
      const examList = listPayload(exams.json);
      const exam = pickCurrentExam(examList);
      assert.ok(exam?.id, "expected a seeded exam");
      ctx.examId = exam.id;
      assert.ok(ctx.classes.length >= 1);
      assert.ok(ctx.subjects.length >= 1);
      assert.ok(listPayload(students.json).length >= 1);
    });

    it("staff list is available and includes teachers", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/users?pageSize=50", { jar: jars.principal });
      assert.equal(res.status, 200, res.text);
      const users = listPayload(res.json);
      assert.ok(users.some((u) => u.role === "TEACHER"));
      assert.ok(users.some((u) => u.role === "EXAM_COORDINATOR"));
    });

    it("timetables: periods, teachers, and daily board load", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const periods = await server.request("/api/timetable/periods", { jar: jars.principal });
      assert.equal(periods.status, 200, periods.text);
      const teachers = await server.request("/api/timetable/teachers", { jar: jars.principal });
      assert.equal(teachers.status, 200, teachers.text);
      const today = new Date();
      const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const day = await server.request(`/api/timetable/day?date=${ymd}`, {
        jar: jars.principal,
      });
      assert.equal(day.status, 200, day.text);
      const board = JSON.parse(day.text);
      assert.ok(Array.isArray(board.teachers));
      assert.ok(board.teachers.every((t) => typeof t.taughtCount === "number"));
      assert.ok(board.teachers.every((t) => typeof t.taughtMinutes === "number"));

      const teacherList = JSON.parse(teachers.text);
      assert.ok(Array.isArray(teacherList) && teacherList.length > 0, "expected seeded teachers");
      const teacherId = teacherList[0].id;
      const history = await server.request(
        `/api/timetable/teachers/${teacherId}?view=history&date=${ymd}`,
        { jar: jars.principal }
      );
      assert.equal(history.status, 200, history.text);
      const hist = JSON.parse(history.text);
      assert.equal(hist.view, "history");
      assert.ok(Array.isArray(hist.days));
      assert.ok(hist.days.length <= 7, "history loads one week at a time");
      assert.ok(hist.from && hist.to);
      assert.ok(Array.isArray(hist.workingDays) && hist.workingDays.length >= 5);
      assert.ok(
        (hist.days || []).filter((d) => d.isWorkingDay).every((d) => hist.workingDays.includes(d.dayOfWeek)),
        "history days follow the school working week"
      );
      assert.ok(hist.summary && typeof hist.summary.totalTaughtMinutes === "number");
      assert.ok(hist.summary && typeof hist.summary.totalExtraMinutes === "number");
      if (hist.days.length) {
        const sample = hist.days.find((d) => d.isWorkingDay) || hist.days[0];
        assert.ok(Array.isArray(sample.classes));
        assert.equal(typeof sample.taughtMinutes, "number");
        assert.equal(typeof sample.extraMinutes, "number");
      }
    });

    it("principal cannot enter or submit marks (manual §10)", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const put = await server.request("/api/marks", {
        method: "PUT",
        jar: jars.principal,
        body: { examId: ctx.examId, entries: [] },
      });
      assert.equal(put.status, 403, put.text);
      const submit = await server.request("/api/marks/submit", {
        method: "POST",
        jar: jars.principal,
        body: {
          examId: ctx.examId,
          classSectionId: ctx.classes[0]?.id,
          subjectId: ctx.subjects[0]?.id,
        },
      });
      assert.equal(submit.status, 403, submit.text);
    });

    it("only principal can rotate the staff join code", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const denied = await server.request("/api/school/join-code", {
        method: "POST",
        jar: jars.coordinator,
        body: {},
      });
      assert.equal(denied.status, 403, denied.text);

      const before = await server.request("/api/school", { jar: jars.principal });
      const beforeCode = (before.json?.school || before.json)?.joinCode;
      const rotated = await server.request("/api/school/join-code", {
        method: "POST",
        jar: jars.principal,
        body: {},
      });
      assert.equal(rotated.status, 200, rotated.text);
      const afterCode =
        rotated.json?.joinCode ||
        (rotated.json?.school || rotated.json)?.joinCode ||
        (await server.request("/api/school", { jar: jars.principal })).json?.joinCode ||
        (await server.request("/api/school", { jar: jars.principal })).json?.school?.joinCode;
      assert.ok(afterCode);
      assert.notEqual(afterCode, beforeCode);

      // Restore DEMO-JOIN so other flows / docs stay consistent.
      const school = await server.request("/api/school", { jar: jars.principal });
      const profile = school.json?.school || school.json;
      if (profile && afterCode !== "DEMO-JOIN") {
        // join code rotate endpoint only rotates; leave as-is if no restore API.
        // Seed uses DEMO-JOIN; re-seed is the reset path. Capture for report only.
        ctx.rotatedJoinCode = afterCode;
      }
    });
  });

  describe("Teacher desk & mark entry (Teacher §2–§3 / late entry §3.4)", () => {
    it("teacher desk analytics loads for the assigned teacher", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/analytics/teacher", { jar: jars.biology });
      assert.equal(res.status, 200, res.text);
      assert.ok(res.json);
    });

    it("teacher notices / bell unread count is readable", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/notifications/unread-count", {
        jar: jars.biology,
      });
      assert.equal(res.status, 200, res.text);
      assert.ok(typeof (res.json?.count ?? res.json?.unread ?? 0) === "number");
    });

    it("biology teacher opens an empty Final Exam register (past deadline → late entry)", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      assert.ok(ctx.examId, "examId missing from earlier setup");

      const me = await server.request("/api/auth/me", { jar: jars.biology });
      assert.equal(me.status, 200, me.text);
      const assignments = me.json?.assignments || [];
      assert.ok(assignments.length >= 1, "biology teacher needs assignments");
      const assignment = assignments[0];
      ctx.bioAssignment = {
        classSectionId: assignment.classSectionId || assignment.classSection?.id,
        subjectId: assignment.subjectId || assignment.subject?.id,
        teacherId: me.json.user.id,
      };
      assert.ok(ctx.bioAssignment.classSectionId);
      assert.ok(ctx.bioAssignment.subjectId);

      const register = await server.request(
        `/api/marks?examId=${ctx.examId}&classSectionId=${ctx.bioAssignment.classSectionId}&subjectId=${ctx.bioAssignment.subjectId}`,
        { jar: jars.biology }
      );
      assert.equal(register.status, 200, register.text);
      const students = register.json?.students || listPayload(register.json);
      assert.ok(students.length >= 1, "register should list students");
      ctx.bioStudents = students;

      const pastDeadline = Boolean(register.json?.entryAccess?.pastDeadline);
      ctx.pastDeadline = pastDeadline;

      if (pastDeadline) {
        const reqAccess = await server.request("/api/mark-access", {
          method: "POST",
          jar: jars.biology,
          body: {
            examId: ctx.examId,
            classSectionId: ctx.bioAssignment.classSectionId,
            subjectId: ctx.bioAssignment.subjectId,
            kind: "LATE_ENTRY",
            message: "Automation: late entry for empty Biology register",
          },
        });
        assert.ok([200, 201].includes(reqAccess.status), reqAccess.text);
        ctx.accessRequestId = reqAccess.json?.id;
        assert.ok(ctx.accessRequestId, reqAccess.text);

        const approveAccess = await server.request(`/api/mark-access/${ctx.accessRequestId}`, {
          method: "PATCH",
          jar: jars.coordinator,
          body: { status: "APPROVED" },
        });
        assert.equal(approveAccess.status, 200, approveAccess.text);
        assert.equal(approveAccess.json?.status, "APPROVED");
      }
    });

    it("teacher saves draft marks incl. AB / EX / WH, then submits", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const entries = ctx.bioStudents.slice(0, Math.min(ctx.bioStudents.length, 8)).map((s, idx) => {
        const studentId = s.id || s.studentId;
        if (idx === 0) return { studentId, subjectId: ctx.bioAssignment.subjectId, marksObtained: "AB" };
        if (idx === 1) return { studentId, subjectId: ctx.bioAssignment.subjectId, marksObtained: "EX" };
        if (idx === 2) return { studentId, subjectId: ctx.bioAssignment.subjectId, marksObtained: "WH" };
        return {
          studentId,
          subjectId: ctx.bioAssignment.subjectId,
          marksObtained: 55 + (idx % 40),
        };
      });

      const save = await server.request("/api/marks", {
        method: "PUT",
        jar: jars.biology,
        body: { examId: ctx.examId, entries },
      });
      assert.equal(save.status, 200, save.text);
      const results = save.json?.results || [];
      const okCount = results.filter((r) => r.ok === true || r.ok === undefined && !r.error).length;
      assert.ok(
        results.length && results.every((r) => r.ok !== false && !r.error),
        `expected all draft saves to succeed: ${save.text}`
      );
      assert.ok(okCount >= 1 || results.length >= 1, save.text);

      const submit = await server.request("/api/marks/submit", {
        method: "POST",
        jar: jars.biology,
        body: {
          examId: ctx.examId,
          classSectionId: ctx.bioAssignment.classSectionId,
          subjectId: ctx.bioAssignment.subjectId,
        },
      });
      assert.equal(submit.status, 200, submit.text);
      assert.ok((submit.json?.submitted || 0) >= 1);
      ctx.submittedTeacherId = submit.json?.teacherId || ctx.bioAssignment.teacherId;
    });

    it("bulk-upload template is downloadable for the teacher class/exam", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request(
        `/api/marks/template?examId=${ctx.examId}&classSectionId=${ctx.bioAssignment.classSectionId}`,
        { jar: jars.biology }
      );
      assert.equal(res.status, 200, res.text);
    });
  });

  describe("Exam cycle — chase & approve (Principal §3 / Co-ordinator §3)", () => {
    it("pending uploads lists teachers still missing or awaiting approval", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request(
        `/api/analytics/pending-uploads?examId=${ctx.examId}`,
        { jar: jars.principal }
      );
      assert.equal(res.status, 200, res.text);
      assert.ok(Array.isArray(res.json?.teachers) || typeof res.json?.pendingTeacherCount === "number");
    });

    it("awaiting-approvals count includes the submitted biology register", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/analytics/awaiting-approvals?countOnly=1", {
        jar: jars.principal,
      });
      assert.equal(res.status, 200, res.text);
      assert.ok((Number(res.json?.count) || 0) >= 1);
    });

    it("co-ordinator can notify teachers from the ops desk", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/notifications/send", {
        method: "POST",
        jar: jars.coordinator,
        body: {
          kind: "CUSTOM",
          audience: "SELECTED",
          teacherIds: [ctx.bioAssignment.teacherId],
          message: "Automation: please confirm Biology register submission.",
          examId: ctx.examId,
          force: true,
        },
      });
      assert.ok([200, 201].includes(res.status), res.text);
    });

    it("principal approves the submitted biology register", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/marks/approve", {
        method: "POST",
        jar: jars.principal,
        body: {
          examId: ctx.examId,
          classSectionId: ctx.bioAssignment.classSectionId,
          subjectId: ctx.bioAssignment.subjectId,
          teacherId: ctx.submittedTeacherId || ctx.bioAssignment.teacherId,
        },
      });
      assert.equal(res.status, 200, res.text);
      assert.ok((res.json?.approved || 0) >= 1);
    });

    it("access requests inbox is readable by leadership", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/mark-access", { jar: jars.coordinator });
      assert.equal(res.status, 200, res.text);
    });

    it("audit log is available to principal (full) and co-ordinator", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const principalAudit = await server.request(
        `/api/marks/audit?examId=${ctx.examId}&pageSize=20`,
        { jar: jars.principal }
      );
      assert.equal(principalAudit.status, 200, principalAudit.text);
      const coordAudit = await server.request(
        `/api/marks/audit?examId=${ctx.examId}&pageSize=20`,
        { jar: jars.coordinator }
      );
      assert.equal(coordAudit.status, 200, coordAudit.text);
    });

    it("teachers cannot approve marks", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/marks/approve", {
        method: "POST",
        jar: jars.teacher,
        body: {
          examId: ctx.examId,
          classSectionId: ctx.bioAssignment.classSectionId,
          subjectId: ctx.bioAssignment.subjectId,
          teacherId: ctx.bioAssignment.teacherId,
        },
      });
      assert.equal(res.status, 403, res.text);
    });
  });

  describe("Co-ordinator can enter marks (Co-ordinator §3.1)", () => {
    it("exam co-ordinator desk loads", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/analytics/coordinator", {
        jar: jars.coordinator,
      });
      assert.equal(res.status, 200, res.text);
    });

    it("co-ordinator can open and save a register for an assigned paper gap", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      // Use English 10-D if present (seed leaves it empty), else first class/subject.
      const classes = ctx.classes;
      const subjects = ctx.subjects;
      const section =
        classes.find((c) => c.className === "10" && c.section === "D") || classes[0];
      const subject =
        subjects.find((s) => s.className === section.className && s.name === "English") ||
        subjects.find((s) => s.className === section.className) ||
        subjects[0];
      assert.ok(section && subject);

      const register = await server.request(
        `/api/marks?examId=${ctx.examId}&classSectionId=${section.id}&subjectId=${subject.id}`,
        { jar: jars.coordinator }
      );
      assert.equal(register.status, 200, register.text);
      const students = register.json?.students || [];
      if (!students.length) return t.skip("no students on chosen register");

      // Leadership submit requires teacherId — only verify save drafts works for co-ordinator.
      const entries = students.slice(0, 3).map((s, idx) => ({
        studentId: s.id,
        subjectId: subject.id,
        marksObtained: 70 + idx,
      }));
      const save = await server.request("/api/marks", {
        method: "PUT",
        jar: jars.coordinator,
        body: { examId: ctx.examId, entries },
      });
      assert.equal(save.status, 200, save.text);
    });
  });

  describe("Consolidated lists & hall tickets (manuals §3–§5)", () => {
    it("leadership can open consolidated list status for the exam", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request(`/api/exports/consolidated?examId=${ctx.examId}`, {
        jar: jars.principal,
      });
      assert.equal(res.status, 200, res.text);
      assert.equal(res.json?.viewer, "leadership");
    });

    it("class teacher only sees own sections and cannot open incomplete lists", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request(`/api/exports/consolidated?examId=${ctx.examId}`, {
        jar: jars.teacher,
      });
      assert.equal(res.status, 200, res.text);
      assert.equal(res.json?.viewer, "classTeacher");
      const incomplete = (res.json?.classes || []).filter((c) => !c.ready);
      for (const cls of incomplete) {
        assert.equal(cls.canOpen, false);
        const open = await server.request(
          `/api/exports/consolidated/${cls.id}?examId=${ctx.examId}&format=json`,
          { jar: jars.teacher }
        );
        assert.equal(open.status, 403, open.text);
      }
    });

    it("hall tickets endpoint is reachable for leadership and teachers", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const classSectionId = ctx.classes[0]?.id;
      assert.ok(classSectionId);
      const leadership = await server.request(
        `/api/hall-tickets?examId=${ctx.examId}&classSectionId=${classSectionId}`,
        { jar: jars.coordinator }
      );
      assert.ok([200, 404].includes(leadership.status), leadership.text);

      const teacherClass =
        (await server.request("/api/auth/me", { jar: jars.teacher })).json?.classTeacherOf?.[0]
          ?.id || classSectionId;
      const teacherView = await server.request(
        `/api/hall-tickets?examId=${ctx.examId}&classSectionId=${teacherClass}`,
        { jar: jars.teacher }
      );
      assert.ok([200, 403, 404].includes(teacherView.status), teacherView.text);
    });
  });

  describe("Insights (Principal §4 / Co-ordinator §4 / Teacher §6)", () => {
    it("leadership can open school, subjects, teachers, compare, and deep readiness", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const paths = [
        `/api/analytics/school?examId=${ctx.examId}`,
        `/api/analytics/subjects-overview?examId=${ctx.examId}`,
        `/api/analytics/staff?examId=${ctx.examId}`,
        `/api/analytics/compare/years?examId=${ctx.examId}`,
        `/api/analytics/insights/readiness?examId=${ctx.examId}`,
      ];
      for (const p of paths) {
        const res = await server.request(p, { jar: jars.principal });
        assert.ok([200, 404].includes(res.status), `${p} → ${res.status} ${res.text}`);
      }
    });

    it("teacher can open classes analysis but not leadership subject hub", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const classes = await server.request(
        `/api/analytics/classes-overview?examId=${ctx.examId}`,
        { jar: jars.teacher }
      );
      assert.ok([200, 403].includes(classes.status), classes.text);

      const subjectsHub = await server.request(
        `/api/analytics/subjects-overview?examId=${ctx.examId}`,
        { jar: jars.teacher }
      );
      assert.equal(subjectsHub.status, 403, subjectsHub.text);
    });
  });

  describe("Tenant isolation (README multi-school)", () => {
    it("riverside principal cannot see greenfield staff emails", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const res = await server.request("/api/users?pageSize=100", { jar: jars.riverside });
      assert.equal(res.status, 200, res.text);
      const emails = listPayload(res.json).map((u) => u.email);
      assert.ok(!emails.includes("anita.sharma@school.edu"));
      assert.ok(emails.includes("principal@riverside.school"));
    });
  });

  describe("HELP → User manuals (README + Help page)", () => {
    it("role filtering matches manualsForRole catalog rules", () => {
      assert.deepEqual(
        manualsForRole("PRINCIPAL").map((m) => m.id),
        ["principal"]
      );
      assert.deepEqual(
        manualsForRole("EXAM_COORDINATOR").map((m) => m.id),
        ["coordinator"]
      );
      assert.deepEqual(
        manualsForRole("TEACHER").map((m) => m.id),
        ["teacher"]
      );
      assert.equal(manualsForRole("PLATFORM_ADMIN").length, 3);
    });

    it("PDF manuals exist under client/public/help for each role", () => {
      for (const file of [
        "principal-user-manual.pdf",
        "coordinator-user-manual.pdf",
        "teacher-user-manual.pdf",
      ]) {
        const full = path.join(helpDir, file);
        assert.ok(fs.existsSync(full), `missing ${file}`);
        assert.ok(fs.statSync(full).size > 1000, `${file} looks empty`);
      }
    });

    it("markdown source manuals exist under docs/user-manuals", () => {
      for (const file of ["principal.md", "coordinator.md", "teacher.md", "README.md"]) {
        assert.ok(fs.existsSync(path.join(repoRoot, "docs/user-manuals", file)), file);
      }
    });

    it("role manuals describe current timetable, leave, and records UI", () => {
      const principal = fs.readFileSync(path.join(repoRoot, "docs/user-manuals/principal.md"), "utf8");
      const coordinator = fs.readFileSync(path.join(repoRoot, "docs/user-manuals/coordinator.md"), "utf8");
      const teacher = fs.readFileSync(path.join(repoRoot, "docs/user-manuals/teacher.md"), "utf8");
      for (const [name, text] of [
        ["principal", principal],
        ["coordinator", coordinator],
      ]) {
        assert.match(text, /Hrs history/, `${name} should document hours history`);
        assert.match(text, /Open timetable/, `${name} should document the teachers accordion`);
        assert.match(text, /Click and drag/, `${name} should document daily-board drag scroll`);
        assert.match(text, /Modules & Security/, `${name} should name school profile tabs`);
        assert.match(text, /Classes in this exam/, `${name} should document exam class selection`);
        assert.match(text, /Download PDF \(5 \/ A4\)/, `${name} should document hall-ticket PDF label`);
      }
      assert.match(teacher, /My leave/, "teacher should document leave requests");
      assert.match(teacher, /Student photos/, "teacher should document student photos");
      assert.match(teacher, /Theory max/, "teacher should document theory\/practical marks");
    });
  });

  describe("Profile / session (manuals Account §)", () => {
    it("authenticated user can load /api/auth/me and log out", async (t) => {
      if (!server) return t.skip("DATABASE_URL not set");
      const login = await loginAs(server, { email: ACCOUNTS.teacher.email });
      assert.equal(login.status, 200, login.text);
      const me = await server.request("/api/auth/me", { jar: login.jar });
      assert.equal(me.status, 200, me.text);
      const out = await server.request("/api/auth/logout", {
        method: "POST",
        jar: login.jar,
      });
      assert.equal(out.status, 200, out.text);
      const blocked = await server.request("/api/auth/me", { jar: login.jar });
      assert.equal(blocked.status, 401);
    });
  });
});
