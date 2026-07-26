import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/creation/CreationWorkbench.tsx", import.meta.url);
const redirectPath = new URL("../app/projects/[projectId]/page.tsx", import.meta.url);

test("creation workbench waits for the requested project before persisting chat history", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /const \[projectReady,\s*setProjectReady\] = useState\(false\)/);
  assert.match(source, /if \(!projectReady \|\| !project\.id \|\| chatProjectId === project\.id\) return;/);
  assert.match(source, /if \(!projectReady \|\| !project\.id \|\| chatProjectId !== project\.id/);
  assert.match(source, /if \(isDefaultWelcomeHistory\(messages\)\) return;/);
  assert.match(source, /if \(skipAutoSave\.current\) \{ skipAutoSave\.current = false; return; \}\s+if \(!projectReady\) return;/s);
});

test("legacy project route awaits params before redirecting to the creation workbench", async () => {
  const source = await readFile(redirectPath, "utf8");

  assert.match(source, /export default async function ProjectRedirect/);
  assert.match(source, /const \{\s*projectId\s*\} = await params;/);
  assert.doesNotMatch(source, /void params\.then/);
});
