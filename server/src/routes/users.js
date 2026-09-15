import { Router } from "express";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { auth, publicUser, requireRole, requireFeature } from "../middleware/auth.js";
import { parseEmail } from "../lib/numbers.js";
import { logActivity } from "../lib/activityAudit.js";
import { pageResult, parsePageQuery } from "../lib/pagination.js";
import { requireSchoolTenant, runWithoutTenant } from "../lib/tenant.js";
import { getSchoolLetterhead } from "../lib/school.js";
import { writeExcelLetterhead } from "../lib/letterhead.js";
import { parseSpreadsheet } from "../lib/upload.js";
import {
  STAFF_IMPORT_HEADERS,
  generateStaffTempPassword,
  mapStaffImportRows,
} from "../lib/staffImport.js";
import { invalidatePeriodsCache } from "../lib/periods.js";
import {
  addCustomStaffRole,
  listStaffRoles,
  parseNewStaffRole,
  resolveAssignedRole,
} from "../lib/staffRoles.js";
import {
  FEATURE_CATALOG,
  effectiveFeatureMap,
  normalizeRoleFeatureAccess,
  patchRoleFeatures,
} from "../lib/roleFeatures.js";

export const usersRouter = Router();
usersRouter.use(auth);
usersRouter.use(requireSchoolTenant);
usersRouter.use(requireFeature("staff"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function getSchoolRoleAccessConfig(tenantId) {
  if (!tenantId) return { customStaffRoles: [], roleFeatureAccess: {} };
  const school = await prisma.school.findUnique({
    where: { id: tenantId },
    select: { customStaffRoles: true, roleFeatureAccess: true },
  });
  return {
    customStaffRoles: school?.customStaffRoles || [],
    roleFeatureAccess: normalizeRoleFeatureAccess(school?.roleFeatureAccess),
  };
}

async function getSchoolCustomStaffRoles(tenantId) {
  const cfg = await getSchoolRoleAccessConfig(tenantId);
  return cfg.customStaffRoles;
}

function usersOrderBy(sort) {
  switch (String(sort || "")) {
    case "name_desc":
      return [{ name: "desc" }];
    case "role":
      return [{ role: "asc" }, { name: "asc" }];
    case "status":
      return [{ status: "asc" }, { name: "asc" }];
    case "name":
    case "name_asc":
      return [{ name: "asc" }];
    default:
      return [{ status: "asc" }, { name: "asc" }];
  }
}

usersRouter.get("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const status = req.query.status;
  const role = req.query.role;
  const where = {
    ...(status ? { status } : {}),
    ...(role ? { role } : {}),
  };
  const paging = parsePageQuery(req.query);
  if (paging.q) {
    where.OR = [
      { name: { contains: paging.q, mode: "insensitive" } },
      { email: { contains: paging.q, mode: "insensitive" } },
      { schoolId: { contains: paging.q, mode: "insensitive" } },
    ];
  }

  const include = {
    assignments: { include: { classSection: true, subject: true } },
  };
  const orderBy = usersOrderBy(req.query.sort);

  if (!paging.paged) {
    const users = await prisma.user.findMany({ where, orderBy, include });
    return res.json(
      users.map((row) => ({
        ...publicUser(row),
        createdAt: row.createdAt,
        assignments: row.assignments,
      }))
    );
  }

  const [total, users, summary] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      include,
      skip: paging.skip,
      take: paging.take,
    }),
    Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "PENDING" } }),
    ]).then(([all, active, pending]) => ({ total: all, active, pending })),
  ]);
  const items = users.map((row) => ({
    ...publicUser(row),
    createdAt: row.createdAt,
    assignments: row.assignments,
  }));
  res.json({
    ...pageResult({ items, total, page: paging.page, pageSize: paging.pageSize }),
    summary,
  });
});

