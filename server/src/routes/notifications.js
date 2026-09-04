import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../middleware/auth.js";

export const notificationsRouter = Router();
notificationsRouter.use(auth);

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
