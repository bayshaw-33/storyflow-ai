#!/usr/bin/env node
// KIIKIS DX — rebuild-assets. Regenerates a deterministic index of every file
// under /public/design so the asset surface is reproducible and diffable.

import { readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DESIGN = join(ROOT, "public", "design");
const OUT = join(ROOT, "lib", "design", "asset-index.json");

if (!existsSync(DESIGN)) {
  console.error("❌ [rebuild-assets] public/design not found");
  process.exit(1);
}

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push("/" + relative(join(ROOT, "public"), full).split("\\").join("/"));
  }
}

const files = [];
walk(DESIGN, files);
files.sort();

const index = { generatedAt: new Date().toISOString(), count: files.length, files };
writeFileSync(OUT, JSON.stringify(index, null, 2) + "\n", "utf8");
console.log(`✅ [rebuild-assets] indexed ${files.length} assets → lib/design/asset-index.json`);
