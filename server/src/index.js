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

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
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
app.use("/api/analytics", analyticsRouter);
app.use("/api/exports", exportsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
