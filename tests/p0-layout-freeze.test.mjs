import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import { UNIFIED_PRODUCTION_STAGES } from "../lib/contracts/v2/unified-workbench.ts";

const root = new URL("../", import.meta.url);
const frozenFiles = [
  "components/production/ProductionWorkbench.module.css",
  "components/production/WhiteModelPrevis.module.css",
  "components/v2/workbench-shell/workbench-shell.module.css",
  "app/globals.css",
];

test("frozen workbench layout files remain byte-identical to origin main", () => {
  for (const path of frozenFiles) {
    const current = readFileSync(new URL(path, root), "utf8");
    const base = execFileSync("git", ["show", `origin/main:${path}`], {
      cwd: new URL(root).pathname,
      encoding: "utf8",
    });
    assert.equal(current, base, `${path} changed despite the layout freeze`);
  }
});

test("top-level production stages remain unchanged", () => {
  assert.deepEqual([...UNIFIED_PRODUCTION_STAGES], ["script", "art", "storyboard", "video", "editing"]);
});

test("white-model editor geometry remains the established viewport plus 250px inspector", () => {
  const css = readFileSync(new URL("components/production/WhiteModelPrevis.module.css", root), "utf8");
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+250px/);
});
