import app from "./app.js";
import { assertDeployAuthConfig } from "./lib/deployAuthConfig.js";
import { bootstrapSchema } from "./lib/migrateOnStart.js";

const port = Number(process.env.PORT || 4000);

assertDeployAuthConfig();

async function start() {
  if (!process.env.VERCEL) {
    try {
      await bootstrapSchema();
    } catch (err) {
      console.error("Schema bootstrap failed", err);
      if (process.env.NODE_ENV === "production") process.exit(1);
    }
    app.listen(port, () => {
      console.log(`API listening on http://localhost:${port}`);
    });
  }
}

start();

export default app;
