import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TENANT_EXPORT_MODELS } from "./backup.js";

describe("platform JSON backup", () => {
  it("does not export marks or pupil contact fields", () => {
    const keys = TENANT_EXPORT_MODELS.map((row) => row.key);
    assert.equal(keys.includes("marks"), false);
    const students = TENANT_EXPORT_MODELS.find((row) => row.key === "students");
    for (const field of ["photoBytes", "guardianEmail", "guardianPhone", "guardianName", "dob", "admissionNo"]) {
      assert.equal(students.omit[field], true, field);
    }
  });
});