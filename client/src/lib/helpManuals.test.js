import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_HELP_PDFS, APPLICATION_FLOWS, HELP_MANUALS, manualsForRole } from "./helpManuals.js";

describe("manualsForRole", () => {
  it("returns flows + principal manual for principals", () => {
    const list = manualsForRole("PRINCIPAL");
    assert.deepEqual(
      list.map((m) => m.id),
      ["flows", "principal"]
    );
    assert.equal(list[0], APPLICATION_FLOWS);
  });

  it("returns flows + co-ordinator manual for exam co-ordinators", () => {
    assert.deepEqual(
      manualsForRole("EXAM_COORDINATOR").map((m) => m.id),
      ["flows", "coordinator"]
    );
  });

  it("returns flows + teacher manual for teachers", () => {
    assert.deepEqual(
      manualsForRole("TEACHER").map((m) => m.id),
      ["flows", "teacher"]
    );
  });

  it("returns every PDF for platform admins", () => {
    assert.deepEqual(
      manualsForRole("PLATFORM_ADMIN").map((m) => m.id),
      ALL_HELP_PDFS.map((m) => m.id)
    );
    assert.equal(ALL_HELP_PDFS.length, HELP_MANUALS.length + 1);
  });

  it("returns no manuals for unknown roles", () => {
    assert.deepEqual(manualsForRole("UNKNOWN"), []);
    assert.deepEqual(manualsForRole(undefined), []);
  });
});
