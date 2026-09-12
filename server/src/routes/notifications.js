import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ensureNotificationSchema } from "../lib/ensureSchema.js";
import { sendTeacherNotices } from "../lib/teacherNotices.js";
import { auth, requireRole } from "../middleware/auth.js";
import { requireSchoolTenant } from "../lib/tenant.js";

export const notificationsRouter = Router();
notificationsRouter.use(auth);
notificationsRouter.use(requireSchoolTenant);
notificationsRouter.use(async (_req, _res, next) => {
  try {
    await ensureNotificationSchema();
    next();
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/send", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { kind, examId, audience, teacherIds, classSectionId, message, preview, force } = req.body || {};
  try {
    const result = await sendTeacherNotices({
      kind: kind ? String(kind).toUpperCase() : "",
      examId: examId || null,
      audience: audience ? String(audience).toUpperCase() : undefined,
      teacherIds: Array.isArray(teacherIds) ? teacherIds.filter(Boolean) : [],
      classSectionId: classSectionId || null,
      message,
      sender: req.user,
      preview: Boolean(preview),
      force: Boolean(force),
    });
    res.status(preview ? 200 : result.sent ? 201 : 200).json(result);
  } catch (err) {
    const status = err.status || 500;
    const raw = String(err.message || "");
    const schemaMissing =
      err?.meta?.code === "22P02" || /invalid input value for enum/i.test(raw);
    res.status(schemaMissing ? 503 : status).json({
      error: schemaMissing
        ? "Database schema is out of date. Redeploy so pending migrations can apply."
        : err.message || "Could not send notice",
    });
  }
});

notificationsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const unreadOnly = req.query.unread === "1" || req.query.unread === "true";

  const where = {
    userId: req.user.userId,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId: req.user.userId, readAt: null },
    }),
  ]);

  res.json({ items, unreadCount });
});

notificationsRouter.get("/unread-count", async (req, res) => {
  const unreadCount = await prisma.notification.count({
    where: { userId: req.user.userId, readAt: null },
  });
  res.json({ unreadCount });
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  const existing = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (existing.readAt) return res.json(existing);

  const updated = await prisma.notification.update({
    where: { id: existing.id },
    data: { readAt: new Date() },
  });
  res.json(updated);
});

notificationsRouter.post("/read-all", async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user.userId, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
});
