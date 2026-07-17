import assert from "node:assert/strict";
import test from "node:test";
import { buildCreativeHandoffPackage, parseCreativeHandoff } from "./creative-handoff.ts";
import type { DramaProject } from "./projects.ts";

const project = {
  id: "project-1",
  title: "契约之家",
  universeId: "universe-1",
  novelBrief: "项目背景",
  novelBible: "世界观与大纲",
  novelCharacters: "角色 Bible",
  novelChapterDraft: "小说正文",
  finalScript: "剧本正文",
  translation: "Translation",
  localization: "Localization",
  updatedAt: "2026-07-10T10:00:00.000Z",
} as unknown as DramaProject;

test("builds a complete creative handoff package", () => {
  const result = buildCreativeHandoffPackage(project, "script");
  assert.equal(result.sourceProjectId, "project-1");
  assert.equal(result.contentType, "script");
  assert.equal(result.projectBackground, "项目背景");
  assert.equal(result.worldAndOutline, "世界观与大纲");
  assert.equal(result.characterBible, "角色 Bible");
  assert.equal(result.manuscript, "剧本正文");
  assert.equal(result.universeId, "universe-1");
});

test("rejects a handoff for a different source project", () => {
  const serialized = JSON.stringify(buildCreativeHandoffPackage(project, "novel"));
  assert.equal(parseCreativeHandoff(serialized, "another-project"), null);
  assert.equal(parseCreativeHandoff(serialized, "project-1")?.manuscript, "小说正文");
});

test("prefers V2 screenplay content while preserving the legacy fallback", () => {
  const result = buildCreativeHandoffPackage({
    ...project,
    creationWorkspace: {
      version: 2,
      documents: {
        backgroundWorld: { content: "V2 背景", updatedAt: "2026-07-13T00:00:00.000Z" },
        characterBible: { content: "V2 角色", updatedAt: "2026-07-13T00:00:00.000Z" },
        plotOutline: { content: "V2 大纲", updatedAt: "2026-07-13T00:00:00.000Z" },
      },
      novel: { arcs: [], units: [] },
      screenplay: {
        arcs: [],
        units: [{
          id: "episode-1", number: 1, title: "第一集", outline: "", content: "V2 剧本", screenplay: null,
          continuityNotes: "", status: "reviewed", versions: [], translation: "V2 Translation",
          localizedContent: "V2 Localization", localizationChanges: "", similarityReport: "",
          createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z",
        }],
      },
      settings: {
        activeMode: "screenplay", interfaceLanguage: "zh", targetMarket: "", genre: "", sourceLanguage: "中文", translationLanguage: "英文",
        translationEnabled: true, screenplayLanguage: "中文", dialogueLanguage: "英文",
        screenplayFormat: "international_production", generationScope: "unit",
      },
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
    },
  }, "script");

  assert.equal(result.projectBackground, "V2 背景");
  assert.match(result.manuscript, /V2 剧本/);
  assert.equal(result.translation, "V2 Translation");
  assert.equal(result.localization, "V2 Localization");
});
