import { Router } from "express";
import { auth, isLeadership, requireFeature } from "../middleware/auth.js";
import { requireSchoolTenant } from "../lib/tenant.js";
import { listRegisters } from "../lib/registers.js";
import { ensureUserWorkspaceColumn } from "../lib/ensureSchema.js";
import { cachedInsight } from "../lib/insightsCache.js";
import { normalizeSchoolSection } from "../lib/schoolSections.js";

export const registersRouter = Router();
registersRouter.use(auth);
registersRouter.use(requireSchoolTenant);
registersRouter.use(requireFeature("marks", "pendingUploads", "upload"));

registersRouter.get("/", async (req, res) => {
  try {
    await ensureUserWorkspaceColumn();
  } catch {
    // column ensure best-effort; listRegisters still works without preference
  }
  const examId = req.query.examId || "";
  const schoolSection = normalizeSchoolSection(req.query.schoolSection || "");
  const userId = req.user.userId || req.user.id;
  // Teachers only see their own assignments — key by user. Leadership shares a section key.
  const scope = isLeadership(req.user.role) ? `lead:${schoolSection}` : `t:${userId}`;
  const payload = await cachedInsight("registers", [examId || "auto", scope], async () =>
    listRegisters(req.user, {
      examId: examId || undefined,
      schoolSection: schoolSection || undefined,
    })
  );
  res.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
  res.json(payload);
});
