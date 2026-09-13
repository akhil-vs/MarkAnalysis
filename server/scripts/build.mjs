#!/usr/bin/env node
/**
 * Express deploy build: emit the Prisma contract, then stage a runnable
 * artifact under dist/ for workflows that deploy build output only.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(root, "..");
const distRoot = path.join(serverRoot, "dist");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: serverRoot,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function copyIfExists(relativePath) {
  const from = path.join(serverRoot, relativePath);
  const to = path.join(distRoot, relativePath);
  try {
    await cp(from, to, { recursive: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return;
    throw err;
  }
}

run("npx", ["prisma", "contract", "emit"]);

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });

for (const relativePath of [
  "src",
  "prisma",
  "migrations",
  "prisma.config.ts",
  "package-lock.json",
]) {
  await copyIfExists(relativePath);
}

const pkg = JSON.parse(await readFile(path.join(serverRoot, "package.json"), "utf8"));
const distPkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  type: "module",
  scripts: {
    start: "node src/index.js",
  },
  engines: pkg.engines,
  dependencies: pkg.dependencies,
};
await writeFile(path.join(distRoot, "package.json"), `${JSON.stringify(distPkg, null, 2)}\n`);

console.log(`Build complete: ${distRoot}`);
