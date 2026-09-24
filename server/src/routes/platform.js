import { randomBytes } from "node:crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { parseEmail } from "../lib/numbers.js";
import { logActivity } from "../lib/activityAudit.js";
import { DEFAULT_PERIODS } from "../lib/periods.js";
import { pageResult, parsePageQuery } from "../lib/pagination.js";
import { allocateJoinCode } from "../lib/school.js";
import {
  parseSlug,
  publicSchool,
  requirePlatformAdmin,
  runWithoutTenant,
  runWithTenant,
  schoolCreateData,
  slugifyName,
} from "../lib/tenant.js";
import { auth, publicUser } from "../middleware/auth.js";
import { revokeAllRefreshSessions } from "../lib/authCookies.js";
import { createBackup, restoreBackup } from "../lib/backup.js";
import { runSchoolDigests } from "../lib/digests.js";
import { flushEmailOutbox } from "../lib/mailer.js";
import { buildHealthPayload } from "../lib/health.js";
import {
  deleteSchoolData,
  listSchoolDataCategories,
  schoolDataCounts,
} from "../lib/schoolDataDelete.js";
import { hashPassword, validatePasswordPolicy } from "../lib/password.js";
export const platformRouter = Router();
platformRouter.use(auth);
platformRouter.use(requirePlatformAdmin());

function optionalTrim(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : null;
}

