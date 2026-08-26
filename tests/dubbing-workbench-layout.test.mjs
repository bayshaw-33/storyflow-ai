import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("app/dubbing-workbench/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("dubbing workbench uses bounded two-column layout with a flexible result column", () => {
  assert.match(css, /\.dubbing-workbench-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*0\.8fr\)\s+minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.dubbing-review-panel[^}]*min-width:\s*0/s);
  assert.match(css, /\.dubbing-line-list[^}]*min-width:\s*0/s);
});

test("dubbing result cards keep audio controls in normal flow", () => {
  assert.doesNotMatch(css, /\.dubbing-line-card[^}]*position:\s*absolute/s);
  assert.match(css, /\.dubbing-line-actions[^}]*min-width:\s*0/s);
  assert.match(page, /<audio controls/);
});

test("settings navigation is explicit and form controls cannot submit navigation", () => {
  assert.match(page, /href="\/settings"/);
  assert.match(page, /type="button"/);
  assert.doesNotMatch(page, /<button[^>]*onClick=\{\(\) => router\./);
});
