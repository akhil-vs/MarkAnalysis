import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { requireSchoolTenant } from "../lib/tenant.js";
import { insightsHomeCards } from "../lib/insightsHome.js";
import { resolveWorkspace } from "../lib/workspace.js";

export const insightsHomeRouter = Router();
insightsHomeRouter.use(auth);
insightsHomeRouter.use(requireSchoolTenant);

insightsHomeRouter.get("/home", async (req, res) => {
  const resolved = await resolveWorkspace({
    userId: req.user.userId,
    examId: req.query.examId || undefined,
  });
  const cards = insightsHomeCards(req.user.role, { examId: resolved.examId });
  res.json({
    examId: resolved.examId,
    cards,
  });
});
