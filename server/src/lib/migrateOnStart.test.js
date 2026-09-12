import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { __test } from "./migrateOnStart.js";

describe("migrateOnStart", () => {
  it("resolves prisma directory under server/prisma", () => {
    assert.match(__test.prismaDir.replace(/\\/g, "/"), /server\/prisma$/);
  });
});
