import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { parseEmail } from "../lib/numbers.js";
import { publicUser, signToken } from "../middleware/auth.js";
import { authAttemptKey, rateLimit } from "../lib/rateLimit.js";
import {
  createRefreshSession,
  setAccessCookie,
  setRefreshCookie,
} from "../lib/authCookies.js";
import { allocateJoinCode, allocateSchoolSlug, findSchoolByJoinCode } from "../lib/school.js";
import { DEFAULT_PERIODS } from "../lib/periods.js";
import { normalizeJoinCode } from "../lib/schoolIdentity.js";
import { runWithoutTenant, runWithTenant } from "../lib/tenant.js";
import { logActivity } from "../lib/activityAudit.js";

export const schoolsRouter = Router();

const registerLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: authAttemptKey,
  message: "Too many school registrations. Try again in a few minutes.",
});

schoolsRouter.get("/lookup", async (req, res) => {
  const code = normalizeJoinCode(req.query.joinCode);
  if (!code) return res.status(400).json({ error: "Enter a school join code" });
  const school = await findSchoolByJoinCode(code);
  if (!school || school.status === "SUSPENDED") {
    return res.status(404).json({ error: "Unknown school join code" });
  }
  res.json({ id: school.id, name: school.name, slug: school.slug, board: school.board });
});

schoolsRouter.post("/register", registerLimit, async (req, res) => {
  const { schoolName, board, name, email, password, schoolId } = req.body || {};
  if (!schoolName || !String(schoolName).trim()) {
    return res.status(400).json({ error: "School name is required" });
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Principal name is required" });
  }
  const parsedEmail = parseEmail(email, { required: true });
  if (parsedEmail.error) return res.status(400).json({ error: parsedEmail.error });
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const exists = await runWithoutTenant(() => prisma.user.findUnique({ where: { email: parsedEmail.value } }));
  if (exists) return res.status(409).json({ error: "Email already registered" });

  const slug = await allocateSchoolSlug(schoolName);
  const joinCode = await allocateJoinCode();
  const passwordHash = await bcrypt.hash(password, 10);

  const { school, principal } = await runWithoutTenant(async () => {
    const schoolRow = await prisma.school.create({
      data: {
        slug,
        joinCode,
        name: String(schoolName).trim(),
        board: board ? String(board).trim() : null,
      },
    });
    const principalRow = await prisma.user.create({
      data: {
        tenantId: schoolRow.id,
        name: String(name).trim(),
        email: parsedEmail.value,
        schoolId: schoolId ? String(schoolId).trim() : null,
        passwordHash,
        role: "PRINCIPAL",
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });
    if (DEFAULT_PERIODS.length) {
      await prisma.period.createMany({
        data: DEFAULT_PERIODS.map((period) => ({ ...period, tenantId: schoolRow.id })),
      });
    }
    return { school: schoolRow, principal: principalRow };
  });

  await runWithTenant(school.id, () =>
    logActivity({
      actorId: principal.id,
      action: "USER_CREATED",
      summary: `Registered school ${school.name}`,
      meta: { schoolId: school.id, slug: school.slug },
    })
  );

  const access = signToken(principal);
  const refresh = await createRefreshSession(principal.id, { userAgent: req.get("user-agent") });
  setAccessCookie(res, access);
  setRefreshCookie(res, refresh.raw);

  res.status(201).json({
    user: publicUser(principal, school),
    school: {
      id: school.id,
      name: school.name,
      slug: school.slug,
      joinCode: school.joinCode,
      board: school.board,
    },
  });
});
