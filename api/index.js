import app from "../server/src/app.js";
import { bootstrapSchema } from "../server/src/lib/migrateOnStart.js";

// Warm schema catch-up on cold start. Request handlers also await bootstrapSchema
// via app middleware so login cannot race ahead of RefreshToken / User columns.
bootstrapSchema().catch((err) => {
  console.error("bootstrapSchema failed", err);
});

export default app;
