import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as screenplay from "../lib/creation/screenplay.ts";
import * as state from "../lib/creation/state.ts";

const { createCreationWorkspace } = state;

const componentPath = new URL("../components/creation/CreationWorkbench.tsx", import.meta.url);

function screenplayUnit(status = "locked") {
  const now = "2026-07-17T00:00:00.000Z";
  return {
    id: "screenplay-unit-1",
    number: 1,
    title: "Pilot",
    outline: "",
    content: "",
    screenplay: {
      id: "episode-1",
      episodeNo: 1,
      title: "Pilot",
      logline: "A test episode.",
      scenes: [{
        id: "scene-1",
        sceneNo: 1,
        interiorExterior: "INT",
        location: "STUDIO",
        timeOfDay: "DAY",
        characters: ["ANA"],
        blocks: [{ id: "block-1", type: "dialogue", character: "ANA", text: "Hola.", translation: "Hello." }],
      }],
    },
    continuityNotes: "",
    status,
    versions: [],
    translation: "",
    localizedContent: "",
    localizationChanges: "",
    similarityReport: "",
    createdAt: now,
    updatedAt: now,
  };
}

test("creation workbench requests use neutral V2 market and genre fields", async () => {
  const workspace = createCreationWorkspace();
  assert.equal(workspace.settings.targetMarket, "");
  assert.equal(workspace.settings.genre, "");

  const source = await readFile(componentPath, "utf8");
  assert.match(source, /market:\s*requestWorkspace\.settings\.targetMarket/);
  assert.match(source, /genre:\s*requestWorkspace\.settings\.genre/);
  assert.doesNotMatch(source, /market:\s*project\.market/);
  assert.doesNotMatch(source, /genre:\s*project\.genre/);
  assert.match(source, /commitWorkspace\(\(currentWorkspace\)/);
  assert.doesNotMatch(source, /commitWorkspace\(nextWorkspace\)/);
});

test("translation updates only the requested unit and preserves shared documents", () => {
  const base = createCreationWorkspace();
  const workspace = {
    ...base,
    documents: {
      backgroundWorld: { content: "LOCKED WORLD", updatedAt: "world-version" },
      characterBible: { content: "LOCKED CHARACTERS", updatedAt: "character-version" },
      plotOutline: { content: "LOCKED OUTLINE", updatedAt: "outline-version" },
    },
    screenplay: { arcs: [], units: [screenplayUnit()] },
  };

  assert.equal(typeof state.applyUnitTranslation, "function");
  const updated = state.applyUnitTranslation(workspace, "screenplay", "screenplay-unit-1", "译文", "2026-07-17T01:00:00.000Z");

  assert.deepEqual(updated.documents, workspace.documents);
  assert.equal(updated.screenplay.units[0].translation, "译文");
  assert.equal(updated.screenplay.units[0].status, "locked");
});

test("translation source renders structured screenplay when plain content is empty", () => {
  const workspace = createCreationWorkspace();
  assert.equal(typeof screenplay.buildTranslationSource, "function");
  const source = screenplay.buildTranslationSource(workspace, "screenplay", screenplayUnit());

  assert.match(source, /STUDIO/);
  assert.match(source, /Hola\./);
  assert.ok(source.trim().length > 0);
});