usersRouter.get("/staff-roles", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { customStaffRoles, roleFeatureAccess } = await getSchoolRoleAccessConfig(req.user.tenantId);
  const roles = listStaffRoles(customStaffRoles, {
    includeCoordinator: req.user.role === "PRINCIPAL",
  }).map((role) => {
    const baseRole = role.baseRole || (role.id === "EXAM_COORDINATOR" ? "EXAM_COORDINATOR" : "TEACHER");
    const features = effectiveFeatureMap(role.id, roleFeatureAccess, { baseRole });
    return { ...role, features, baseRole };
  });
  res.json({
    roles,
    features: FEATURE_CATALOG,
    roleFeatureAccess,
    canAddRoles: req.user.role === "PRINCIPAL",
    canManageAccess: req.user.role === "PRINCIPAL",
  });
});

usersRouter.put("/staff-roles/:roleId/features", requireRole("PRINCIPAL"), async (req, res) => {
  const roleId = String(req.params.roleId || "").trim();
  if (!roleId) return res.status(400).json({ error: "Role is required" });

  const school = await prisma.school.findUnique({
    where: { id: req.user.tenantId },
    select: { id: true, customStaffRoles: true, roleFeatureAccess: true },
  });
  if (!school) return res.status(404).json({ error: "School not found" });

  const listed = listStaffRoles(school.customStaffRoles, { includeCoordinator: true });
  const role = listed.find((r) => r.id === roleId);
  if (!role) return res.status(404).json({ error: "Unknown role" });
  if (roleId === "PRINCIPAL") {
    return res.status(400).json({ error: "Principal access cannot be changed" });
  }

  const baseRole = role.baseRole || (roleId === "EXAM_COORDINATOR" ? "EXAM_COORDINATOR" : "TEACHER");
  const patched = patchRoleFeatures(school.roleFeatureAccess, roleId, req.body?.features || req.body || {}, {
    baseRole,
  });
  if (patched.error) return res.status(400).json({ error: patched.error });

  await prisma.school.update({
    where: { id: school.id },
    data: { roleFeatureAccess: patched.access },
  });

  await logActivity({
    actorId: req.user.userId,
    action: "SCHOOL_UPDATED",
    summary: `Updated feature access for role “${role.name}”`,
    meta: { staffRoleId: roleId, staffRoleName: role.name, features: patched.features },
  });

  const roles = listed.map((r) => {
    const br = r.baseRole || (r.id === "EXAM_COORDINATOR" ? "EXAM_COORDINATOR" : "TEACHER");
    return {
      ...r,
      baseRole: br,
      features: effectiveFeatureMap(r.id, patched.access, { baseRole: br }),
    };
  });

  res.json({
    role: {
      ...role,
      baseRole,
      features: patched.features,
    },
    roles,
    roleFeatureAccess: patched.access,
    features: FEATURE_CATALOG,
  });
});

