import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildUnifiedWorkbenchUrl,
  parseUnifiedWorkbenchQuery,
} from "../../../lib/contracts/v2/unified-workbench.ts";
import { resolveWorkbenchRoute } from "../../../lib/client/v2/navigation/resolver.ts";
import { buildProductionJumpUrl } from "../../../lib/workflow/can-jump.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("audiovisual work types share the production route and preserve stage", () => {
  const expected = {
    script: "script",
    art: "art",
    storyboard: "storyboard",
    video: "video",
  };
  for (const [workType, tab] of Object.entries(expected)) {
    assert.equal(
      resolveWorkbenchRoute(workType, { projectId: "p1", workId: "w1" }),
      `/production?projectId=p1&workId=w1&tab=${tab}`,
    );
  }
});

test("unified workbench URL round-trips an optional unit", () => {
  const url = buildUnifiedWorkbenchUrl({
    projectId: "p1",
    workId: "w1",
    tab: "script",
    unitId: "u1",
  });
  assert.equal(url, "/production?projectId=p1&workId=w1&tab=script&unitId=u1");
  assert.deepEqual(parseUnifiedWorkbenchQuery(url.split("?")[1]), {
    projectId: "p1",
    workId: "w1",
    tab: "script",
    unitId: "u1",
  });
});

test("unified workbench permits an empty stage without a work id", () => {
  assert.equal(
    buildUnifiedWorkbenchUrl({ projectId: "p1", tab: "art" }),
    "/production?projectId=p1&tab=art",
  );
});

test("dynamic storyboard is never accepted as a production stage", () => {
  assert.equal(
    parseUnifiedWorkbenchQuery("projectId=p1&workId=w1&tab=grid").tab,
    "storyboard",
  );
});

test("legacy production modes normalize to unified stages", () => {
  const expected = {
    art: "art",
    planning: "storyboard",
    grid: "storyboard",
    dynamic: "storyboard",
    editor: "video",
  };
  for (const [mode, stage] of Object.entries(expected)) {
    assert.equal(
      parseUnifiedWorkbenchQuery(`projectId=p1&mode=${mode}`).tab,
      stage,
    );
  }
});

test("creation-to-production jumps always carry an explicit canonical tab", () => {
  const context = { projectId: "p1", sourceUnitId: "u1" };
  const expected = {
    planning: "storyboard",
    art: "art",
    editor: "video",
    dub: "video",
    edit: "video",
  };

  for (const [mode, tab] of Object.entries(expected)) {
    assert.equal(
      buildProductionJumpUrl(context, mode),
      `/production?projectId=p1&tab=${tab}&unitId=u1`,
    );
  }
});

test("CreationWorkbench delegates downstream route decisions to the shared jump builder", () => {
  const source = read("../../../components/creation/CreationWorkbench.tsx");
  assert.match(source, /buildProductionJumpUrl/);
  assert.doesNotMatch(source, /router\.push\(`\/production\?/);
});

test("authenticated workbench client uses the shared screenplay auth transport", () => {
  const source = read("../../../lib/client/v2/unified-workbench/api.ts");
  assert.match(source, /fetchScreenplayStudio/);
  assert.match(source, /workbench-context/);
  assert.match(source, /workbench-stages/);
  assert.match(source, /idempotency-key/);
});
