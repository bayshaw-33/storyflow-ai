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

test("non-script workbench layout remains frozen; only approved script viewport rules are excluded", () => {
  const withoutScriptRules = css => css
    .replace(/\n\.scriptShell[^{}]*\{[^}]*\}/g, '')
    .replace(/\n@media \(max-width: 1180px\) \{\n  \.scriptShell[\s\S]*?\n\}\n/g, '\n')
    .replace(/(\*\/\n)\n(@media \(max-width: 980px\))/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n');
  for (const path of frozenFiles) {
    const current = readFileSync(new URL(path, root), "utf8");
    const base = execFileSync("git", ["show", `origin/main:${path}`], {
      cwd: new URL(root).pathname,
      encoding: "utf8",
    });
    assert.equal(withoutScriptRules(current), withoutScriptRules(base), `${path} changed outside the approved script-only viewport fix`);
  }
});

test("top-level production stages remain unchanged", () => {
  assert.deepEqual([...UNIFIED_PRODUCTION_STAGES], ["script", "art", "storyboard", "video", "editing"]);
});

test("white-model editor geometry remains the established viewport plus 250px inspector", () => {
  const css = readFileSync(new URL("components/production/WhiteModelPrevis.module.css", root), "utf8");
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+250px/);
});