usersRouter.post("/staff-roles", requireRole("PRINCIPAL"), async (req, res) => {
  const parsed = parseNewStaffRole(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const school = await prisma.school.findUnique({
    where: { id: req.user.tenantId },
    select: { id: true, customStaffRoles: true, roleFeatureAccess: true },
  });
  if (!school) return res.status(404).json({ error: "School not found" });

  // Coordinators creating roles is blocked by requireRole; still clamp baseRole for safety.
  const roleToAdd =
    parsed.role.baseRole === "EXAM_COORDINATOR"
      ? parsed.role
      : { ...parsed.role, baseRole: "TEACHER" };

  const next = addCustomStaffRole(school.customStaffRoles, roleToAdd);
  if (next.error) return res.status(409).json({ error: next.error });

  await prisma.school.update({
    where: { id: school.id },
    data: { customStaffRoles: next.roles },
  });

  await logActivity({
    actorId: req.user.userId,
    action: "SCHOOL_UPDATED",
    summary: `Added staff role “${roleToAdd.name}”`,
    meta: { staffRoleId: roleToAdd.id, staffRoleName: roleToAdd.name, baseRole: roleToAdd.baseRole },
  });

  const roleFeatureAccess = normalizeRoleFeatureAccess(school.roleFeatureAccess);

  res.status(201).json({
    role: {
      ...roleToAdd,
      system: false,
      features: effectiveFeatureMap(roleToAdd.id, roleFeatureAccess, { baseRole: roleToAdd.baseRole }),
    },
    roles: listStaffRoles(next.roles, { includeCoordinator: true }).map((role) => {
      const baseRole = role.baseRole || (role.id === "EXAM_COORDINATOR" ? "EXAM_COORDINATOR" : "TEACHER");
      return {
        ...role,
        baseRole,
        features: effectiveFeatureMap(role.id, roleFeatureAccess, { baseRole }),
      };
    }),
  });
});


usersRouter.get("/template", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const letterhead = await getSchoolLetterhead();
  workbook.creator = letterhead.name;
  const sheet = workbook.addWorksheet("Staff");
  writeExcelLetterhead(workbook, sheet, letterhead, STAFF_IMPORT_HEADERS.length);
  const headerRow = sheet.addRow(STAFF_IMPORT_HEADERS);
  headerRow.font = { bold: true };
  sheet.pageSetup.printTitlesRow = `1:${headerRow.number}`;
  sheet.addRow(["Ramesh Chandra", "ramesh@school.edu", "SCH-T06", "password123", "TEACHER"]);
  sheet.columns.forEach((col) => {
    col.width = 18;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="staff-import-template.xlsx"');
  res.send(Buffer.from(buffer));
});

usersRouter.post(
  "/upload",
  requireRole("PRINCIPAL", "EXAM_COORDINATOR"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "File is required" });

    let spreadsheetRows;
    try {
      spreadsheetRows = await parseSpreadsheet(req.file.buffer, req.file.originalname);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message || "Could not parse file" });
    }

    const mapped = mapStaffImportRows(spreadsheetRows, {
      generatePassword: generateStaffTempPassword,
    });
    if (mapped.error) return res.status(400).json({ error: mapped.error });

    const errors = [...mapped.errors];
    let created = 0;
    const canCreateCoordinator = req.user.role === "PRINCIPAL";

    for (const item of mapped.rows) {
      let chosenRole = item.role;
      if (chosenRole === "EXAM_COORDINATOR" && !canCreateCoordinator) {
        chosenRole = "TEACHER";
      }

      if (item.email) {
        const exists = await runWithoutTenant(() =>
          prisma.user.findUnique({ where: { email: item.email } })
        );
        if (exists) {
          errors.push({ row: item.row, error: "Email already registered" });
          continue;
        }
      }
      if (item.schoolId) {
        const exists = await prisma.user.findFirst({ where: { schoolId: item.schoolId } });
        if (exists) {
          errors.push({ row: item.row, error: "School ID already registered" });
          continue;
        }
      }

      try {
        const user = await prisma.user.create({
          data: {
            name: item.name,
            email: item.email,
            schoolId: item.schoolId,
            passwordHash: await bcrypt.hash(item.password, 10),
            role: chosenRole,
            status: "ACTIVE",
            mustChangePassword: true,
          },
        });
        created += 1;
        await logActivity({
          actorId: req.user.userId,
          action: "USER_CREATED",
          summary: `Created ${chosenRole === "EXAM_COORDINATOR" ? "exam coordinator" : "teacher"} account for ${user.name}`,
          meta: {
            userId: user.id,
            userName: user.name,
            role: user.role,
            status: user.status,
            source: "bulk_import",
          },
        });
      } catch (err) {
        errors.push({ row: item.row, error: err.message || "Could not create account" });
      }
    }

    res.json({
      created,
      errors: errors.map((e) =>
        e.row != null ? `Row ${e.row}: ${e.error}` : e.error || String(e)
      ),
    });
  }
);

usersRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, email, schoolId, password, status, assignments } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!email && !schoolId) {
    return res.status(400).json({ error: "Provide an email or school ID" });
  }
  if (email) {
    const parsedEmail = parseEmail(email, { required: true });
    if (parsedEmail.error) return res.status(400).json({ error: parsedEmail.error });
  }

  const customRoles = await getSchoolCustomStaffRoles(req.user.tenantId);
  const canAssignCoordinator = req.user.role === "PRINCIPAL";
  const body = req.body || {};
  const resolved = resolveAssignedRole(
    body.customRoleId
      ? { customRoleId: body.customRoleId }
      : { role: body.role || "TEACHER", roleTitle: body.roleTitle ?? null },
    customRoles,
    { canAssignCoordinator }
  );
  if (resolved.error) {
    const statusCode = /only the principal/i.test(resolved.error) ? 403 : 400;
    return res.status(statusCode).json({ error: resolved.error });
  }
  if (resolved.role === "PRINCIPAL") {
    return res.status(403).json({ error: "Principal accounts cannot be created here" });
  }
  const chosenRole = resolved.role;
  const roleTitle = resolved.roleTitle;

  if (email) {
    const exists = await runWithoutTenant(() => prisma.user.findUnique({ where: { email } }));
    if (exists) return res.status(409).json({ error: "Email already registered" });
  }
  if (schoolId) {
    const exists = await prisma.user.findFirst({ where: { schoolId } });
    if (exists) return res.status(409).json({ error: "School ID already registered" });
  }

  const chosenStatus = status === "PENDING" || status === "REJECTED" ? status : "ACTIVE";

  const user = await prisma.user.create({
    data: {
      name,
      email: email || null,
      schoolId: schoolId || null,
      passwordHash: await bcrypt.hash(password, 10),
      role: chosenRole,
      roleTitle,
      status: chosenStatus,
      mustChangePassword: true,
    },
  });

  if (Array.isArray(assignments) && assignments.length) {
    await prisma.teacherAssignment.createMany({
      data: assignments.map((a) => ({
        userId: user.id,
        classSectionId: a.classSectionId,
        subjectId: a.subjectId,
      })),
      skipDuplicates: true,
    });
  }

  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    include: { assignments: { include: { classSection: true, subject: true } } },
  });
  await logActivity({
    actorId: req.user.userId,
    action: "USER_CREATED",
    summary: `Created ${roleTitle || (chosenRole === "EXAM_COORDINATOR" ? "exam coordinator" : "teacher")} account for ${fresh.name}`,
    meta: {
      userId: fresh.id,
      userName: fresh.name,
      role: fresh.role,
      roleTitle: fresh.roleTitle || null,
      status: fresh.status,
    },
  });
  res.status(201).json({ ...publicUser(fresh), assignments: fresh.assignments });
});

usersRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { status, role, customRoleId, roleTitle, assignments, name, email, schoolId } = req.body || {};
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.role === "PLATFORM_ADMIN") {
    return res.status(403).json({ error: "Platform admin accounts cannot be edited here" });
  }

  if (req.user.role === "EXAM_COORDINATOR" && existing.role !== "TEACHER") {
    return res.status(403).json({ error: "Only the principal can edit leadership accounts" });
  }

  const roleTouched = role !== undefined || customRoleId !== undefined || roleTitle !== undefined;
  let resolvedRole = null;
  if (roleTouched) {
    const customRoles = await getSchoolCustomStaffRoles(req.user.tenantId);
    const canAssignCoordinator = req.user.role === "PRINCIPAL";
    const payload = {};
    if (customRoleId) {
      payload.customRoleId = customRoleId;
    } else if (role !== undefined) {
      payload.role = role;
      // Switching via system role clears a previous custom title unless explicitly set.
      payload.roleTitle = roleTitle !== undefined ? roleTitle : null;
    } else {
      payload.role = existing.role;
      payload.roleTitle = roleTitle;
    }
    const resolved = resolveAssignedRole(payload, customRoles, { canAssignCoordinator });
    if (resolved.error) {
      const statusCode = /only the principal/i.test(resolved.error) ? 403 : 400;
      return res.status(statusCode).json({ error: resolved.error });
    }
    resolvedRole = resolved;
  }

  if (resolvedRole?.role === "PRINCIPAL" && req.user.role !== "PRINCIPAL") {
    return res.status(403).json({ error: "Only a principal can assign the principal role" });
  }
  if (
    req.user.role === "EXAM_COORDINATOR" &&
    resolvedRole &&
    (resolvedRole.role === "EXAM_COORDINATOR" || resolvedRole.role === "PRINCIPAL")
  ) {
    return res.status(403).json({ error: "Only the principal can change leadership roles" });
  }
  if (existing.role === "PRINCIPAL" && resolvedRole && resolvedRole.role !== "PRINCIPAL") {
    const otherPrincipals = await prisma.user.count({
      where: { role: "PRINCIPAL", status: "ACTIVE", id: { not: existing.id } },
    });
    if (otherPrincipals === 0) {
      return res.status(400).json({ error: "Cannot demote the only active principal" });
    }
  }

  const data = {};
  if (status && ["PENDING", "ACTIVE", "REJECTED"].includes(status)) data.status = status;
  if (resolvedRole) {
    data.role = resolvedRole.role;
    data.roleTitle = resolvedRole.roleTitle;
  }

  const profileTouched =
    name !== undefined || email !== undefined || schoolId !== undefined;
  if (profileTouched) {
    const nextName = name !== undefined ? String(name).trim() : existing.name;
    if (!nextName) return res.status(400).json({ error: "Name is required" });

    let nextEmail = existing.email;
    if (email !== undefined) {
      const raw = email == null ? "" : String(email).trim();
      if (!raw) {
        nextEmail = null;
      } else {
        const parsedEmail = parseEmail(raw, { required: true });
        if (parsedEmail.error) return res.status(400).json({ error: parsedEmail.error });
        nextEmail = parsedEmail.value || raw;
      }
    }

    let nextSchoolId = existing.schoolId;
    if (schoolId !== undefined) {
      const raw = schoolId == null ? "" : String(schoolId).trim();
      nextSchoolId = raw || null;
    }

    if (!nextEmail && !nextSchoolId) {
      return res.status(400).json({ error: "Provide an email or school ID" });
    }

    if (nextEmail && nextEmail !== existing.email) {
      const clash = await runWithoutTenant(() =>
        prisma.user.findUnique({ where: { email: nextEmail } })
      );
      if (clash && clash.id !== existing.id) {
        return res.status(409).json({ error: "Email already registered" });
      }
    }
    if (nextSchoolId && nextSchoolId !== existing.schoolId) {
      const clash = await prisma.user.findFirst({ where: { schoolId: nextSchoolId } });
      if (clash && clash.id !== existing.id) {
        return res.status(409).json({ error: "School ID already registered" });
      }
    }

    data.name = nextName;
    data.email = nextEmail;
    data.schoolId = nextSchoolId;
  }

  const user = Object.keys(data).length
    ? await prisma.user.update({ where: { id: req.params.id }, data })
    : existing;

  if (Array.isArray(assignments)) {
    await prisma.teacherAssignment.deleteMany({ where: { userId: user.id } });
    if (assignments.length) {
      await prisma.teacherAssignment.createMany({
        data: assignments.map((a) => ({
          userId: user.id,
          classSectionId: a.classSectionId,
          subjectId: a.subjectId,
        })),
        skipDuplicates: true,
      });
    }
  }

  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    include: { assignments: { include: { classSection: true, subject: true } } },
  });
  if (data.status && data.status !== existing.status) {
    await logActivity({
      actorId: req.user.userId,
      action: "USER_STATUS_CHANGED",
      summary: `${existing.name}: ${existing.status} → ${data.status}`,
      meta: {
        userId: existing.id,
        userName: existing.name,
        role: fresh.role,
        from: existing.status,
        to: data.status,
      },
    });
  }
  if (data.role && data.role !== existing.role) {
    await logActivity({
      actorId: req.user.userId,
      action: "USER_ROLE_CHANGED",
      summary: `${existing.name}: ${existing.role} → ${data.role}`,
      meta: {
        userId: existing.id,
        userName: existing.name,
        from: existing.role,
        to: data.role,
      },
    });
  }
  const profileChanged =
    (data.name && data.name !== existing.name) ||
    (email !== undefined && data.email !== existing.email) ||
    (schoolId !== undefined && data.schoolId !== existing.schoolId);
  if (profileChanged) {
    await logActivity({
      actorId: req.user.userId,
      action: "USER_UPDATED",
      summary: `Updated staff profile for ${fresh.name}`,
      meta: {
        userId: existing.id,
        userName: fresh.name,
        role: fresh.role,
        changes: {
          ...(data.name && data.name !== existing.name ? { name: { from: existing.name, to: data.name } } : {}),
          ...(email !== undefined && data.email !== existing.email
            ? { email: { from: existing.email, to: data.email } }
            : {}),
          ...(schoolId !== undefined && data.schoolId !== existing.schoolId
            ? { schoolId: { from: existing.schoolId, to: data.schoolId } }
            : {}),
        },
      },
    });
  }
  res.json({ ...publicUser(fresh), assignments: fresh.assignments });
});

