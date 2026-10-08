import { Router } from "express";
import { auth, isLeadership, requireRole } from "../middleware/auth.js";
import { requireSchoolTenant } from "../lib/tenant.js";
import { approveRegisterItems, buildApprovalsInbox } from "../lib/approvalsInbox.js";

export const approvalsRouter = Router();
approvalsRouter.use(auth);
approvalsRouter.use(requireSchoolTenant);

approvalsRouter.get("/inbox", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  if (!isLeadership(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  const tab = req.query.tab === "access" ? "access" : "registers";
  const payload = await buildApprovalsInbox({
    tab,
    examId: req.query.examId || undefined,
    status: req.query.status || undefined,
  });
  res.json(payload);
});

approvalsRouter.post(
  "/registers/approve",
  requireRole("PRINCIPAL", "EXAM_COORDINATOR"),
  async (req, res) => {
    try {
      const body = req.body || {};
      const items = Array.isArray(body.items) ? body.items : body.item ? [body.item] : [];
      const result = await approveRegisterItems(req.user.userId, items);
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({
        error: err.message || "Could not approve registers",
        code: err.code,
      });
    }
  }
);
