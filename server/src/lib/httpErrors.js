/**
 * Map thrown errors (Prisma, body-parser, multer) onto stable HTTP JSON payloads.
 * Route handlers can still return their own 4xx messages; this covers uncaught failures.
 */

export const SCHEMA_DRIFT_MESSAGE =
  "Database schema is out of date. Redeploy so pending migrations can apply.";

const UNIQUE_MESSAGES = [
  { fields: ["classname", "section"], message: "Class section already exists" },
  { fields: ["classname", "name"], message: "Subject already exists for this class" },
  { fields: ["classsectionid", "rollno"], message: "Roll number already exists in this class" },
  { fields: ["email"], message: "Email already registered" },
  { fields: ["schoolid"], message: "School ID already registered" },
  {
    fields: ["classsectionid", "dayofweek", "periodid"],
    message: "That class is already booked for this period, or this assignment was already added",
  },
  {
    fields: ["classsectionid", "examid", "subjectid", "teacherid"],
    message: "An access request already exists for this register",
  },
  { fields: ["classsectionid", "subjectid", "userid"], message: "This assignment already exists" },
  { fields: ["studentid", "subjectid", "examid"], message: "A mark already exists for this student and subject" },
  { fields: ["studentid", "subjectid"], message: "Student is already enrolled in this subject" },
  { fields: ["sortorder"], message: "Period order must be unique" },
  { fields: ["tokenhash"], message: "That value is already in use" },
];

const FK_FIELD_MESSAGES = {
  classteacherid: "Invalid class teacher",
  classsectionid: "Class not found",
  subjectid: "Subject not found",
  userid: "User not found",
  teacherid: "Teacher not found",
  examid: "Exam not found",
  studentid: "Student not found",
  periodid: "Period not found",
  enteredbyid: "User not found",
  actorid: "User not found",
};

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = extra.code;
    this.expose = extra.expose ?? status < 500;
  }
}

export function prismaErrorCode(err) {
  return String(err?.code || err?.meta?.code || "");
}

function targetTokens(err) {
  const raw = err?.meta?.target;
  const text = Array.isArray(raw) ? raw.join(",") : String(raw || "");
  return text
    .toLowerCase()
    .replace(/[()]/g, "")
    .split(/[,_\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueConstraintMessage(err) {
  const tokens = new Set(targetTokens(err));
  for (const row of UNIQUE_MESSAGES) {
    if (row.fields.every((field) => tokens.has(field))) return row.message;
  }
  return "That record already exists";
}

function foreignKeyMessage(err) {
  const field = String(err?.meta?.field_name || err?.meta?.fieldName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (FK_FIELD_MESSAGES[field]) return FK_FIELD_MESSAGES[field];
  const constraint = String(err?.meta?.constraint || "").toLowerCase();
  for (const [key, message] of Object.entries(FK_FIELD_MESSAGES)) {
    if (constraint.includes(key)) return message;
  }
  return "Related record is missing or cannot be changed";
}

export function isSchemaDriftError(err) {
  const code = prismaErrorCode(err);
  const msg = String(err?.message || "");
  return (
    code === "P2021" ||
    code === "P2022" ||
    code === "22P02" ||
    code === "42703" ||
    /invalid input value for enum/i.test(msg) ||
    /does not exist in the current database/i.test(msg)
  );
}

function isPrismaValidationError(err) {
  return err?.name === "PrismaClientValidationError" || prismaErrorCode(err) === "P2007";
}

function isDatabaseUnavailable(err) {
  const code = prismaErrorCode(err);
  return (
    err?.name === "PrismaClientInitializationError" ||
    code === "P1001" ||
    code === "P1002" ||
    code === "P1017"
  );
}

function isJsonBodyError(err) {
  return (
    err?.type === "entity.parse.failed" ||
    (err instanceof SyntaxError && (err.status === 400 || err.statusCode === 400))
  );
}

function isPayloadTooLarge(err) {
  return err?.type === "entity.too.large" || err?.status === 413 || err?.statusCode === 413;
}

function isMulterError(err) {
  return err?.name === "MulterError" || String(err?.code || "").startsWith("LIMIT_");
}

/**
 * @returns {{ status: number, body: { error: string, code?: string } }}
 */
export function toErrorPayload(err, { production = process.env.NODE_ENV === "production" } = {}) {
  if (!err) {
    return { status: 500, body: { error: "Server error" } };
  }

  if (isSchemaDriftError(err)) {
    return { status: 503, body: { error: SCHEMA_DRIFT_MESSAGE, code: "SCHEMA_DRIFT" } };
  }

  if (isJsonBodyError(err)) {
    return { status: 400, body: { error: "Invalid JSON body" } };
  }

  if (isPayloadTooLarge(err)) {
    return { status: 413, body: { error: "Request body is too large" } };
  }

  if (isMulterError(err)) {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    return {
      status: 400,
      body: { error: tooBig ? "File is too large" : err.message || "Upload failed" },
    };
  }

  const code = prismaErrorCode(err);
  if (code === "P2002") {
    return { status: 409, body: { error: uniqueConstraintMessage(err), code: "CONFLICT" } };
  }
  if (code === "P2025") {
    return { status: 404, body: { error: "Not found", code: "NOT_FOUND" } };
  }
  if (code === "P2003" || code === "P2014") {
    return { status: 409, body: { error: foreignKeyMessage(err), code: "CONSTRAINT" } };
  }
  if (code === "P2000") {
    return { status: 400, body: { error: "A value is too long" } };
  }
  if (code === "P2011" || code === "P2012") {
    return { status: 400, body: { error: "A required value is missing" } };
  }
  if (isPrismaValidationError(err)) {
    return { status: 400, body: { error: production ? "Invalid request" : "Invalid request" } };
  }
  if (isDatabaseUnavailable(err)) {
    return { status: 503, body: { error: "Database is unavailable. Try again shortly.", code: "DB_UNAVAILABLE" } };
  }

  const status = Number(err.status || err.statusCode || 500) || 500;
  const expose = err.expose === true || (err.expose !== false && status < 500);
  const raw = String(err.message || "").trim();
  const message =
    production && status >= 500
      ? "Server error"
      : expose && raw
        ? raw
        : "Server error";

  const body = { error: message };
  if (err.code && typeof err.code === "string" && !err.code.startsWith("P")) {
    body.code = err.code;
  }
  return { status, body };
}
