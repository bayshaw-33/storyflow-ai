import assert from "node:assert/strict";
import test from "node:test";
import { buildCreativeHandoffPackage, parseCreativeHandoff } from "./creative-handoff.ts";

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
} as never;

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
