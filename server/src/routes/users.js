import { Router } from "express";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { auth, publicUser, requireRole } from "../middleware/auth.js";
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

export const usersRouter = Router();
usersRouter.use(auth);
usersRouter.use(requireSchoolTenant);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
  const { name, email, schoolId, password, role, status, assignments } = req.body || {};
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

  let chosenRole = ["TEACHER", "EXAM_COORDINATOR", "PRINCIPAL"].includes(role) ? role : "TEACHER";
  if (req.user.role === "EXAM_COORDINATOR" && chosenRole !== "TEACHER") {
    return res.status(403).json({ error: "Only the principal can add an exam coordinator" });
  }
  if (chosenRole === "PRINCIPAL") {
    return res.status(403).json({ error: "Principal accounts cannot be created here" });
  }

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
    summary: `Created ${chosenRole === "EXAM_COORDINATOR" ? "exam coordinator" : "teacher"} account for ${fresh.name}`,
    meta: {
      userId: fresh.id,
      userName: fresh.name,
      role: fresh.role,
      status: fresh.status,
    },
  });
  res.status(201).json({ ...publicUser(fresh), assignments: fresh.assignments });
});

usersRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { status, role, assignments, name, email, schoolId } = req.body || {};
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.role === "PLATFORM_ADMIN") {
    return res.status(403).json({ error: "Platform admin accounts cannot be edited here" });
  }

  if (req.user.role === "EXAM_COORDINATOR" && existing.role !== "TEACHER") {
    return res.status(403).json({ error: "Only the principal can edit leadership accounts" });
  }

  if (role === "PRINCIPAL" && req.user.role !== "PRINCIPAL") {
    return res.status(403).json({ error: "Only a principal can assign the principal role" });
  }
  if (req.user.role === "EXAM_COORDINATOR" && (role === "EXAM_COORDINATOR" || role === "PRINCIPAL")) {
    return res.status(403).json({ error: "Only the principal can change leadership roles" });
  }
  if (existing.role === "PRINCIPAL" && role && role !== "PRINCIPAL") {
    const otherPrincipals = await prisma.user.count({
      where: { role: "PRINCIPAL", status: "ACTIVE", id: { not: existing.id } },
    });
    if (otherPrincipals === 0) {
      return res.status(400).json({ error: "Cannot demote the only active principal" });
    }
  }

  const data = {};
  if (status && ["PENDING", "ACTIVE", "REJECTED"].includes(status)) data.status = status;
  if (role && ["PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"].includes(role)) data.role = role;

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
