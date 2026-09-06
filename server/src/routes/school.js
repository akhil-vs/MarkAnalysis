import { Router } from "express";
import { auth, requireRole } from "../middleware/auth.js";
import { getSchoolProfile } from "../lib/school.js";
import { prisma } from "../lib/prisma.js";

export const schoolRouter = Router();
schoolRouter.use(auth);

schoolRouter.get("/", async (_req, res) => {
  res.json(await getSchoolProfile());
});

schoolRouter.patch("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, board, affiliationNo, address, phone, email } = req.body || {};
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: "School name is required" });
  }
  await getSchoolProfile();
  const updated = await prisma.schoolProfile.update({
    where: { id: "school" },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(board !== undefined && { board: board ? String(board).trim() : null }),
      ...(affiliationNo !== undefined && { affiliationNo: affiliationNo ? String(affiliationNo).trim() : null }),
      ...(address !== undefined && { address: address ? String(address).trim() : null }),
      ...(phone !== undefined && { phone: phone ? String(phone).trim() : null }),
      ...(email !== undefined && { email: email ? String(email).trim() : null }),
    },
  });
  res.json(updated);
});
