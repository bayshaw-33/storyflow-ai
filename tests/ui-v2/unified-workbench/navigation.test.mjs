import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUnifiedWorkbenchUrl,
  parseUnifiedWorkbenchQuery,
} from "../../../lib/contracts/v2/unified-workbench.ts";
import { resolveWorkbenchRoute } from "../../../lib/client/v2/navigation/resolver.ts";

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
