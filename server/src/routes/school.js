import { Router } from "express";
import { auth, requireRole } from "../middleware/auth.js";
import { getSchoolProfile } from "../lib/school.js";
import { prisma } from "../lib/prisma.js";
import { requireSchoolTenant } from "../lib/tenant.js";
import {
  DEFAULT_DISTINCTION_MIN,
  DEFAULT_EXAM_WEIGHTS,
  DEFAULT_GRADE_BANDS,
  DEFAULT_PASS_PERCENT,
  parseGradingPatch,
  publicGradingConfig,
} from "../lib/gradingConfig.js";
import { parseWorkingDays, publicWorkingDays } from "../lib/workingDays.js";

export const schoolRouter = Router();
schoolRouter.use(auth);
schoolRouter.use(requireSchoolTenant);

function publicSchool(profile) {
  return {
    ...profile,
    workingDays: publicWorkingDays(profile),
    grading: publicGradingConfig(profile),
  };
}

schoolRouter.get("/", async (req, res) => {
  const profile = await getSchoolProfile(req.tenantId);
  if (!profile) return res.status(404).json({ error: "School not found" });
  res.json(publicSchool(profile));
});

schoolRouter.patch("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, board, affiliationNo, address, phone, email } = req.body || {};
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: "School name is required" });
  }
  const gradingPatch = parseGradingPatch(req.body || {});
  if (gradingPatch.error) return res.status(400).json({ error: gradingPatch.error });

  const workingDaysPatch = parseWorkingDays(req.body?.workingDays);
  if (workingDaysPatch.error) return res.status(400).json({ error: workingDaysPatch.error });

  await getSchoolProfile(req.tenantId);
  const updated = await prisma.schoolProfile.update({
    where: { id: req.tenantId },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(board !== undefined && { board: board ? String(board).trim() : null }),
      ...(affiliationNo !== undefined && { affiliationNo: affiliationNo ? String(affiliationNo).trim() : null }),
      ...(address !== undefined && { address: address ? String(address).trim() : null }),
      ...(phone !== undefined && { phone: phone ? String(phone).trim() : null }),
      ...(email !== undefined && { email: email ? String(email).trim() : null }),
      ...(workingDaysPatch.value !== undefined && { workingDays: workingDaysPatch.value }),
      ...gradingPatch.data,
    },
  });
  res.json(publicSchool(updated));
});

schoolRouter.post("/grading/reset", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await getSchoolProfile(req.tenantId);
  const updated = await prisma.schoolProfile.update({
    where: { id: req.tenantId },
    data: {
      passPercent: DEFAULT_PASS_PERCENT,
      distinctionMin: DEFAULT_DISTINCTION_MIN,
      gradeBands: DEFAULT_GRADE_BANDS,
      examWeights: DEFAULT_EXAM_WEIGHTS,
    },
  });
  res.json(publicSchool(updated));
});
