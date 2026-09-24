/**
 * Minimal structured JSON logger (no external deps).
 * Levels: debug, info, warn, error.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel() {
  const raw = String(process.env.LOG_LEVEL || "info").toLowerCase();
  return LEVELS[raw] ?? LEVELS.info;
}

function write(level, msg, fields = {}) {
  if ((LEVELS[level] ?? 99) < currentLevel()) return;
  const line = {
    level,
    msg: String(msg),
    time: new Date().toISOString(),
    service: "school-marks-api",
    ...fields,
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  debug: (msg, fields) => write("debug", msg, fields),
  info: (msg, fields) => write("info", msg, fields),
  warn: (msg, fields) => write("warn", msg, fields),
  error: (msg, fields) => write("error", msg, fields),
};

/**
 * Express middleware: log method, path, status, durationMs.
 */
export function requestLogMiddleware(req, res, next) {
  const started = Date.now();
  res.on("finish", () => {
    const status = res.statusCode;
    const fields = {
      method: req.method,
      path: req.originalUrl || req.url,
      status,
      durationMs: Date.now() - started,
      ip: req.ip || undefined,
    };
    if (status >= 500) logger.error("request", fields);
    else if (status >= 400) logger.warn("request", fields);
    else logger.info("request", fields);
  });
  next();
}
