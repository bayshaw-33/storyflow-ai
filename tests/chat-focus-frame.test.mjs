import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/creation/ChatFocusFrame.tsx", import.meta.url);
const stylesPath = new URL("../components/creation/ChatFocusFrame.module.css", import.meta.url);
const workbenchPath = new URL("../components/creation/CreationWorkbench.tsx", import.meta.url);

test("chat focus frame provides a reversible accessible full-screen mode", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /useState\(false\)/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /document\.body\.style\.overflow/);
  assert.match(component, /aria-pressed=\{focused\}/);
  assert.match(component, /children/);
  assert.match(styles, /position:\s*fixed/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("creation workbench uses the shared focus frame around its AI panel", async () => {
  const source = await readFile(workbenchPath, "utf8");
  assert.match(source, /import \{ ChatFocusFrame \} from "@\/components\/creation\/ChatFocusFrame"/);
  assert.match(source, /<ChatFocusFrame[\s\S]*label=\{isZh \? "创作对话" : "Creation chat"\}/);
  assert.match(source, /chatInputRef/);
  assert.match(source, /sourceFiles\.map/);
});
