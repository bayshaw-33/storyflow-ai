import assert from "node:assert/strict";
import test from "node:test";

import { buildCreativeHandoffPackage, parseCreativeHandoff } from "../lib/creative-handoff.ts";

const legacyHandoff = JSON.stringify({
  version: 1,
  sourceProjectId: "project-1",
  title: "Episode source",
  contentType: "script",
  sourceUpdatedAt: "2026-07-17T00:00:00.000Z",
  universeId: null,
  projectBackground: "",
  worldAndOutline: "",
  characterBible: "",
  manuscript: "stale full script",
  translation: "",
  localization: "",
  createdAt: "2026-07-17T00:00:00.000Z",
});

test("a production handoff requiring a source unit rejects legacy packages without that unit", () => {
  assert.equal(parseCreativeHandoff(legacyHandoff, "project-1", "episode-2"), null);
});

test("a production handoff includes only the requested screenplay unit", () => {
  const project = {
    id: "project-1",
    title: "Scoped story",
    updatedAt: "2026-07-17T00:00:00.000Z",
    creationWorkspace: {
      documents: {
        backgroundWorld: { content: "" },
        characterBible: { content: "" },
        plotOutline: { content: "" },
      },
      screenplay: {
        arcs: [],
        units: [
          { id: "episode-1", number: 1, title: "Episode one", content: "FIRST UNIT", screenplay: null },
          { id: "episode-2", number: 2, title: "Episode two", content: "SECOND UNIT", screenplay: null },
        ],
      },
      novel: { units: [] },
      settings: { screenplayFormat: "international_production" },
    },
  };
  const handoff = buildCreativeHandoffPackage(project, "script", "episode-2");
  assert.match(handoff.manuscript, /SECOND UNIT/);
  assert.doesNotMatch(handoff.manuscript, /FIRST UNIT/);
});
