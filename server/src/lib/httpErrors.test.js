import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HttpError,
  SCHEMA_DRIFT_MESSAGE,
  isSchemaDriftError,
  toErrorPayload,
} from "./httpErrors.js";

function prismaErr(code, extra = {}) {
  const err = new Error(extra.message || "prisma");
  err.code = code;
  err.meta = extra.meta || {};
  return err;
}

describe("toErrorPayload", () => {
  it("maps unique class section conflicts to 409", () => {
    const { status, body } = toErrorPayload(
      prismaErr("P2002", { meta: { target: ["className", "section"] } })
    );
    assert.equal(status, 409);
    assert.equal(body.error, "Class section already exists");
    assert.equal(body.code, "CONFLICT");
  });

  it("maps unique subject / roll / email conflicts", () => {
    assert.equal(
      toErrorPayload(prismaErr("P2002", { meta: { target: ["name", "className"] } })).body.error,
      "Subject already exists for this class"
    );
    assert.equal(
      toErrorPayload(prismaErr("P2002", { meta: { target: ["rollNo", "classSectionId"] } })).body
        .error,
      "Roll number already exists in this class"
    );
    assert.equal(
      toErrorPayload(prismaErr("P2002", { meta: { target: "User_email_key" } })).body.error,
      "Email already registered"
    );
  });

  it("maps missing records and foreign keys", () => {
    const missing = toErrorPayload(prismaErr("P2025"));
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, "Not found");

    const fk = toErrorPayload(prismaErr("P2003", { meta: { field_name: "classTeacherId" } }));
    assert.equal(fk.status, 409);
    assert.equal(fk.body.error, "Invalid class teacher");
  });

  it("maps schema drift, JSON parse, multer, and payload size", () => {
    assert.equal(isSchemaDriftError(prismaErr("P2021")), true);
    assert.equal(toErrorPayload(prismaErr("P2022")).status, 503);
    assert.equal(toErrorPayload(prismaErr("P2022")).body.error, SCHEMA_DRIFT_MESSAGE);

    const jsonErr = new SyntaxError("Unexpected token");
    jsonErr.status = 400;
    jsonErr.type = "entity.parse.failed";
    assert.deepEqual(toErrorPayload(jsonErr), { status: 400, body: { error: "Invalid JSON body" } });

    const multer = new Error("File too large");
    multer.name = "MulterError";
    multer.code = "LIMIT_FILE_SIZE";
    assert.deepEqual(toErrorPayload(multer), { status: 400, body: { error: "File is too large" } });

    const big = new Error("too large");
    big.type = "entity.too.large";
    big.status = 413;
    assert.equal(toErrorPayload(big).status, 413);
  });

  it("hides 500 messages in production but keeps 4xx", () => {
    const boom = new Error("secret stack");
    const hidden = toErrorPayload(boom, { production: true });
    assert.equal(hidden.status, 500);
    assert.equal(hidden.body.error, "Server error");

    const http = new HttpError(400, "Name is required");
    const shown = toErrorPayload(http, { production: true });
    assert.equal(shown.status, 400);
    assert.equal(shown.body.error, "Name is required");
  });

  it("maps Prisma validation and unavailable database", () => {
    const validation = new Error("Invalid `prisma.exam.create()` invocation");
    validation.name = "PrismaClientValidationError";
    assert.equal(toErrorPayload(validation, { production: true }).status, 400);

    const down = new Error("Can't reach database");
    down.name = "PrismaClientInitializationError";
    const payload = toErrorPayload(down, { production: true });
    assert.equal(payload.status, 503);
    assert.match(payload.body.error, /unavailable/i);
  });
});
