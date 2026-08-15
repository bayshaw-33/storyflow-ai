/**
 * Phase 5 Task 5.2 — 歌曲 prompt 派生摘要 (RED).
 *
 * songDevelopmentNotes 降级为派生摘要：只用于旧项目导入，不再回写为事实源。
 * Verifies:
 *   - deriveDevelopmentSummary 从真实消息派生摘要（不丢失用户最新意图）
 *   - 摘要不可再作为事实源回写（导入标记 legacy_import）
 *   - 歌曲显式关联支持 Universe/角色/作品/集/场景 usage role
 *
 * Run: node --test tests/song-prompt.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import { deriveDevelopmentSummary, isLegacyImportContent } from "../lib/song/prompt.ts";
import { buildSongUsageLinks } from "../lib/song/universe-links.ts";

// ============================================================
// 1. Derived summary
// ============================================================

test("deriveDevelopmentSummary keeps the latest user intent visible", () => {
  const messages = [
    { role: "user", content: "写一首废土情歌" },
    { role: "assistant", content: "好的。" },
    { role: "user", content: "副歌更克制" },
  ];
  const summary = deriveDevelopmentSummary(messages);
  assert.ok(summary.includes("副歌更克制"), "latest intent survives in summary");
  assert.ok(summary.includes("废土情歌"), "original intent survives too");
  assert.ok(summary.includes("3"), "message count surfaced");
});

test("empty ledger → neutral summary", () => {
  const summary = deriveDevelopmentSummary([]);
  assert.equal(typeof summary, "string");
  assert.ok(summary.length > 0);
});

// ============================================================
// 2. Legacy import marker
// ============================================================

test("legacy import content is marked and cannot be mistaken for facts", () => {
  const marked = "【legacy_import】旧版创作沟通记录：…";
  assert.equal(isLegacyImportContent(marked), true);
  assert.equal(isLegacyImportContent("副歌更克制"), false);
});

// ============================================================
// 3. Explicit song universe/character/scene links
// ============================================================

test("buildSongUsageLinks maps song roles to work usage roles", () => {
  const links = buildSongUsageLinks({
    ownerId: "owner-1",
    sourceWorkId: "work-song-1",
    sourceWorkVersionId: "wv-song-1",
    targetProjectId: "proj-1",
    targetWorkId: "work-drama-1",
    characterId: "char-9",
    episodeId: "ep-2",
    sceneId: "sc-4",
  });
  assert.ok(links.some((l) => l.usageRole === "diegetic_song"));
  assert.ok(links.some((l) => l.usageRole === "character_theme"));
  assert.ok(links.some((l) => l.usageRole === "episode_theme"));
  assert.ok(links.some((l) => l.usageRole === "scene_cue"));
  for (const link of links) {
    assert.equal(link.sourceWorkId, "work-song-1");
    assert.equal(link.targetWorkId, "work-drama-1");
  }
});

test("no character → no character_theme link", () => {
  const links = buildSongUsageLinks({
    ownerId: "owner-1",
    sourceWorkId: "work-song-1",
    sourceWorkVersionId: "wv-song-1",
    targetProjectId: "proj-1",
    targetWorkId: "work-drama-1",
    characterId: null,
    episodeId: null,
    sceneId: null,
  });
  assert.ok(links.every((l) => l.usageRole !== "character_theme"));
  assert.ok(links.every((l) => l.usageRole !== "episode_theme"));
  assert.ok(links.every((l) => l.usageRole !== "scene_cue"));
});
