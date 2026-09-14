import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCustomStaffRole,
  displayStaffRole,
  listStaffRoles,
  normalizeCustomStaffRoles,
  parseNewStaffRole,
  resolveAssignedRole,
} from "./staffRoles.js";

describe("normalizeCustomStaffRoles", () => {
  it("filters invalid entries and defaults baseRole", () => {
    assert.deepEqual(
      normalizeCustomStaffRoles([
        { id: "a", name: "HOD", baseRole: "TEACHER" },
        { id: "", name: "Bad" },
        { name: "No id" },
        { id: "b", name: "VP", baseRole: "EXAM_COORDINATOR" },
        { id: "c", name: "Clerk", baseRole: "NOPE" },
      ]),
      [
        { id: "a", name: "HOD", baseRole: "TEACHER", system: false },
        { id: "b", name: "VP", baseRole: "EXAM_COORDINATOR", system: false },
        { id: "c", name: "Clerk", baseRole: "TEACHER", system: false },
      ]
    );
  });
});

describe("parseNewStaffRole", () => {
  it("requires a name and rejects reserved system labels", () => {
    assert.equal(parseNewStaffRole({}).error, "Role name is required");
    assert.equal(parseNewStaffRole({ name: "Teacher" }).error, "That role already exists");
    assert.equal(parseNewStaffRole({ name: "Principal" }).error, "That role name is reserved");
  });

  it("creates a custom role with default teacher access", () => {
    const parsed = parseNewStaffRole({ name: "Librarian" });
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.role.name, "Librarian");
    assert.equal(parsed.role.baseRole, "TEACHER");
    assert.match(parsed.role.id, /^sr_/);
  });
});

describe("resolveAssignedRole", () => {
  const custom = [{ id: "sr_1", name: "HOD Science", baseRole: "TEACHER" }];

  it("resolves custom roles by id", () => {
    assert.deepEqual(resolveAssignedRole({ customRoleId: "sr_1" }, custom, { canAssignCoordinator: true }), {
      role: "TEACHER",
      roleTitle: "HOD Science",
      customRoleId: "sr_1",
    });
  });

  it("blocks coordinator-level custom roles for non-principals", () => {
    const roles = [{ id: "sr_2", name: "Deputy", baseRole: "EXAM_COORDINATOR" }];
    assert.equal(
      resolveAssignedRole({ customRoleId: "sr_2" }, roles, { canAssignCoordinator: false }).error,
      "Only the principal can assign coordinator-level roles"
    );
  });

  it("clears roleTitle for system roles when roleTitle is empty", () => {
    assert.deepEqual(
      resolveAssignedRole({ role: "TEACHER", roleTitle: "" }, custom, { canAssignCoordinator: true }),
      { role: "TEACHER", roleTitle: null, customRoleId: null }
    );
  });
});

describe("listStaffRoles / display / add", () => {
  it("lists system and custom roles", () => {
    const listed = listStaffRoles([{ id: "sr_1", name: "HOD", baseRole: "TEACHER" }], {
      includeCoordinator: true,
    });
    assert.equal(listed[0].id, "TEACHER");
    assert.equal(listed[1].id, "EXAM_COORDINATOR");
    assert.equal(listed[2].name, "HOD");
  });

  it("displays custom title when present", () => {
    assert.equal(displayStaffRole({ role: "TEACHER", roleTitle: "Librarian" }), "Librarian");
    assert.equal(displayStaffRole({ role: "TEACHER" }), "Teacher");
  });

  it("rejects duplicate custom names", () => {
    const existing = [{ id: "sr_1", name: "HOD", baseRole: "TEACHER" }];
    assert.equal(addCustomStaffRole(existing, { id: "sr_2", name: "hod", baseRole: "TEACHER" }).error, "A role with that name already exists");
    assert.equal(addCustomStaffRole(existing, { id: "sr_2", name: "Librarian", baseRole: "TEACHER" }).roles.length, 2);
  });
});
