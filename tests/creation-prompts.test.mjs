import assert from "node:assert/strict";
import test from "node:test";

import { buildPrompt, isTaskType, taskNames } from "../lib/ai/prompts.ts";

test("supports all V2 creation tasks and approved stage names", () => {
  const tasks = [
    "creation_development_chat",
    "creation_background_world",
    "creation_character_bible",
    "creation_plot_outline",
    "creation_novel_unit",
    "creation_screenplay_unit",
    "creation_translate_unit",
    "creation_localize_unit",
  ];
  for (const task of tasks) assert.equal(isTaskType(task), true, task);
  assert.equal(taskNames.creation_background_world, "背景及世界观");
  assert.equal(taskNames.creation_character_bible, "角色圣经");
  assert.equal(taskNames.creation_plot_outline, "剧情及大纲");
});

test("development chat follows the interface language", async () => {
  const zh = await buildPrompt({ taskType: "creation_development_chat", input: "吸血鬼爱情", options: { interfaceLanguage: "zh-CN" } });
  const en = await buildPrompt({ taskType: "creation_development_chat", input: "vampire romance", options: { interfaceLanguage: "en-US" } });

  assert.match(zh, /全部回复必须使用简体中文/);
  assert.match(en, /Respond entirely in English/);
  assert.match(zh, /背景及世界观.*角色圣经.*剧情及大纲/s);
});

test("novel and screenplay unit prompts request distinct output structures", async () => {
  const novel = await buildPrompt({
    taskType: "creation_novel_unit",
    input: "写第一章",
    options: { contentMode: "novel", sourceLanguage: "English", unitNo: 1, generationScope: "unit" },
  });
  const screenplay = await buildPrompt({
    taskType: "creation_screenplay_unit",
    input: "写第一集",
    options: {
      contentMode: "screenplay",
      screenplayLanguage: "English",
      dialogueLanguage: "Spanish",
      screenplayFormat: "international_production",
      unitNo: 1,
      generationScope: "unit",
    },
  });

  assert.match(novel, /one chapter at a time|一次只生成一个章/i);
  assert.match(novel, /<CREATION_OUTPUT>/);
  assert.doesNotMatch(novel, /"screenplay"\s*:/);
  assert.match(screenplay, /structured screenplay mother model/i);
  assert.match(screenplay, /international_production/);
  assert.match(screenplay, /hollywood_spec/);
  assert.match(screenplay, /asian_production/);
  assert.match(screenplay, /Spanish/);
});

test("translation remains optional and localization returns paired audit sections", async () => {
  const translation = await buildPrompt({
    taskType: "creation_translate_unit",
    input: "source",
    options: { sourceLanguage: "English", translationLanguage: "Chinese", unitNo: 2 },
  });
  const localization = await buildPrompt({
    taskType: "creation_localize_unit",
    input: "source",
    options: { sourceLanguage: "English", targetLanguage: "Spanish", unitNo: 2 },
  });

  assert.match(translation, /optional|可跳过/i);
  assert.match(localization, /---LOCALIZED_CONTENT---/);
  assert.match(localization, /---LOCALIZATION_CHANGES---/);
  assert.match(localization, /---SIMILARITY_REPORT---/);
});