async function schoolStatsForIds(schoolIds) {
  const ids = [...new Set((schoolIds || []).filter(Boolean))];
  const empty = {
    staffCount: 0,
    principalCount: 0,
    studentCount: 0,
    classCount: 0,
    examCount: 0,
    pendingStaff: 0,
  };
  if (!ids.length) return new Map();

  const [userRows, studentRows, classRows, examRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        "tenantId" AS "schoolId",
        COUNT(*)::int AS "staffCount",
        COUNT(*) FILTER (WHERE role = 'PRINCIPAL' AND status = 'ACTIVE')::int AS "principalCount",
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS "pendingStaff"
      FROM "User"
      WHERE "tenantId" = ANY(${ids})
      GROUP BY "tenantId"
    `,
    prisma.$queryRaw`
      SELECT "tenantId" AS "schoolId", COUNT(*)::int AS "studentCount"
      FROM "Student"
      WHERE "tenantId" = ANY(${ids}) AND status = 'ACTIVE'
      GROUP BY "tenantId"
    `,
    prisma.$queryRaw`
      SELECT "tenantId" AS "schoolId", COUNT(*)::int AS "classCount"
      FROM "ClassSection"
      WHERE "tenantId" = ANY(${ids})
      GROUP BY "tenantId"
    `,
    prisma.$queryRaw`
      SELECT "tenantId" AS "schoolId", COUNT(*)::int AS "examCount"
      FROM "Exam"
      WHERE "tenantId" = ANY(${ids})
      GROUP BY "tenantId"
    `,
  ]);

  const map = new Map(ids.map((id) => [id, { ...empty }]));
  for (const row of userRows || []) {
    const cur = map.get(row.schoolId) || { ...empty };
    cur.staffCount = Number(row.staffCount) || 0;
    cur.principalCount = Number(row.principalCount) || 0;
    cur.pendingStaff = Number(row.pendingStaff) || 0;
    map.set(row.schoolId, cur);
  }
  for (const row of studentRows || []) {
    const cur = map.get(row.schoolId) || { ...empty };
    cur.studentCount = Number(row.studentCount) || 0;
    map.set(row.schoolId, cur);
  }
  for (const row of classRows || []) {
    const cur = map.get(row.schoolId) || { ...empty };
    cur.classCount = Number(row.classCount) || 0;
    map.set(row.schoolId, cur);
  }
  for (const row of examRows || []) {
    const cur = map.get(row.schoolId) || { ...empty };
    cur.examCount = Number(row.examCount) || 0;
    map.set(row.schoolId, cur);
  }
  return map;
}

async function schoolStats(schoolId) {
  const map = await schoolStatsForIds([schoolId]);
  return map.get(schoolId) || {
    staffCount: 0,
    principalCount: 0,
    studentCount: 0,
    classCount: 0,
    examCount: 0,
    pendingStaff: 0,
  };
}

async function loadSchool(id) {
  return prisma.school.findUnique({ where: { id }, omit: { logoBytes: true } });
}

function tempPassword() {
  return `Sch-${randomBytes(6).toString("base64url")}`;
}

platformRouter.get("/overview", async (_req, res) => {
  const [schools, activeSchools, suspendedSchools, staff, students, pendingStaff] = await Promise.all([
    prisma.school.count(),
    prisma.school.count({ where: { status: "ACTIVE" } }),
    prisma.school.count({ where: { status: "SUSPENDED" } }),
    prisma.user.count({ where: { role: { not: "PLATFORM_ADMIN" } } }),
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "PENDING", role: { not: "PLATFORM_ADMIN" } } }),
  ]);
  const recent = await prisma.school.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      slug: true,
      name: true,
      board: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const withCounts = await (async () => {
    const statsMap = await schoolStatsForIds(recent.map((s) => s.id));
    return recent.map((school) => ({
      ...publicSchool(school),
      ...(statsMap.get(school.id) || {}),
    }));
  })();
  res.json({
    kpis: {
      schools,
      activeSchools,
      suspendedSchools,
      staff,
      students,
      pendingStaff,
    },
    recent: withCounts,
  });
});

platformRouter.get("/schools", async (req, res) => {
  const status = req.query.status;
  const where = {
    ...(status === "ACTIVE" || status === "SUSPENDED" ? { status } : {}),
  };
  const paging = parsePageQuery(req.query, { defaultPaged: true, defaultSize: 50 });
  if (paging.q) {
    where.OR = [
      { name: { contains: paging.q, mode: "insensitive" } },
      { slug: { contains: paging.q, mode: "insensitive" } },
      { board: { contains: paging.q, mode: "insensitive" } },
      { affiliationNo: { contains: paging.q, mode: "insensitive" } },
      { email: { contains: paging.q, mode: "insensitive" } },
    ];
  }

  const orderBy = [{ name: "asc" }];
  if (!paging.paged) {
    const schools = await prisma.school.findMany({ where, orderBy, omit: { logoBytes: true } });
    const statsMap = await schoolStatsForIds(schools.map((s) => s.id));
    const items = schools.map((school) => ({
      ...publicSchool(school),
      ...(statsMap.get(school.id) || {}),
    }));
    return res.json(items);
  }

  const [total, schools] = await Promise.all([
    prisma.school.count({ where }),
    prisma.school.findMany({
      where,
      orderBy,
      skip: paging.skip,
      take: paging.take,
      omit: { logoBytes: true },
    }),
  ]);
  const statsMap = await schoolStatsForIds(schools.map((s) => s.id));
  const items = schools.map((school) => ({
    ...publicSchool(school),
    ...(statsMap.get(school.id) || {}),
  }));
  res.json(pageResult({ items, total, page: paging.page, pageSize: paging.pageSize }));
});

platformRouter.get("/schools/:id", async (req, res) => {
  const school = await loadSchool(req.params.id);
  if (!school) return res.status(404).json({ error: "School not found" });
  const [stats, principals, staff] = await Promise.all([
    schoolStats(school.id),
    prisma.user.findMany({
      where: { tenantId: school.id, role: "PRINCIPAL" },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { tenantId: school.id },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      take: 50,
    }),
  ]);
  res.json({
    ...publicSchool(school),
    ...stats,
    workingDays: school.workingDays,
    grading: {
      passPercent: school.passPercent,
      distinctionMin: school.distinctionMin,
    },
    principals: principals.map((u) => publicUser(u)),
    staff: staff.map((u) => publicUser(u)),
  });
});

platformRouter.post("/schools", async (req, res) => {
  const parsed = schoolCreateData(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const slugTaken = await prisma.school.findUnique({ where: { slug: parsed.value.slug } });
  if (slugTaken) return res.status(409).json({ error: "School code already in use" });

  const principalName = String(req.body?.principalName || "").trim();
  const principalEmailRaw = req.body?.principalEmail;
  if (!principalName) return res.status(400).json({ error: "Principal name is required" });
  const principalEmail = parseEmail(principalEmailRaw, { required: true, label: "Principal email" });
  if (principalEmail.error) return res.status(400).json({ error: principalEmail.error });

  const existingEmail = await prisma.user.findUnique({ where: { email: principalEmail.value } });
  if (existingEmail) return res.status(409).json({ error: "Principal email already registered" });

  let password = String(req.body?.principalPassword || "");
  let generatedPassword = null;
  if (!password) {
    generatedPassword = tempPassword();
    password = generatedPassword;
  }
  {
    const policyError = validatePasswordPolicy(password);
    if (policyError) {
      return res.status(400).json({ error: policyError.replace(/^Password/, "Principal password") });
    }
  }

  const principalSchoolId = String(req.body?.principalSchoolId || "").trim() || null;
  const joinCode = await allocateJoinCode();
  const passwordHash = await hashPassword(password);

  const school = await runWithoutTenant(async () => {
    const created = await prisma.school.create({
      data: {
        ...parsed.value,
        joinCode,
      },
    });
    if (DEFAULT_PERIODS.length) {
      await prisma.period.createMany({
        data: DEFAULT_PERIODS.map((p) => ({ ...p, tenantId: created.id })),
      });
    }
    await prisma.user.create({
      data: {
        tenantId: created.id,
        name: principalName,
        email: principalEmail.value,
        schoolId: principalSchoolId,
        passwordHash,
        role: "PRINCIPAL",
        status: "ACTIVE",
        mustChangePassword: true,
      },
    });
    return created;
  });

  await logActivity({
    actorId: req.user.userId,
    action: "SCHOOL_CREATED",
    summary: `Created school ${school.name} (${school.slug})`,
    tenantId: school.id,
    meta: { schoolId: school.id, slug: school.slug, name: school.name, joinCode: school.joinCode },
  });

  res.status(201).json({
    ...publicSchool(school),
    ...(await schoolStats(school.id)),
    generatedPassword,
    message: generatedPassword
      ? "School created. Share the generated principal password once — it will not be shown again."
      : "School created. The principal must change their password on first sign-in.",
  });
});

platformRouter.patch("/schools/:id", async (req, res) => {
  const school = await loadSchool(req.params.id);
  if (!school) return res.status(404).json({ error: "School not found" });

  const data = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: "School name is required" });
    data.name = name;
  }
  if (req.body?.slug !== undefined) {
    const parsed = parseSlug(req.body.slug || (data.name ? slugifyName(data.name) : school.slug));
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (parsed.value !== school.slug) {
      const taken = await prisma.school.findUnique({ where: { slug: parsed.value } });
      if (taken) return res.status(409).json({ error: "School code already in use" });
    }
    data.slug = parsed.value;
  }
  if (req.body?.board !== undefined) data.board = optionalTrim(req.body.board);
  if (req.body?.affiliationNo !== undefined) data.affiliationNo = optionalTrim(req.body.affiliationNo);
  if (req.body?.address !== undefined) data.address = optionalTrim(req.body.address);
  if (req.body?.phone !== undefined) data.phone = optionalTrim(req.body.phone);
  if (req.body?.email !== undefined) data.email = optionalTrim(req.body.email);

  const updated = await prisma.school.update({
    where: { id: school.id },
    data,
  });
  await logActivity({
    actorId: req.user.userId,
    action: "SCHOOL_UPDATED",
    summary: `Updated school ${updated.name} (${updated.slug})`,
    tenantId: updated.id,
    meta: { schoolId: updated.id, slug: updated.slug, name: updated.name },
  });
  res.json({ ...publicSchool(updated), ...(await schoolStats(updated.id)) });
});

platformRouter.post("/schools/:id/status", async (req, res) => {
  const school = await loadSchool(req.params.id);
  if (!school) return res.status(404).json({ error: "School not found" });
  const status = req.body?.status;
  if (status !== "ACTIVE" && status !== "SUSPENDED") {
    return res.status(400).json({ error: "Status must be ACTIVE or SUSPENDED" });
  }
  if (school.status === status) {
    return res.json({ ...publicSchool(school), ...(await schoolStats(school.id)) });
  }
  const updated = await prisma.school.update({
    where: { id: school.id },
    data: { status },
  });
  await logActivity({
    actorId: req.user.userId,
    action: "SCHOOL_STATUS_CHANGED",
    summary: `${updated.name}: ${school.status} → ${status}`,
    tenantId: updated.id,
    meta: { schoolId: updated.id, slug: updated.slug, from: school.status, to: status },
  });
  res.json({ ...publicSchool(updated), ...(await schoolStats(updated.id)) });
});

platformRouter.post("/schools/:id/principal", async (req, res) => {
  const school = await loadSchool(req.params.id);
  if (!school) return res.status(404).json({ error: "School not found" });
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Principal name is required" });
  const email = parseEmail(req.body?.email, { required: true, label: "Principal email" });
  if (email.error) return res.status(400).json({ error: email.error });
  const existingEmail = await prisma.user.findUnique({ where: { email: email.value } });
  if (existingEmail) return res.status(409).json({ error: "Email already registered" });

  let password = String(req.body?.password || "");
  let generatedPassword = null;
  if (!password) {
    generatedPassword = tempPassword();
    password = generatedPassword;
  }
  {
    const policyError = validatePasswordPolicy(password);
    if (policyError) return res.status(400).json({ error: policyError });
  }
  const schoolId = String(req.body?.schoolId || "").trim() || null;
  if (schoolId) {
    const taken = await runWithTenant(school.id, () => prisma.user.findFirst({ where: { schoolId } }));
    if (taken) return res.status(409).json({ error: "Staff ID already registered at this school" });
  }

  const passwordHash = await hashPassword(password);
  const user = await runWithTenant(school.id, () =>
    prisma.user.create({
      data: {
        name,
        email: email.value,
        schoolId,
        passwordHash,
        role: "PRINCIPAL",
        status: "ACTIVE",
        mustChangePassword: true,
      },
    })
  );
  await logActivity({
    actorId: req.user.userId,
    action: "USER_CREATED",
    summary: `Created principal ${user.name} for ${school.name}`,
    tenantId: school.id,
    meta: { userId: user.id, userName: user.name, role: "PRINCIPAL", schoolId: school.id },
  });
  res.status(201).json({
    user: publicUser(user),
    generatedPassword,
    message: generatedPassword
      ? "Principal created. Share the generated password once — it will not be shown again."
      : "Principal created. They must change their password on first sign-in.",
  });
});

platformRouter.post("/schools/:id/users/:userId/reset-password", async (req, res) => {
  const school = await loadSchool(req.params.id);
  if (!school) return res.status(404).json({ error: "School not found" });
  const user = await prisma.user.findFirst({
    where: { id: req.params.userId, tenantId: school.id },
  });
  if (!user) return res.status(404).json({ error: "Staff account not found" });

  let password = String(req.body?.password || "");
  let generatedPassword = null;
  if (!password) {
    generatedPassword = tempPassword();
    password = generatedPassword;
  }
  {
    const policyError = validatePasswordPolicy(password);
    if (policyError) return res.status(400).json({ error: policyError });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
  });
  await revokeAllRefreshSessions(user.id);
  await logActivity({
    actorId: req.user.userId,
    action: "USER_PASSWORD_RESET",
    summary: `Reset password for ${user.name} (${school.name})`,
    tenantId: school.id,
    meta: { userId: user.id, userName: user.name, role: user.role, schoolId: school.id },
  });
  res.json({
    ok: true,
    generatedPassword,
    message: generatedPassword
      ? "Password reset. Share the generated password once — it will not be shown again."
      : "Password reset. The user must change it on next sign-in.",
  });
});

platformRouter.get("/schools/:id/data", async (req, res) => {
  const school = await loadSchool(req.params.id);
  if (!school) return res.status(404).json({ error: "School not found" });
  const counts = await schoolDataCounts(school.id);
  res.json({
    school: publicSchool(school),
    catalog: listSchoolDataCategories(),
    ...counts,
  });
});

platformRouter.post("/schools/:id/data/delete", async (req, res) => {
  const school = await loadSchool(req.params.id);
  if (!school) return res.status(404).json({ error: "School not found" });

  const body = req.body || {};
  const categories = Array.isArray(body.categories) ? body.categories.map(String) : [];
  const complete = body.complete === true;
  const deleteSchool = body.deleteSchool === true;
  const keepPrincipals = body.keepPrincipals !== false;
  const restoreDefaultPeriods = body.restoreDefaultPeriods === true;

  try {
    const result = await deleteSchoolData(school.id, {
      categories,
      complete,
      deleteSchool,
      keepPrincipals,
      restoreDefaultPeriods,
      confirmSlug: body.confirmSlug,
      confirmName: body.confirmName,
    });

    if (!result.schoolDeleted) {
      await logActivity({
        actorId: req.user.userId,
        action: "SCHOOL_DATA_DELETED",
        summary: `Deleted ${result.totalRows} row(s) of data for ${school.name}`,
        tenantId: school.id,
        meta: {
          schoolId: school.id,
          slug: school.slug,
          categories: result.categories,
          deleted: result.deleted,
          totalRows: result.totalRows,
          keepPrincipals: result.keepPrincipals,
        },
      });
    }
    // Permanent school removal cascades ActivityAudit rows for that tenant, so we
    // do not write a SCHOOL_DELETED audit that would immediately disappear.

    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("School data delete failed", err);
    res.status(status).json({ error: err.message || "Could not delete school data" });
  }
});

platformRouter.post("/backup", async (req, res) => {
  const schoolId = req.body?.schoolId || req.query.schoolId || null;
  const backup = await createBackup({ schoolId: schoolId || null });
  await logActivity({
    actorId: req.user.userId,
    action: "BACKUP_CREATED",
    summary: schoolId ? `Exported backup for school ${schoolId}` : "Exported full platform backup",
    tenantId: schoolId || undefined,
    meta: { schoolCount: backup.schoolCount },
  });
  res.json(backup);
});

platformRouter.post("/backup/restore", async (req, res) => {
  const { schoolId, document, mode } = req.body || {};
  const result = await restoreBackup(document, { schoolId, mode: mode || "merge" });
  await logActivity({
    actorId: req.user.userId,
    action: "BACKUP_RESTORED",
    summary: `Restored backup into school ${schoolId}`,
    tenantId: schoolId,
    meta: result,
  });
  res.json(result);
});

platformRouter.post("/digests/run", async (req, res) => {
  const flush = req.body?.flush !== false;
  const result = await runSchoolDigests({ flush });
  res.json(result);
});

platformRouter.post("/mail/flush", async (_req, res) => {
  const result = await flushEmailOutbox();
  res.json(result);
});

platformRouter.get("/health/deep", async (_req, res) => {
  const payload = await buildHealthPayload({
    deep: true,
    includeOps: true,
    includeSchema: true,
  });
  res.status(payload.ok ? 200 : 503).json(payload);
});
