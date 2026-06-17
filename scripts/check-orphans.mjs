#!/usr/bin/env node
// KIIKIS DX — check-orphans. Reports component files that are never imported
// anywhere (dead UI), so repeated cleanup isn't a manual hunt.

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

const ROOT = process.cwd();

function walk(dir, acc) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if ([".ts", ".tsx"].includes(extname(name))) acc.push(full);
  }
}

const sourceFiles = [];
for (const d of ["app", "components", "lib"]) walk(join(ROOT, d), sourceFiles);
const corpus = sourceFiles.map((f) => ({ f, text: readFileSync(f, "utf8") }));

const componentFiles = [];
walk(join(ROOT, "components"), componentFiles);

const orphans = [];
for (const file of componentFiles) {
  const name = basename(file, extname(file));
  // is the module name referenced (imported) by any *other* file?
  const referenced = corpus.some(
    ({ f, text }) => f !== file && new RegExp(`\\b${name}\\b`).test(text),
  );
  if (!referenced) orphans.push(file.replace(ROOT + "\\", "").replace(ROOT + "/", ""));
}

if (orphans.length) {
  console.warn(`⚠️  [check-orphans] ${orphans.length} orphan component(s):`);
  for (const o of orphans) console.warn(`   · ${o}`);
} else {
  console.log("✅ [check-orphans] no orphan components");
}
