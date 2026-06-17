#!/usr/bin/env node
// KIIKIS DX — Asset validation. Runs before build (prebuild) and blocks on
// integrity failures: missing asset files or duplicate manifest keys.
// Orphan tokens (defined but unreferenced) are reported as warnings.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const MANIFEST = join(ROOT, "lib", "design", "manifest.ts");

function fail(msg) {
  console.error(`❌ [validate-assets] ${msg}`);
}

const text = readFileSync(MANIFEST, "utf8");

// resolve `const PREFIX = "/design/..."`
const prefixes = {};
for (const m of text.matchAll(/const\s+(\w+)\s*=\s*"(\/design\/[^"]+)";/g)) {
  prefixes[m[1]] = m[2];
}

// collect ASSET entries: TOKEN: `${PREFIX}/rest`
const tokens = {};
const duplicates = [];
for (const m of text.matchAll(/^\s*(\w+):\s*`\$\{(\w+)\}\/(.+?)`,?\s*$/gm)) {
  const [, token, prefix, rest] = m;
  if (tokens[token]) duplicates.push(token);
  const base = prefixes[prefix];
  if (!base) {
    fail(`token ${token} uses unknown prefix ${prefix}`);
    continue;
  }
  tokens[token] = `${base}/${rest}`;
}

const tokenNames = Object.keys(tokens);
let missing = 0;

for (const [token, publicPath] of Object.entries(tokens)) {
  const filePath = join(ROOT, "public", publicPath);
  if (!existsSync(filePath)) {
    fail(`MISSING FILE for ${token}: public${publicPath}`);
    missing += 1;
  }
}

// orphan tokens — referenced anywhere in source besides their definition?
function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if ([".ts", ".tsx"].includes(extname(name))) acc.push(full);
  }
}
const files = [];
for (const d of ["app", "components", "lib"]) {
  const p = join(ROOT, d);
  if (existsSync(p)) walk(p, files);
}
const corpus = files.map((f) => readFileSync(f, "utf8")).join("\n");
const orphans = tokenNames.filter((t) => {
  const count = (corpus.match(new RegExp(`\\b${t}\\b`, "g")) || []).length;
  return count <= 1; // only the manifest definition
});

console.log(
  `[validate-assets] ${tokenNames.length} tokens · ${missing} missing · ${duplicates.length} duplicate · ${orphans.length} orphan`,
);
if (duplicates.length) fail(`DUPLICATE KEYS: ${duplicates.join(", ")}`);
if (orphans.length) console.warn(`⚠️  [validate-assets] orphan tokens (warning): ${orphans.join(", ")}`);

if (missing > 0 || duplicates.length > 0) {
  fail("BUILD BLOCKED — fix asset integrity errors above.");
  process.exit(1);
}
console.log("✅ [validate-assets] asset integrity OK");
