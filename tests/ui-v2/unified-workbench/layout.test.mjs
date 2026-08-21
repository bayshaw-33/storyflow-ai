import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildUnifiedWorkbenchUrl,
  parseUnifiedWorkbenchQuery,
} from "../../../lib/contracts/v2/unified-workbench.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("production exposes exactly four top-level stages", async () => {
  const source = await read("../../../components/production/ProductionWorkbench.tsx");
  assert.match(source, /script/);
  assert.match(source, /art/);
  assert.match(source, /storyboard/);
  assert.match(source, /video/);
  assert.doesNotMatch(source, /label:\s*[\"']动态分镜[\"']/);
});

test("production shell owns one approved header and no global third column", async () => {
  const page = await read("../../../app/production/page.tsx");
  const source = await read("../../../components/production/ProductionWorkbench.tsx");
  const css = await read("../../../components/production/ProductionWorkbench.module.css");
  assert.match(page, /ProductionWorkbench/);
  assert.match(source, /UnifiedProductionHeader/);
  assert.doesNotMatch(source, /className=\{styles\.header\}/);
  assert.doesNotMatch(source, /titleInput/);
  assert.doesNotMatch(source, /styles\.stageRail/);
  assert.doesNotMatch(css, /grid-template-columns:\s*repeat\(3/);
});

test("production keeps global navigation and removes the duplicate stage rail", async () => {
  const source = await read("../../../components/production/ProductionWorkbench.tsx");
  const css = await read("../../../components/production/ProductionWorkbench.module.css");
  assert.doesNotMatch(source, /dataset\.productionFocus/);
  assert.doesNotMatch(source, /styles\.stageRail/);
  assert.doesNotMatch(source, /aria-label=\"制作阶段\"/);
  assert.match(css, /padding-left:\s*120px/);
});

test("production header uses compact icon stages instead of a full-width tab row", async () => {
  const header = await read("../../../components/production/UnifiedProductionHeader.tsx");
  const css = await read("../../../components/production/ProductionWorkbench.module.css");
  assert.match(header, /FileText/);
  assert.match(header, /Palette/);
  assert.match(header, /PanelsTopLeft/);
  assert.match(header, /Video/);
  assert.match(header, /stageIconButton/);
  assert.doesNotMatch(header, /unifiedStageTabs/);
  assert.match(css, /\.stageIconButton/);
  assert.doesNotMatch(css, /\.unifiedStageTabs/);
});

test("production exposes resident Universe create bind and open actions", async () => {
  const source = await read("../../../components/production/ProductionWorkbench.tsx");
  const header = await read("../../../components/production/UnifiedProductionHeader.tsx");
  const universesPage = await read("../../../app/universes/page.tsx");
  assert.match(source, /bindWorkToUniverse/);
  assert.match(source, /UniverseBindingDialog/);
  assert.match(source, /onCreateUniverse/);
  assert.match(source, /onBindUniverse/);
  assert.match(source, /onOpenUniverse/);
  assert.match(header, /创建 Universe/);
  assert.match(header, /绑定已有/);
  assert.match(universesPage, /searchParams\.get\("create"\) === "1"/);
});

test("production parses the shared query contract and uses context/ensure APIs", async () => {
  const source = await read("../../../components/production/ProductionWorkbench.tsx");
  assert.match(source, /parseUnifiedWorkbenchQuery/);
  assert.match(source, /fetchUnifiedWorkbenchContext/);
  assert.match(source, /ensureUnifiedStage/);
  assert.match(source, /buildUnifiedWorkbenchUrl/);
  assert.match(source, /context\?\.stages\[stage\]/);
});

test("stage switching does not create a missing stage automatically", async () => {
  const source = await read("../../../components/production/ProductionWorkbench.tsx");
  const handler = source.match(/const handleStageChange[\s\S]*?\n\s*};/);
  assert.ok(handler, "stage change handler must exist");
  assert.doesNotMatch(handler[0], /ensureUnifiedStage/);
  assert.match(source, /const startStage[\s\S]*?ensureUnifiedStage/);
});

test("production header exposes four compact tab buttons and a tab panel", async () => {
  const header = await read("../../../components/production/UnifiedProductionHeader.tsx");
  assert.match(header, /UnifiedProductionHeaderProps/);
  assert.match(header, /role=\"tab\"/);
  assert.match(header, /role=\"tabpanel\"/);
  assert.match(header, /Version/);
  assert.match(header, /Evidence/);
  assert.match(header, /More/);
});

test("deep links preserve the requested art and video stages", () => {
  for (const stage of ["art", "video"]) {
    const url = buildUnifiedWorkbenchUrl({
      projectId: "project-deep-link",
      workId: `work-${stage}`,
      tab: stage,
      unitId: "unit-1",
    });
    const parsed = parseUnifiedWorkbenchQuery(url.slice(url.indexOf("?")));
    assert.equal(parsed.projectId, "project-deep-link");
    assert.equal(parsed.workId, `work-${stage}`);
    assert.equal(parsed.tab, stage);
    assert.equal(parsed.unitId, "unit-1");
  }
});
