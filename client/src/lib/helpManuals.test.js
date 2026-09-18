import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HELP_MANUALS, manualsForRole } from "./helpManuals.js";

describe("manualsForRole", () => {
  it("returns only the principal manual for principals", () => {
    const list = manualsForRole("PRINCIPAL");
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "principal");
  });

  it("returns only the co-ordinator manual for exam co-ordinators", () => {
    const list = manualsForRole("EXAM_COORDINATOR");
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "coordinator");
  });

  it("returns only the teacher manual for teachers", () => {
    const list = manualsForRole("TEACHER");
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "teacher");
  });

  it("returns every manual for platform admins", () => {
    assert.deepEqual(
      manualsForRole("PLATFORM_ADMIN").map((m) => m.id),
      HELP_MANUALS.map((m) => m.id)
    );
  });

  it("returns no manuals for unknown roles", () => {
    assert.deepEqual(manualsForRole("UNKNOWN"), []);
    assert.deepEqual(manualsForRole(undefined), []);
  });
});
