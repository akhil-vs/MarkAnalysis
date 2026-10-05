import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { clientIp } from "../lib/clientIp.js";
import { rateLimit } from "../lib/rateLimit.js";
import { queueEmail } from "../lib/mailer.js";
import { logger } from "../lib/logger.js";
import {
  parsePilotRequestBody,
  pilotNotifyEmail,
  publicPilotRequest,
} from "../lib/pilotRequest.js";
import { ensurePilotRequestsSchema } from "../lib/ensureSchema.js";

export const pilotRequestsRouter = Router();

const submitLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyFn: (req) => `pilot|${clientIp(req) || "unknown"}|${String(req.body?.contactEmail || "").toLowerCase()}`,
  message: "Too many pilot requests. Try again in a few minutes.",
});

pilotRequestsRouter.post("/", submitLimit, async (req, res) => {
  await ensurePilotRequestsSchema();
  const parsed = parsePilotRequestBody(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const recent = await prisma.pilotRequest.findFirst({
    where: {
      contactEmail: parsed.value.contactEmail,
      schoolName: parsed.value.schoolName,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return res.status(200).json({
      ok: true,
      duplicate: true,
      id: recent.id,
      message: "We already have your recent request. Our team will be in touch.",
    });
  }

  const row = await prisma.pilotRequest.create({
    data: {
      ...parsed.value,
      status: "PENDING",
      sourceIp: clientIp(req) || null,
      userAgent: String(req.get("user-agent") || "").slice(0, 300) || null,
    },
  });

  const notify = pilotNotifyEmail();
  if (notify) {
    try {
      await queueEmail({
        tenantId: null,
        toEmail: notify,
        kind: "pilot_request",
        subject: `School pilot request: ${row.schoolName}`,
        bodyText: [
          `New school pilot request`,
          ``,
          `School: ${row.schoolName}`,
          `Board: ${row.board || "—"}`,
          `Contact: ${row.contactName} <${row.contactEmail}>`,
          `Phone: ${row.contactPhone || "—"}`,
          `Role: ${row.roleTitle || "—"}`,
          `Exam: ${row.examNameOrType || "—"}`,
          `Classes: ${row.targetClasses || "—"}`,
          `Preferred start: ${row.preferredStartDate || "—"}`,
          `Notes: ${row.notes || "—"}`,
          ``,
          `Request id: ${row.id}`,
        ].join("\n"),
        meta: { pilotRequestId: row.id },
      });
    } catch (err) {
      logger.warn("pilot_request_email_queue_failed", { error: err?.message, id: row.id });
    }
  }

  res.status(201).json({
    ok: true,
    id: row.id,
    message: "Thanks — we received your pilot request and will follow up shortly.",
    request: publicPilotRequest(row),
  });
});
