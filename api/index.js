import app from "../server/src/app.js";
import { assertDeployAuthConfig } from "../server/src/lib/deployAuthConfig.js";
import { bootstrapSchema } from "../server/src/lib/migrateOnStart.js";

// Fail the serverless function boot when JWT / cookie auth env is unsafe.
assertDeployAuthConfig();

// Warm schema catch-up on cold start. Request handlers also await bootstrapSchema
// via app middleware so login cannot race ahead of RefreshToken / User columns.
bootstrapSchema().catch((err) => {
  console.error("bootstrapSchema failed", err);
});

export default app;