usersRouter.delete("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.id === req.user.userId) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }
  if (existing.role === "PLATFORM_ADMIN") {
    return res.status(403).json({ error: "Platform admin accounts cannot be deleted here" });
  }
  if (req.user.role === "EXAM_COORDINATOR" && existing.role !== "TEACHER") {
    return res.status(403).json({ error: "Only the principal can delete leadership accounts" });
  }
  if (existing.role === "PRINCIPAL") {
    const otherPrincipals = await prisma.user.count({
      where: { role: "PRINCIPAL", status: "ACTIVE", id: { not: existing.id } },
    });
    if (otherPrincipals === 0) {
      return res.status(400).json({ error: "Cannot delete the only active principal" });
    }
  }

  if (existing.role === "TEACHER") {
    const assignmentCount = await prisma.teacherAssignment.count({ where: { userId: existing.id } });
    if (assignmentCount > 0) {
      return res.status(409).json({
        error: "Transfer or remove classroom assignments before deleting this teacher",
        code: "HAS_ASSIGNMENTS",
        assignmentCount,
      });
    }
  }

  const actorId = req.user.userId;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.classSection.updateMany({
        where: { classTeacherId: existing.id },
        data: { classTeacherId: null },
      });
      await tx.exam.updateMany({
        where: { consolidationLockedById: existing.id },
        data: { consolidationLockedById: null },
      });
      await tx.markEntryAccessRequest.updateMany({
        where: { reviewedById: existing.id },
        data: { reviewedById: null },
      });
      await tx.mark.updateMany({
        where: { enteredById: existing.id },
        data: { enteredById: actorId },
      });
      await tx.markAudit.updateMany({
        where: { changedById: existing.id },
        data: { changedById: actorId },
      });
      await tx.activityAudit.updateMany({
        where: { actorId: existing.id },
        data: { actorId },
      });
      await tx.user.delete({ where: { id: existing.id } });
    });
  } catch (err) {
    console.error("Failed to delete staff user", err);
    return res.status(409).json({
      error: "Could not delete this staff account because related records still reference it",
    });
  }

  await logActivity({
    actorId,
    action: "USER_DELETED",
    summary: `Deleted staff account for ${existing.name}`,
    meta: {
      userId: existing.id,
      userName: existing.name,
      role: existing.role,
      status: existing.status,
    },
  });
  res.json({ ok: true });
});

