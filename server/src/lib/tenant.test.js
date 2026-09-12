import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSlug, publicSchool, schoolCreateData, slugifyName } from "./tenant.js";

describe("slugifyName", () => {
  it("turns a school name into a lowercase hyphenated code", () => {
    assert.equal(slugifyName("Greenfield Public School"), "greenfield-public-school");
    assert.equal(slugifyName("  St. Mary's  "), "st-mary-s");
  });
});

describe("parseSlug", () => {
  it("accepts simple codes", () => {
    assert.deepEqual(parseSlug("greenfield"), { value: "greenfield" });
    assert.deepEqual(parseSlug("Riverside-HS"), { value: "riverside-hs" });
  });

  it("rejects reserved and invalid codes", () => {
    assert.match(parseSlug("admin").error, /reserved/);
    assert.match(parseSlug("A").error, /2–40/);
    assert.match(parseSlug("has_underscore").error, /lowercase letters/);
    assert.match(parseSlug("").error, /required/);
  });
});

describe("schoolCreateData", () => {
  it("requires a name and fills slug from it", () => {
    const { value } = schoolCreateData({ name: "Riverside High", board: "CISCE" });
    assert.equal(value.slug, "riverside-high");
    assert.equal(value.board, "CISCE");
    assert.equal(value.status, "ACTIVE");
  });

  it("rejects a blank name", () => {
    assert.equal(schoolCreateData({}).error, "School name is required");
  });
});

describe("publicSchool", () => {
  it("exposes identity fields and optional stats", () => {
    const row = publicSchool(
      {
        id: "s1",
        slug: "greenfield",
        name: "Greenfield",
        board: "CBSE",
        affiliationNo: "1",
        address: "x",
        phone: "1",
        email: "a@b.c",
        status: "ACTIVE",
        createdAt: "t",
        updatedAt: "t",
        passPercent: 50,
      },
      { staffCount: 8 }
    );
    assert.equal(row.slug, "greenfield");
    assert.equal(row.staffCount, 8);
    assert.equal(row.passPercent, undefined);
  });
});
