import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { requireSchoolTenant } from "../lib/tenant.js";
import { ensureUserWorkspaceColumn } from "../lib/ensureSchema.js";
import { publicWorkspace, resolveWorkspace, saveWorkspace } from "../lib/workspace.js";

export const workspaceRouter = Router();
workspaceRouter.use(auth);
workspaceRouter.use(requireSchoolTenant);

async function ensureColumn(req, res, next) {
  try {
    await ensureUserWorkspaceColumn();
    next();
  } catch (err) {
    next(err);
  }
}

workspaceRouter.use(ensureColumn);

workspaceRouter.get("/", async (req, res) => {
  const examId = req.query.examId || undefined;
  const schoolSection = req.query.schoolSection || undefined;
  const resolved = await resolveWorkspace({
    userId: req.user.userId,
    examId,
    schoolSection,
  });
  res.json({
    workspace: publicWorkspace(resolved),
    exams: (resolved.exams || []).map((e) => ({
      id: e.id,
      name: e.name,
      academicYear: e.academicYear,
      type: e.type,
      date: e.date,
      marksEntryDeadline: e.marksEntryDeadline ?? null,
    })),
  });
});

workspaceRouter.put("/", async (req, res) => {
  const body = req.body || {};
  try {
    const resolved = await saveWorkspace(req.user.userId, {
      ...("examId" in body ? { examId: body.examId } : {}),
      ...("schoolSection" in body ? { schoolSection: body.schoolSection } : {}),
    });
    res.json({
      workspace: publicWorkspace(resolved),
      exams: (resolved.exams || []).map((e) => ({
        id: e.id,
        name: e.name,
        academicYear: e.academicYear,
        type: e.type,
        date: e.date,
        marksEntryDeadline: e.marksEntryDeadline ?? null,
      })),
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Could not save workspace", code: err.code });
  }
});
