import { Router } from "express";
import multer from "multer";
import { auth, requireRole } from "../middleware/auth.js";
import {
  getSchoolProfile,
  parseLogoFile,
  parseSchoolIdentityPatch,
  publicSchool as serializeSchool,
  LOGO_MAX_BYTES,
} from "../lib/school.js";
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

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES },
});

function publicSchool(profile) {
  return serializeSchool(profile, {
    workingDays: publicWorkingDays(profile),
    grading: publicGradingConfig(profile),
  });
}

function receiveLogo(req, res, next) {
  logoUpload.single("logo")(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    err.status = 400;
    err.message = tooBig ? "Logo must be 1 MB or smaller" : err.message || "Could not upload logo";
    next(err);
  });
}

schoolRouter.get("/", async (_req, res) => {
  const profile = await getSchoolProfile();
  res.json(publicSchool(profile));
});

schoolRouter.get("/logo", async (_req, res) => {
  const profile = await getSchoolProfile({ includeLogo: true });
  const raw = profile.logoBytes;
  const buf = raw ? (Buffer.isBuffer(raw) ? raw : Buffer.from(raw)) : null;
  if (!buf?.length || !profile.logoMimeType) {
    return res.status(404).json({ error: "No school logo uploaded" });
  }
  res.setHeader("Content-Type", profile.logoMimeType);
  res.setHeader("Cache-Control", "private, no-store");
  return res.send(buf);
});

schoolRouter.patch("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const identity = parseSchoolIdentityPatch(req.body || {});
  if (identity.error) return res.status(400).json({ error: identity.error });

  const gradingPatch = parseGradingPatch(req.body || {});
  if (gradingPatch.error) return res.status(400).json({ error: gradingPatch.error });

  const workingDaysPatch = parseWorkingDays(req.body?.workingDays);
  if (workingDaysPatch.error) return res.status(400).json({ error: workingDaysPatch.error });

  await getSchoolProfile();
  const updated = await prisma.schoolProfile.update({
    where: { id: "school" },
    omit: { logoBytes: true },
    data: {
      ...identity.data,
      ...(workingDaysPatch.value !== undefined && { workingDays: workingDaysPatch.value }),
      ...gradingPatch.data,
    },
  });
  res.json(publicSchool(updated));
});

schoolRouter.post("/logo", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), receiveLogo, async (req, res) => {
  const parsed = parseLogoFile(req.file);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  await getSchoolProfile();
  const updated = await prisma.schoolProfile.update({
    where: { id: "school" },
    omit: { logoBytes: true },
    data: { logoBytes: parsed.bytes, logoMimeType: parsed.mime },
  });
  res.json(publicSchool(updated));
});

schoolRouter.delete("/logo", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (_req, res) => {
  await getSchoolProfile();
  const updated = await prisma.schoolProfile.update({
    where: { id: "school" },
    omit: { logoBytes: true },
    data: { logoBytes: null, logoMimeType: null },
  });
  res.json(publicSchool(updated));
});

schoolRouter.post("/grading/reset", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (_req, res) => {
  await getSchoolProfile();
  const updated = await prisma.schoolProfile.update({
    where: { id: "school" },
    omit: { logoBytes: true },
    data: {
      passPercent: DEFAULT_PASS_PERCENT,
      distinctionMin: DEFAULT_DISTINCTION_MIN,
      gradeBands: DEFAULT_GRADE_BANDS,
      examWeights: DEFAULT_EXAM_WEIGHTS,
    },
  });
  res.json(publicSchool(updated));
});
