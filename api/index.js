import app from "../server/src/app.js";
import { ensurePendingSchema } from "../server/src/lib/ensureSchema.js";

// Best-effort schema catch-up on cold start (Vercel often cannot migrate at build time).
ensurePendingSchema().catch((err) => {
  console.error("ensurePendingSchema failed", err);
});

export default app;
