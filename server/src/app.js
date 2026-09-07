import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { classesRouter } from "./routes/classes.js";
import { subjectsRouter } from "./routes/subjects.js";
import { studentsRouter } from "./routes/students.js";
import { examsRouter } from "./routes/exams.js";
import { marksRouter } from "./routes/marks.js";
import { analyticsRouter } from "./routes/analytics.js";
import { exportsRouter } from "./routes/exports.js";
import { markAccessRouter } from "./routes/markAccess.js";
import { notificationsRouter } from "./routes/notifications.js";
import { schoolRouter } from "./routes/school.js";

const app = express();

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
        return callback(null, true);
      }
      return callback(null, false);
    },
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
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
app.use("/api/analytics", analyticsRouter);
app.use("/api/exports", exportsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === "production" && status >= 500
      ? "Server error"
      : err.message || "Server error";
  res.status(status).json({ error: message });
});

export default app;
