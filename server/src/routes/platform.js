import { randomBytes } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
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

export const platformRouter = Router();
platformRouter.use(auth);
platformRouter.use(requirePlatformAdmin());

function optionalTrim(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : null;
}

async function schoolStats(schoolId) {
  const [staffCount, principalCount, studentCount, classCount, examCount, pendingStaff] = await Promise.all([
    prisma.user.count({ where: { tenantId: schoolId } }),
    prisma.user.count({ where: { tenantId: schoolId, role: "PRINCIPAL", status: "ACTIVE" } }),
    prisma.student.count({ where: { tenantId: schoolId, status: "ACTIVE" } }),
    prisma.classSection.count({ where: { tenantId: schoolId } }),
    prisma.exam.count({ where: { tenantId: schoolId } }),
    prisma.user.count({ where: { tenantId: schoolId, status: "PENDING" } }),
  ]);
  return { staffCount, principalCount, studentCount, classCount, examCount, pendingStaff };
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
  const withCounts = await Promise.all(
    recent.map(async (school) => ({
      ...publicSchool(school),
      ...(await schoolStats(school.id)),
    }))
  );
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
  const paging = parsePageQuery(req.query);
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
    const items = await Promise.all(
      schools.map(async (school) => ({ ...publicSchool(school), ...(await schoolStats(school.id)) }))
    );
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
  const items = await Promise.all(
    schools.map(async (school) => ({ ...publicSchool(school), ...(await schoolStats(school.id)) }))
  );
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
  if (password.length < 8) {
    return res.status(400).json({ error: "Principal password must be at least 8 characters" });
  }

  const principalSchoolId = String(req.body?.principalSchoolId || "").trim() || null;
  const joinCode = await allocateJoinCode();
  const passwordHash = await bcrypt.hash(password, 10);

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
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const schoolId = String(req.body?.schoolId || "").trim() || null;
  if (schoolId) {
    const taken = await runWithTenant(school.id, () => prisma.user.findFirst({ where: { schoolId } }));
    if (taken) return res.status(409).json({ error: "Staff ID already registered at this school" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
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
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: true,
    },
  });
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
