import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  assertMaxMarksEditable,
  getConsolidationSettings,
  publicConsolidationSettings,
} from "../lib/consolidationMaxMarks.js";
import { ensureConsolidationSchema } from "../lib/ensureSchema.js";
import { auth, requireLeadership } from "../middleware/auth.js";

export const consolidationSettingsRouter = Router();
consolidationSettingsRouter.use(auth);

async function ensureReady(req, res, next) {
  try {
    await ensureConsolidationSchema();
    next();
  } catch (err) {
    next(err);
  }
}

consolidationSettingsRouter.use(ensureReady);

/** Leadership + authenticated teachers can read lock status (teachers see read-only). */
consolidationSettingsRouter.get("/max-marks", async (_req, res) => {
  const [settings, subjects] = await Promise.all([
    getConsolidationSettings(),
    prisma.subject.findMany({
      orderBy: [{ className: "asc" }, { name: "asc" }],
      select: { id: true, name: true, className: true, maxMarks: true },
    }),
  ]);
  res.json({
    settings: publicConsolidationSettings(settings),
    subjects,
  });
});

/** Batch-update subject max marks (only while unlocked). Leadership only. */
consolidationSettingsRouter.put("/max-marks", requireLeadership(), async (req, res) => {
  const lockedMsg = await assertMaxMarksEditable();
  if (lockedMsg) return res.status(409).json({ error: lockedMsg });

  const items = Array.isArray(req.body?.subjects) ? req.body.subjects : null;
  if (!items?.length) {
    return res.status(400).json({ error: "Provide subjects: [{ id, maxMarks }, ...]" });
  }

  const updates = [];
  for (const item of items) {
    const id = item?.id;
    const maxMarks = Number(item?.maxMarks);
    if (!id || !Number.isFinite(maxMarks) || maxMarks <= 0 || !Number.isInteger(maxMarks)) {
      return res.status(400).json({ error: "Each subject needs id and a positive integer maxMarks" });
    }
    updates.push({ id, maxMarks });
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.subject.update({
        where: { id: u.id },
        data: { maxMarks: u.maxMarks },
      })
    )
  );

  const subjects = await prisma.subject.findMany({
    orderBy: [{ className: "asc" }, { name: "asc" }],
    select: { id: true, name: true, className: true, maxMarks: true },
  });
  const settings = await getConsolidationSettings();
  res.json({ settings: publicConsolidationSettings(settings), subjects });
});

/** One-time lock: freeze subject max marks for consolidation. */
consolidationSettingsRouter.post("/max-marks/lock", requireLeadership(), async (req, res) => {
  await getConsolidationSettings();
  const settings = await prisma.consolidationSettings.update({
    where: { id: "default" },
    data: {
      maxMarksLocked: true,
      lockedAt: new Date(),
      lockedById: req.user.userId,
    },
    include: { lockedBy: { select: { id: true, name: true } } },
  });
  res.json({ settings: publicConsolidationSettings(settings) });
});

/**
 * Unlock for corrections (still leadership-only). Schools sometimes need to
 * fix a wrong ceiling; re-lock after editing.
 */
consolidationSettingsRouter.post("/max-marks/unlock", requireLeadership(), async (req, res) => {
  await getConsolidationSettings();
  const settings = await prisma.consolidationSettings.update({
    where: { id: "default" },
    data: {
      maxMarksLocked: false,
      lockedAt: null,
      lockedById: null,
    },
    include: { lockedBy: { select: { id: true, name: true } } },
  });
  res.json({ settings: publicConsolidationSettings(settings) });
});
