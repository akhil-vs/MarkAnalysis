import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import "dotenv/config";
import { prisma } from "./prisma.js";
import { runWithTenant } from "./tenant.js";

describe("prismaCompat relation where filters", () => {
  let tenantId;
  let examId;

  before(async () => {
    const school = await prisma.school.findFirst();
    assert.ok(school, "seeded school required");
    tenantId = school.id;
    await runWithTenant(tenantId, async () => {
      const exam = await prisma.exam.findFirst({ orderBy: { date: "desc" } });
      assert.ok(exam, "seeded exam required");
      examId = exam.id;
    });
  });

  it("supports to-one shorthand student: { status }", async () => {
    await runWithTenant(tenantId, async () => {
      const rows = await prisma.mark.findMany({
        where: { status: "APPROVED", student: { status: "ACTIVE" } },
        take: 1,
        select: { id: true },
      });
      assert.ok(rows.length >= 1);
    });
  });

  it("supports student: { is: { status } }", async () => {
    await runWithTenant(tenantId, async () => {
      const rows = await prisma.mark.findMany({
        where: { status: "APPROVED", student: { is: { status: "ACTIVE" } } },
        take: 1,
        select: { id: true },
      });
      assert.ok(rows.length >= 1);
    });
  });

  it("supports school analytics history where (examId not + student status)", async () => {
    await runWithTenant(tenantId, async () => {
      const rows = await prisma.mark.findMany({
        where: {
          status: "APPROVED",
          examId: { not: examId },
          student: { status: "ACTIVE" },
        },
        take: 3,
        select: {
          studentId: true,
          subjectId: true,
          examId: true,
          marksObtained: true,
          outcome: true,
          subject: { select: { maxMarks: true } },
        },
      });
      assert.ok(Array.isArray(rows));
      assert.ok(rows.every((r) => r.examId !== examId));
    });
  });
});
