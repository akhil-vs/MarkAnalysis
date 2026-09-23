import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { runWithoutTenant } from "../lib/tenant.js";
import { loginAs, startTestServer } from "./httpHarness.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("API staff classroom assignments for all roles", () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>> | null} */
  let server = null;
  /** @type {string[]} */
  const createdUserIds = [];
  /** @type {{ userId: string, classSectionId: string, subjectId: string }[]} */
  const extraAssignments = [];

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
      if (createdUserIds.length) {
        await prisma.teacherAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
      }
      for (const row of extraAssignments) {
        await prisma.teacherAssignment.deleteMany({
          where: {
            userId: row.userId,
            classSectionId: row.classSectionId,
            subjectId: row.subjectId,
          },
        });
      }
      if (createdUserIds.length) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    });
    if (server) await server.close();
  });

  async function pickPaper(jar) {
    const [classesRes, subjectsRes] = await Promise.all([
      server.request("/api/classes", { jar }),
      server.request("/api/subjects", { jar }),
    ]);
    assert.equal(classesRes.status, 200, classesRes.text);
    assert.equal(subjectsRes.status, 200, subjectsRes.text);
    const classes = Array.isArray(classesRes.json) ? classesRes.json : [];
    const subjects = Array.isArray(subjectsRes.json) ? subjectsRes.json : [];
    for (const cls of classes) {
      const subject = subjects.find((s) => s.className === cls.className);
      if (subject) {
        return { classSectionId: cls.id, subjectId: subject.id };
      }
    }
    return null;
  }

  it("principal can assign class × subject papers to principal, coordinator, and vice principal", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");

    const principalLogin = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(principalLogin.status, 200, principalLogin.text);
    const principalId = principalLogin.json?.user?.id;
    assert.ok(principalId);

    const paper = await pickPaper(principalLogin.jar);
    if (!paper) return t.skip("no class/subject pair in seed");

    const staff = await server.request("/api/users?page=1&pageSize=50&sort=name", {
      jar: principalLogin.jar,
    });
    assert.equal(staff.status, 200, staff.text);
    const items = staff.json?.items || staff.json || [];
    const coordinator = items.find((u) => u.role === "EXAM_COORDINATOR" && !u.roleTitle);
    assert.ok(coordinator, "seed exam coordinator missing");

    const toPairs = (assignments) =>
      (assignments || []).map((a) => ({
        classSectionId: a.classSectionId,
        subjectId: a.subjectId,
      }));
    const samePaper = (a) => a.classSectionId === paper.classSectionId && a.subjectId === paper.subjectId;
    const principalOriginal = toPairs(principalLogin.json?.assignments);
    const coordinatorOriginal = toPairs(coordinator.assignments);
    const withPaper = (existing) => (existing.some(samePaper) ? existing : [...existing, paper]);

    const assignPrincipal = await server.request(`/api/users/${principalId}`, {
      method: "PATCH",
      jar: principalLogin.jar,
      body: { assignments: withPaper(principalOriginal) },
    });
    assert.equal(assignPrincipal.status, 200, assignPrincipal.text);
    assert.ok((assignPrincipal.json?.assignments || []).some(samePaper));

    const assignCoordinator = await server.request(`/api/users/${coordinator.id}`, {
      method: "PATCH",
      jar: principalLogin.jar,
      body: { assignments: withPaper(coordinatorOriginal) },
    });
    assert.equal(assignCoordinator.status, 200, assignCoordinator.text);
    assert.ok((assignCoordinator.json?.assignments || []).some(samePaper));
    if (!principalOriginal.some(samePaper)) extraAssignments.push({ userId: principalId, ...paper });
    if (!coordinatorOriginal.some(samePaper)) extraAssignments.push({ userId: coordinator.id, ...paper });

    const stamp = Date.now().toString(36).slice(-6);
    const vicePrincipal = await server.request("/api/users", {
      method: "POST",
      jar: principalLogin.jar,
      body: {
        name: "Vice Principal Probe",
        email: `vp-probe-${stamp}@school.edu`,
        schoolId: `SCH-VP-${stamp}`,
        password: "password123",
        role: "EXAM_COORDINATOR",
        roleTitle: "Vice Principal",
        assignments: [paper],
      },
    });
    assert.equal(vicePrincipal.status, 201, vicePrincipal.text);
    createdUserIds.push(vicePrincipal.json.id);
    assert.equal(vicePrincipal.json.role, "EXAM_COORDINATOR");
    assert.equal(vicePrincipal.json.roleTitle, "Vice Principal");
    assert.equal(vicePrincipal.json.assignments?.length, 1);

    const replacement = await server.request("/api/users", {
      method: "POST",
      jar: principalLogin.jar,
      body: {
        name: "Replacement Teacher Probe",
        email: `rt-probe-${stamp}@school.edu`,
        schoolId: `SCH-RT-${stamp}`,
        password: "password123",
        role: "TEACHER",
      },
    });
    assert.equal(replacement.status, 201, replacement.text);
    createdUserIds.push(replacement.json.id);

    const coordinatorLogin = await loginAs(server, { email: "coordinator@school.edu" });
    assert.equal(coordinatorLogin.status, 200, coordinatorLogin.text);

    const blocked = await server.request(`/api/users/${principalId}`, {
      method: "PATCH",
      jar: coordinatorLogin.jar,
      body: { assignments: [paper] },
    });
    assert.equal(blocked.status, 403, blocked.text);

    const blockedClear = await server.request(`/api/users/${principalId}/clear-classes`, {
      method: "POST",
      jar: coordinatorLogin.jar,
    });
    assert.equal(blockedClear.status, 403, blockedClear.text);

    const stillHasPapers = await server.request(`/api/users/${vicePrincipal.json.id}`, {
      method: "DELETE",
      jar: principalLogin.jar,
    });
    assert.equal(stillHasPapers.status, 409, stillHasPapers.text);
    assert.equal(stillHasPapers.json?.code, "HAS_ASSIGNMENTS");

    const transfer = await server.request(`/api/users/${vicePrincipal.json.id}/transfer`, {
      method: "POST",
      jar: principalLogin.jar,
      body: {
        toUserId: replacement.json.id,
        includeTimetable: false,
        includeClassTeacher: false,
      },
    });
    assert.equal(transfer.status, 200, transfer.text);
    assert.equal(transfer.json?.assignmentsMoved, 1);
    assert.equal((transfer.json?.from?.assignments || []).length, 0);
    assert.equal((transfer.json?.to?.assignments || []).length, 1);

    const restorePrincipal = await server.request(`/api/users/${principalId}`, {
      method: "PATCH",
      jar: principalLogin.jar,
      body: { assignments: principalOriginal },
    });
    assert.equal(restorePrincipal.status, 200, restorePrincipal.text);
    assert.equal((restorePrincipal.json?.assignments || []).length, principalOriginal.length);

    const restoreCoordinator = await server.request(`/api/users/${coordinator.id}`, {
      method: "PATCH",
      jar: principalLogin.jar,
      body: { assignments: coordinatorOriginal },
    });
    assert.equal(restoreCoordinator.status, 200, restoreCoordinator.text);
    assert.equal((restoreCoordinator.json?.assignments || []).length, coordinatorOriginal.length);
  });
});
