import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("art workbench reserves the global navigation and keeps medium viewports unclipped", async () => {
  const [component, globalStyles, workbenchStyles, collapseStyles] = await Promise.all([
    read("../components/art/ArtWorkbench.tsx"),
    read("../app/globals.css"),
    read("../components/art/ArtWorkbench.module.css"),
    read("../components/art/ArtWorkbenchCollapse.module.css"),
  ]);

  assert.match(component, /className=\{`\$\{styles\.page\} art-workbench-page`\}/);
  assert.match(globalStyles, /\.art-workbench-page[\s\S]*padding-left:\s*var\(--workspace-nav-offset\)/);
  assert.doesNotMatch(workbenchStyles, /minmax\((?:320|340|440|520)px/);
  assert.match(collapseStyles, /grid-template-columns:minmax\(0,38fr\) minmax\(0,62fr\)/);
  assert.doesNotMatch(collapseStyles, /minmax\(340px,38fr\)/);
});

test("setup entry resets stale local state and cloud projects are merged", async () => {
  const component = await read("../components/art/ArtWorkbench.tsx");

  assert.match(component, /params\.get\("setup"\) === "1"/);
  assert.match(component, /readProjectsFromSupabase/);
  assert.match(component, /mergeArtProjects/);
});

test("reference images are uploaded and sent to MiniMax as image_url content", async () => {
  const [component, route, storage] = await Promise.all([
    read("../components/art/ArtWorkbench.tsx"),
    read("../app/api/art/chat/route.ts"),
    read("../lib/supabase/art-storage.ts"),
  ]);

  assert.match(component, /\/api\/art\/upload-reference/);
  assert.match(route, /type:\s*"image_url"/);
  assert.match(route, /attachment\.url/);
  assert.match(storage, /\["image\/png", "image\/jpeg", "image\/webp"\]\.includes\(contentType\)/);
});

test("local persistence failures are visible to the creator", async () => {
  const [component, detail] = await Promise.all([
    read("../components/art/ArtWorkbench.tsx"),
    read("../components/art/ArtAssetDetail.tsx"),
  ]);
  assert.match(component, /setNotice\("本地保存空间不足/);
  assert.match(detail, /\/api\/art\/upload-reference/);
  assert.match(detail, /storagePath:\s*payload\.storagePath/);
  assert.match(detail, /setNotice\("本地保存空间不足/);
});
