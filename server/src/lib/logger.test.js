import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestLogFields } from "./logger.js";

describe("requestLogFields", () => {
  it("keeps the path and drops query values", () => {
    assert.deepEqual(requestLogFields("/api/students?q=Asha%20Nair&page=2"), {
      path: "/api/students",
      queryKeys: ["q", "page"],
    });
    assert.deepEqual(requestLogFields("/api/health"), { path: "/api/health" });
  });
});