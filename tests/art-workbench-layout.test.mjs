import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/art/ArtWorkbench.tsx", import.meta.url);
const stylesheetPath = new URL("../components/art/ArtWorkbench.module.css", import.meta.url);
const collapseStylesheetPath = new URL("../components/art/ArtWorkbenchCollapse.module.css", import.meta.url);

test("art workbench collapses the repository, preserves chat and the golden ratio", async () => {
  const [component, stylesheet, collapseStylesheet] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesheetPath, "utf8"),
    readFile(collapseStylesheetPath, "utf8"),
  ]);

  assert.match(component, /const \[isRepositoryCollapsed, setIsRepositoryCollapsed\] = useState\(false\)/);
  assert.match(component, /aria-expanded=\{!isRepositoryCollapsed\}/);
  assert.match(component, /collapseStyles\.workspace/);
  assert.match(component, /isRepositoryCollapsed \? collapseStyles\.repositoryCollapsed : ""/);
  assert.match(stylesheet, /grid-template-columns:minmax\(0,38fr\) minmax\(0,62fr\)/);
  assert.match(collapseStylesheet, /38\.2fr/);
  assert.match(collapseStylesheet, /61\.8fr/);
  assert.match(collapseStylesheet, /\.repositoryCollapsed\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.doesNotMatch(collapseStylesheet, /\.messages[^}]*display:none/);
  assert.match(collapseStylesheet, /@media\(max-width:760px\)/);
});
