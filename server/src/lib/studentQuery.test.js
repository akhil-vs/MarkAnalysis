import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_CLASS_SECTION_IDS, parseClassSectionIds } from "./studentQuery.js";

describe("parseClassSectionIds", () => {
  it("keeps a class roster and drops blanks", () => {
    const parsed = parseClassSectionIds(" a , a , b ");
    assert.deepEqual(parsed.ids, ["a", "b"]);
    assert.equal(parsed.error, null);
  });

  it("refuses a list longer than a roster", () => {
    const ids = Array.from({ length: MAX_CLASS_SECTION_IDS + 1 }, (_, i) => `sec-${i}`);
    const parsed = parseClassSectionIds(ids.join(","));
    assert.equal(parsed.ids.length, MAX_CLASS_SECTION_IDS + 1);
    assert.match(parsed.error, /at most 40/);
  });
});
