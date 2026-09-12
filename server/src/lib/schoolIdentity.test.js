import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newJoinCode, normalizeJoinCode, slugifySchoolName } from "./schoolIdentity.js";

describe("slugifySchoolName", () => {
  it("makes a stable URL slug from a school name", () => {
    assert.equal(slugifySchoolName("Greenfield Public School"), "greenfield-public-school");
    assert.equal(slugifySchoolName("  St. Mary's  "), "st-mary-s");
    assert.equal(slugifySchoolName("***"), "school");
  });
});

describe("join codes", () => {
  it("normalizes hyphenated and compact codes", () => {
    assert.equal(normalizeJoinCode("demo-join"), "DEMO-JOIN");
    assert.equal(normalizeJoinCode("DEMOJOIN"), "DEMO-JOIN");
    assert.equal(normalizeJoinCode("abcd"), null);
    assert.equal(normalizeJoinCode(""), null);
  });

  it("issues unique ABCD-EFGH codes", () => {
    const codes = new Set(Array.from({ length: 20 }, () => newJoinCode()));
    assert.equal(codes.size, 20);
    for (const code of codes) {
      assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      assert.equal(normalizeJoinCode(code), code);
    }
  });
});
