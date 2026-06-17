#!/usr/bin/env node
// KIIKIS DX — clean-cache. Removes build/runtime caches so issues are
// reproducible from a cold state. Preserves source and the asset manifest.

import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TARGETS = [".next", ".turbo", join("node_modules", ".cache")];

for (const target of TARGETS) {
  const path = join(ROOT, target);
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`🧹 removed ${target}`);
  } else {
    console.log(`· ${target} (already clean)`);
  }
}
console.log("✅ [clean-cache] done");
