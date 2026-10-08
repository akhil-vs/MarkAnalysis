import { Router } from "express";
import { auth, requireFeature } from "../middleware/auth.js";
import { requireSchoolTenant } from "../lib/tenant.js";
import { listRegisters } from "../lib/registers.js";
import { ensureUserWorkspaceColumn } from "../lib/ensureSchema.js";

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
  const payload = await listRegisters(req.user, {
    examId: req.query.examId || undefined,
    schoolSection: req.query.schoolSection || undefined,
  });
  res.json(payload);
});
