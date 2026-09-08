import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { __test } from "./timetableSchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  "../../prisma/migrations/20260908103000_teacher_timetable/migration.sql"
);

describe("timetableSchema bootstrap", () => {
  it("embeds statements matching the prisma migration file checksum", () => {
    const fileChecksum = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
    assert.equal(__test.MIGRATION_CHECKSUM, fileChecksum);
    assert.equal(__test.MIGRATION_NAME, "20260908103000_teacher_timetable");
    assert.equal(__test.MIGRATION_STATEMENTS.length, 11);
    assert.match(__test.MIGRATION_STATEMENTS[0], /CREATE TABLE "Period"/);
    assert.match(__test.MIGRATION_STATEMENTS[1], /CREATE TABLE "TimetableEntry"/);
  });
});