usersRouter.post("/:id/clear-classes", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.role !== "TEACHER") {
    return res.status(400).json({ error: "Only teachers have classroom assignments to clear" });
  }

  const [assignmentCount, timetableCount, classTeacherCount] = await Promise.all([
    prisma.teacherAssignment.count({ where: { userId: existing.id } }),
    prisma.timetableEntry.count({ where: { teacherId: existing.id } }),
    prisma.classSection.count({ where: { classTeacherId: existing.id } }),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.teacherAssignment.deleteMany({ where: { userId: existing.id } });
    await tx.timetableEntry.deleteMany({ where: { teacherId: existing.id } });
    await tx.classSection.updateMany({
      where: { classTeacherId: existing.id },
      data: { classTeacherId: null },
    });
  });

  if (timetableCount) invalidatePeriodsCache();

  await logActivity({
    actorId: req.user.userId,
    action: "USER_UPDATED",
    summary: `Cleared classroom load for ${existing.name}`,
    meta: {
      userId: existing.id,
      userName: existing.name,
      assignmentsCleared: assignmentCount,
      timetableCleared: timetableCount,
      classTeacherCleared: classTeacherCount,
    },
  });

  const fresh = await prisma.user.findUnique({
    where: { id: existing.id },
    include: { assignments: { include: { classSection: true, subject: true } } },
  });
  res.json({
    ok: true,
    assignmentsCleared: assignmentCount,
    timetableCleared: timetableCount,
    classTeacherCleared: classTeacherCount,
    user: { ...publicUser(fresh), assignments: fresh.assignments },
  });
});

