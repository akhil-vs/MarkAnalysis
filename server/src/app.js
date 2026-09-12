import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { classesRouter } from "./routes/classes.js";
import { subjectsRouter } from "./routes/subjects.js";
import { studentsRouter } from "./routes/students.js";
import { examsRouter } from "./routes/exams.js";
import { marksRouter } from "./routes/marks.js";
import { analyticsRouter } from "./routes/analytics.js";
import { exportsRouter } from "./routes/exports.js";
import { portalRouter } from "./routes/portal.js";
import { markAccessRouter } from "./routes/markAccess.js";
import { notificationsRouter } from "./routes/notifications.js";
import { schoolRouter } from "./routes/school.js";
import { schoolsRouter } from "./routes/schools.js";
import { timetableRouter } from "./routes/timetable.js";
import { platformRouter } from "./routes/platform.js";
import { bootstrapSchema } from "./lib/migrateOnStart.js";
import { toErrorPayload } from "./lib/httpErrors.js";

const app = express();

/** Once per process: wait for migrate/ensure before handling API traffic (Vercel cold start). */
let schemaReady = null;
function awaitSchema(_req, _res, next) {
  if (!schemaReady) schemaReady = bootstrapSchema();
  schemaReady.then(() => next()).catch((err) => next(err));
}

// Dynamic, auth-scoped JSON should not use Express ETags. Hashing large
// analytics payloads slows every response, and matching If-None-Match
// replies with 304 (empty body) which breaks the SPA fetch client.
app.set("etag", false);

const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        process.env.VERCEL ||
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(origin)
      ) {
        // Reflect the request origin so credentialed browsers accept Set-Cookie.
        return callback(null, origin || true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", awaitSchema);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/classes", classesRouter);
app.use("/api/subjects", subjectsRouter);
app.use("/api/students", studentsRouter);
app.use("/api/exams", examsRouter);
app.use("/api/marks", marksRouter);
app.use("/api/mark-access", markAccessRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/school", schoolRouter);
app.use("/api/schools", schoolsRouter);
app.use("/api/timetable", timetableRouter);
app.use("/api/platform", platformRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/exports", exportsRouter);
app.use("/api/portal", portalRouter);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  const { status, body } = toErrorPayload(err);
  if (status >= 500) console.error(err);
  if (res.headersSent) return;
  res.status(status).json(body);
});

export default app;
