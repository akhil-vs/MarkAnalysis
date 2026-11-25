import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EDGE_BODY_MAX_BYTES,
  SPREADSHEET_MAX_BYTES,
} from "./uploadLimits.js";

const nginxConf = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../client/nginx.conf"),
  "utf8"
);

function nginxBodyBytes(conf) {
  const match = conf.match(/client_max_body_size\s+(\d+)\s*([kmg])?/i);
  if (!match) return 1024 * 1024;
  const amount = Number(match[1]);
  const unit = (match[2] || "").toLowerCase();
  if (unit === "g") return amount * 1024 * 1024 * 1024;
  if (unit === "k") return amount * 1024;
  if (unit === "m") return amount * 1024 * 1024;
  return amount;
}

describe("edge upload limit", () => {
  it("lets nginx accept a spreadsheet and a bulk photo request", () => {
    const allowed = nginxBodyBytes(nginxConf);
    assert.ok(allowed >= SPREADSHEET_MAX_BYTES, `nginx allows ${allowed}, spreadsheet is ${SPREADSHEET_MAX_BYTES}`);
    assert.ok(allowed >= EDGE_BODY_MAX_BYTES, `nginx allows ${allowed}, bulk photos need ${EDGE_BODY_MAX_BYTES}`);
  });
});
