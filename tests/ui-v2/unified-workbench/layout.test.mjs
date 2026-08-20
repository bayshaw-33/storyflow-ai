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
  assert.match(source, /styles\.actionBar/);
  assert.doesNotMatch(source, /styles\.header/);
  assert.doesNotMatch(source, /titleInput/);
  const declarations = [...css.matchAll(/grid-template-columns:\s*([^;]+)/g)].map((match) => match[1].trim());
  assert.ok(declarations.some((value) => value.includes("minmax(260px, 280px)")));
  assert.doesNotMatch(css, /grid-template-columns:\s*repeat\(3/);
});

test("production parses the shared query contract and uses context/ensure APIs", async () => {
  const source = await read("../../../components/production/ProductionWorkbench.tsx");
  assert.match(source, /parseUnifiedWorkbenchQuery/);
  assert.match(source, /fetchUnifiedWorkbenchContext/);
  assert.match(source, /ensureUnifiedStage/);
  assert.match(source, /buildUnifiedWorkbenchUrl/);
  assert.match(source, /(?:context|displayContext)\.stages\[stage\]/);
});

test("stage switching does not create a missing stage automatically", async () => {
  const source = await read("../../../components/production/ProductionWorkbench.tsx");
  const handler = source.match(/const handleStageChange[\s\S]*?\n\s*};/);
  assert.ok(handler, "stage change handler must exist");
  assert.doesNotMatch(handler[0], /ensureUnifiedStage/);
  assert.match(source, /const startStage[\s\S]*?ensureUnifiedStage/);
});

test("production header exposes four tab buttons and a tab panel", async () => {
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
