/**
 * Phase 5 Task 5.3 — 美术台回归 + 谱系分离 (RED).
 *
 * Verifies:
 *   - 现有 ArtWorkbench 导出不回归（回归护栏）
 *   - 角色/场景/道具只在美术类别中区分（不产生新的顶级工作流）
 *   - Character Identity 与 Work Local Appearance / Asset Version 分离
 *
 * Run: node --test tests/art-workbench-production-regressions.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createArtAsset,
  createEmptyArtWorkbenchState,
  getArtWorkbenchStorageKey,
  buildArtImagePrompt,
} from "../lib/art-workbench.ts";
import {
  artAssetKindScope,
  separateCharacterIdentity,
} from "../lib/production/lineage.ts";

// ============================================================
// 1. 回归护栏：现有导出仍然可用
// ============================================================

test("art-workbench core exports keep working (regression guard)", () => {
  const state = createEmptyArtWorkbenchState();
  assert.equal(state.assets.length, 0);
  const asset = createArtAsset("character", { name: "阿仁" });
  assert.equal(asset.kind, "character");
  assert.ok(getArtWorkbenchStorageKey("p1", "u1").includes("p1"));
  assert.ok(buildArtImagePrompt(asset, "concept", "冷色调").length > 0);
});

// ============================================================
// 2. 角色/场景/道具只在美术类别区分
// ============================================================

test("character/scene/prop are art asset kinds, not new top-level workflows", () => {
  const character = artAssetKindScope({ kind: "character" });
  const scene = artAssetKindScope({ kind: "scene" });
  const prop = artAssetKindScope({ kind: "prop" });
  assert.equal(character.scope, "character");
  assert.equal(scene.scope, "scene");
  assert.equal(prop.scope, "prop");
  // 全部仍是美术资产类别
  for (const s of [character, scene, prop]) {
    assert.equal(s.workflow, "art");
  }
});

test("artAssetKindScope rejects non-art kinds", () => {
  assert.throws(() => artAssetKindScope({ kind: "song" }), /kind/i);
});

// ============================================================
// 3. Character Identity 与 Work Local Appearance 分离
// ============================================================

test("separateCharacterIdentity splits identity from local appearance", () => {
  const asset = createArtAsset("character", {
    name: "阿仁",
    description: "废土幸存者",
  });
  const assetVersion = {
    id: "av-1",
    assetId: asset.id,
    versionNo: 1,
    storagePath: "art/owner/av-1.png",
    prompt: "冷色调概念图",
  };
  const { identity, localAppearance } = separateCharacterIdentity({
    characterId: "char-9",
    characterName: asset.name,
    asset,
    assetVersion,
  });
  assert.equal(identity.characterId, "char-9");
  assert.equal(identity.characterName, "阿仁");
  assert.equal(localAppearance.workId, asset.projectId ?? "unknown");
  assert.equal(localAppearance.assetVersionId, "av-1");
  assert.equal(localAppearance.storagePath, "art/owner/av-1.png");
  // identity 不含 storage path；appearance 不含 character id
  assert.equal(identity.storagePath, undefined);
  assert.equal(localAppearance.characterId, undefined);
});
