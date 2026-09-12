import app from "../server/src/app.js";
import { bootstrapSchema } from "../server/src/lib/migrateOnStart.js";

// Prefer prisma migrate deploy on cold start; fall back to ensurePendingSchema.
bootstrapSchema().catch((err) => {
  console.error("bootstrapSchema failed", err);
});

export default app;
