#!/usr/bin/env node
/**
 * Recursively syntax-check application JS/JSX sources (no ESLint config yet).
 * Used by `npm run lint` in CI as a lightweight gate.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
  path.join(root, "server", "src"),
  path.join(root, "client", "src"),
  path.join(root, "e2e"),
  path.join(root, "scripts"),
];

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      await walk(full, out);
    } else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const dir of roots) await walk(dir, files);

let failed = 0;
for (const file of files) {
  // Skip JSX — node --check does not parse JSX. Covered by Vite build.
  if (file.endsWith(".jsx")) continue;
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed += 1;
    console.error(result.stderr || result.stdout || `Syntax error: ${file}`);
  }
}

if (failed) {
  console.error(`syntax-check: ${failed} file(s) failed`);
  process.exit(1);
}
console.log(`syntax-check: ${files.length} JS files OK`);
