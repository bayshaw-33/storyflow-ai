import assert from "node:assert/strict";
import test from "node:test";

import {
  autoFixScreenplayEpisode,
  renderScreenplayEpisode,
  validateScreenplayEpisode,
} from "../lib/creation/screenplay.ts";

const episode = {
  id: "episode-1",
  episodeNo: 1,
  title: "The Door",
  logline: "Ana finds the hidden door.",
  scenes: [
    {
      id: "scene-1",
      sceneNo: 1,
      interiorExterior: "INT",
      location: "KITCHEN",
      timeOfDay: "NIGHT",
      characters: ["Ana"],
      blocks: [
        { id: "action-1", type: "action", character: "", text: "Ana opens the red door.", translation: "" },
        { id: "dialogue-1", type: "dialogue", character: "Ana", text: "¿Dónde estás?", translation: "你在哪里？" },
      ],
    },
  ],
};

const languages = { screenplayLanguage: "English", dialogueLanguage: "Spanish" };

test("renders one screenplay mother model in three formats without changing story content", () => {
  const international = renderScreenplayEpisode(episode, "international_production", languages);
  const hollywood = renderScreenplayEpisode(episode, "hollywood_spec", languages);
  const asian = renderScreenplayEpisode(episode, "asian_production", languages);

  for (const output of [international, hollywood, asian]) {
    assert.match(output, /Ana opens the red door\./);
    assert.match(output, /¿Dónde estás\?/);
    assert.match(output, /你在哪里？/);
  }

  assert.match(international, /## 1-1 INT\. KITCHEN - NIGHT/);
  assert.match(international, /Characters: ANA/);
  assert.match(hollywood, /## INT\. KITCHEN - NIGHT/);
  assert.doesNotMatch(hollywood, /1-1 INT\./);
  assert.match(asian, /## 1场｜KITCHEN｜夜｜内/);
});

test("validates required production fields", () => {
  const invalid = structuredClone(episode);
  invalid.scenes[0].location = "";
  invalid.scenes[0].characters = [];

  const result = validateScreenplayEpisode(invalid, "international_production");
  assert.equal(result.valid, false);
  assert.ok(result.warnings.some((warning) => warning.code === "missing_location"));
  assert.ok(result.warnings.some((warning) => warning.code === "missing_characters"));
});

test("auto-fix is non-mutating and never rewrites dialogue", () => {
  const source = structuredClone(episode);
  source.scenes[0].location = "  Kitchen  ";
  source.scenes[0].characters = ["ana"];
  const before = structuredClone(source);

  const fixed = autoFixScreenplayEpisode(source, "international_production");

  assert.deepEqual(source, before);
  assert.equal(fixed.scenes[0].location, "Kitchen");
  assert.deepEqual(fixed.scenes[0].characters, ["ANA"]);
  assert.equal(fixed.scenes[0].blocks[1].text, "¿Dónde estás?");
  assert.equal(fixed.scenes[0].blocks[1].translation, "你在哪里？");
});