usersRouter.post("/:id/transfer", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const fromId = req.params.id;
  const toUserId = String(req.body?.toUserId || "").trim();
  const includeTimetable = req.body?.includeTimetable !== false;
  const includeClassTeacher = req.body?.includeClassTeacher !== false;

  if (!toUserId) return res.status(400).json({ error: "Choose a teacher to transfer to" });
  if (toUserId === fromId) {
    return res.status(400).json({ error: "Choose a different teacher as the replacement" });
  }

  const [fromUser, toUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: fromId },
      include: { assignments: true },
    }),
    prisma.user.findUnique({ where: { id: toUserId } }),
  ]);
  if (!fromUser) return res.status(404).json({ error: "Source teacher not found" });
  if (!toUser) return res.status(404).json({ error: "Replacement teacher not found" });
  if (fromUser.role !== "TEACHER" || toUser.role !== "TEACHER") {
    return res.status(400).json({ error: "Class transfers are only supported between teachers" });
  }
  if (toUser.status !== "ACTIVE") {
    return res.status(400).json({ error: "Replacement teacher must be an active account" });
  }

  const sourceAssignments = fromUser.assignments || [];
  const [timetableCount, classTeacherCount] = await Promise.all([
    includeTimetable
      ? prisma.timetableEntry.count({ where: { teacherId: fromId } })
      : Promise.resolve(0),
    includeClassTeacher
      ? prisma.classSection.count({ where: { classTeacherId: fromId } })
      : Promise.resolve(0),
  ]);

  if (!sourceAssignments.length && !timetableCount && !classTeacherCount) {
    return res.status(400).json({
      error: "This teacher has no classroom papers, timetable slots, or class-teacher roles to transfer",
    });
  }

  let assignmentsMoved = 0;
  let assignmentsSkipped = 0;
  let timetableMoved = 0;
  let timetableSkipped = 0;
  let classTeacherMoved = 0;

  try {
    await prisma.$transaction(async (tx) => {
      const tenantId = fromUser.tenantId || toUser.tenantId || req.user.tenantId;
      if (!tenantId) {
        throw Object.assign(new Error("Missing school tenant for transfer"), { status: 400 });
      }

      const targetExisting = await tx.teacherAssignment.findMany({
        where: { userId: toUserId },
        select: { classSectionId: true, subjectId: true },
      });
      const targetKeys = new Set(targetExisting.map((a) => `${a.classSectionId}:${a.subjectId}`));

      const toCreate = [];
      for (const row of sourceAssignments) {
        const key = `${row.classSectionId}:${row.subjectId}`;
        if (targetKeys.has(key)) {
          assignmentsSkipped += 1;
        } else {
          toCreate.push({
            tenantId,
            userId: toUserId,
            classSectionId: row.classSectionId,
            subjectId: row.subjectId,
          });
          targetKeys.add(key);
        }
      }
      if (toCreate.length) {
        await tx.teacherAssignment.createMany({ data: toCreate, skipDuplicates: true });
        assignmentsMoved = toCreate.length;
      }
      if (sourceAssignments.length) {
        await tx.teacherAssignment.deleteMany({ where: { userId: fromId } });
      }

      if (includeTimetable) {
        const entries = await tx.timetableEntry.findMany({ where: { teacherId: fromId } });
        for (const entry of entries) {
          const clash = await tx.timetableEntry.findFirst({
            where: {
              teacherId: toUserId,
              dayOfWeek: entry.dayOfWeek,
              periodId: entry.periodId,
              classSectionId: entry.classSectionId,
            },
          });
          if (clash) {
            await tx.timetableEntry.delete({ where: { id: entry.id } });
            timetableSkipped += 1;
            continue;
          }
          try {
            await tx.timetableEntry.update({
              where: { id: entry.id },
              data: { teacherId: toUserId },
            });
            timetableMoved += 1;
          } catch (err) {
            if (err.code === "P2002") {
              await tx.timetableEntry.delete({ where: { id: entry.id } });
              timetableSkipped += 1;
            } else {
              throw err;
            }
          }
        }
      }

      if (includeClassTeacher) {
        const updated = await tx.classSection.updateMany({
          where: { classTeacherId: fromId },
          data: { classTeacherId: toUserId },
        });
        classTeacherMoved = updated.count || 0;
      }

      // Pending late-entry / edit requests for papers that moved should follow the replacement.
      const pending = await tx.markEntryAccessRequest.findMany({
        where: { teacherId: fromId, status: "PENDING" },
      });
      for (const reqRow of pending) {
        const clash = await tx.markEntryAccessRequest.findFirst({
          where: {
            examId: reqRow.examId,
            teacherId: toUserId,
            classSectionId: reqRow.classSectionId,
            subjectId: reqRow.subjectId,
          },
        });
        if (clash) {
          await tx.markEntryAccessRequest.delete({ where: { id: reqRow.id } });
          continue;
        }
        await tx.markEntryAccessRequest.update({
          where: { id: reqRow.id },
          data: { teacherId: toUserId },
        });
      }
    });
  } catch (err) {
    console.error("Failed to transfer teacher assignments", err);
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "Could not transfer because the replacement already has conflicting timetable slots",
      });
    }
    return res.status(409).json({ error: "Could not transfer classroom assignments" });
  }

  if (includeTimetable && (timetableMoved || timetableSkipped)) {
    invalidatePeriodsCache();
  }

  await logActivity({
    actorId: req.user.userId,
    action: "USER_ASSIGNMENTS_TRANSFERRED",
    summary: `Transferred classes from ${fromUser.name} to ${toUser.name}`,
    meta: {
      fromUserId: fromUser.id,
      fromUserName: fromUser.name,
      toUserId: toUser.id,
      toUserName: toUser.name,
      assignmentsMoved,
      assignmentsSkipped,
      timetableMoved,
      timetableSkipped,
      classTeacherMoved,
      includeTimetable,
      includeClassTeacher,
    },
  });

  const [fromFresh, toFresh] = await Promise.all([
    prisma.user.findUnique({
      where: { id: fromId },
      include: { assignments: { include: { classSection: true, subject: true } } },
    }),
    prisma.user.findUnique({
      where: { id: toUserId },
      include: { assignments: { include: { classSection: true, subject: true } } },
    }),
  ]);

  res.json({
    ok: true,
    assignmentsMoved,
    assignmentsSkipped,
    timetableMoved,
    timetableSkipped,
    classTeacherMoved,
    from: { ...publicUser(fromFresh), assignments: fromFresh.assignments },
    to: { ...publicUser(toFresh), assignments: toFresh.assignments },
  });
});

usersRouter.post("/:id/reset-password", requireRole("PRINCIPAL"), async (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      passwordHash: await bcrypt.hash(String(password), 10),
      mustChangePassword: true,
    },
  });
  await logActivity({
    actorId: req.user.userId,
    action: "USER_PASSWORD_RESET",
    summary: `Reset password for ${existing.name}`,
    meta: { userId: existing.id, userName: existing.name, role: existing.role },
  });
  res.json({ ok: true, message: "Password reset" });
});
