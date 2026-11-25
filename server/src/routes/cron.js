import { Router } from "express";
import { authorizeCron } from "../lib/cronAuth.js";
import { flushEmailOutbox } from "../lib/mailer.js";
import { runSchoolDigests } from "../lib/digests.js";
import { applyDueRetention } from "../lib/pupilPrivacy.js";

export const cronRouter = Router();

function guard(req, res) {
  const result = authorizeCron(req);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return false;
  }
  return true;
}

/** Hourly mail flush plus a bounded pupil-retention pass. Vercel Cron uses GET. */
cronRouter.all("/mail", async (req, res) => {
  if (!guard(req, res)) return;
  const mail = await flushEmailOutbox({ limit: 40 });
  let retention = null;
  try {
    retention = await applyDueRetention({ limit: 40 });
  } catch (err) {
    retention = { error: err?.message || "retention failed" };
  }
  res.json({ ok: true, mail, retention });
});

/** Daily digest run for hosts that cannot keep a background timer. */
cronRouter.all("/digests", async (req, res) => {
  if (!guard(req, res)) return;
  const digests = await runSchoolDigests();
  res.json({ ok: true, digests });
});
