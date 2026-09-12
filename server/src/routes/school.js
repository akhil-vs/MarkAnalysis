import { Router } from "express";
import { auth, isLeadership, requireRole } from "../middleware/auth.js";
import { allocateJoinCode, getSchoolProfile } from "../lib/school.js";
import { prisma } from "../lib/prisma.js";
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

function publicSchool(profile, { includeJoinCode = false } = {}) {
  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    board: profile.board,
    affiliationNo: profile.affiliationNo,
    address: profile.address,
    phone: profile.phone,
    email: profile.email,
    status: profile.status,
    workingDays: publicWorkingDays(profile),
    grading: publicGradingConfig(profile),
    ...(includeJoinCode ? { joinCode: profile.joinCode } : {}),
  };
}

function schoolJson(req, profile) {
  return publicSchool(profile, { includeJoinCode: isLeadership(req.user.role) });
}

schoolRouter.get("/", async (req, res) => {
  const profile = await getSchoolProfile();
  res.json(schoolJson(req, profile));
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

  const profile = await getSchoolProfile();
  const updated = await prisma.school.update({
    where: { id: profile.id },
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
  res.json(schoolJson(req, updated));
});

schoolRouter.post("/join-code", requireRole("PRINCIPAL"), async (req, res) => {
  const profile = await getSchoolProfile();
  const joinCode = await allocateJoinCode();
  const updated = await prisma.school.update({
    where: { id: profile.id },
    data: { joinCode },
  });
  res.json(schoolJson(req, updated));
});

schoolRouter.post("/grading/reset", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (_req, res) => {
  const profile = await getSchoolProfile();
  const updated = await prisma.school.update({
    where: { id: profile.id },
    data: {
      passPercent: DEFAULT_PASS_PERCENT,
      distinctionMin: DEFAULT_DISTINCTION_MIN,
      gradeBands: DEFAULT_GRADE_BANDS,
      examWeights: DEFAULT_EXAM_WEIGHTS,
    },
  });
  res.json(schoolJson(_req, updated));
});
