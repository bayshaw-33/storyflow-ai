import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/art/ArtWorkbench.tsx", import.meta.url);
const stylesheetPath = new URL("../components/art/ArtWorkbench.module.css", import.meta.url);
const collapseStylesheetPath = new URL("../components/art/ArtWorkbenchCollapse.module.css", import.meta.url);

test("art workbench provides an accessible 48px assistant rail without changing the expanded 38:62 ratio", async () => {
  const [component, stylesheet, collapseStylesheet] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesheetPath, "utf8"),
    readFile(collapseStylesheetPath, "utf8"),
  ]);

  assert.match(component, /const \[isAssistantCollapsed, setIsAssistantCollapsed\] = useState\(false\)/);
  assert.match(component, /aria-expanded=\{!isAssistantCollapsed\}/);
  assert.match(component, /collapseStyles\.workspace/);
  assert.match(component, /isAssistantCollapsed \? collapseStyles\.assistantCollapsed : ""/);
  assert.match(stylesheet, /grid-template-columns:minmax\(340px,38fr\) minmax\(520px,62fr\)/);
  assert.match(collapseStylesheet, /\.assistantCollapsed\{grid-template-columns:48px minmax\(0,1fr\)\}/);
  assert.match(collapseStylesheet, /@media\(max-width:760px\)/);
});
