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
  resolveArtDraftKey,
  recoverLegacyArtDraft,
  collectArtStoragePaths,
  replaceArtVersionPreviewUrls,
  canPersistArtDraft,
  appendArtVersions,
  approveArtAssetVersion,
  backupCorruptedArtDraft,
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

test("same project different Work IDs receive different embedded draft/archive scopes", () => {
  const first = resolveArtDraftKey({ userId: "u1", projectId: "p1", workId: "art-1" });
  const second = resolveArtDraftKey({ userId: "u1", projectId: "p1", workId: "art-2" });

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
  assert.match(first, /u1/);
  assert.match(first, /p1/);
  assert.match(first, /art-1/);
});

test("embedded Art scope refuses to fall back to an unscoped key", () => {
  assert.equal(resolveArtDraftKey({ userId: "u1", projectId: "p1" }), null);
  assert.equal(resolveArtDraftKey({ userId: "u1", workId: "art-1" }), null);
  assert.equal(resolveArtDraftKey({ projectId: "p1", workId: "art-1" }), null);
});

test("legacy embedded draft is copied into the new user/work scope without deleting the original", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const legacyKey = getArtWorkbenchStorageKey("p1", "episode-1");
  const nextKey = resolveArtDraftKey({ userId: "u1", projectId: "p1", workId: "art-1" });
  const legacy = { ...createEmptyArtWorkbenchState(), id: "legacy", assets: [createArtAsset("character", { id: "char-old", name: "旧角色" })] };
  storage.setItem(legacyKey, JSON.stringify(legacy));

  const result = recoverLegacyArtDraft(storage, legacyKey, nextKey);

  assert.equal(result.mode, "restored");
  assert.equal(result.assetCount, 1);
  assert.equal(JSON.parse(storage.getItem(nextKey)).assets[0].id, "char-old");
  assert.equal(JSON.parse(storage.getItem(legacyKey)).assets[0].id, "char-old", "legacy copy remains as recovery backup");
});

test("existing new-scope draft is not overwritten; legacy draft is exposed as an archive", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const legacyKey = getArtWorkbenchStorageKey("p1", "episode-1");
  const nextKey = resolveArtDraftKey({ userId: "u1", projectId: "p1", workId: "art-1" });
  storage.setItem(legacyKey, JSON.stringify({ ...createEmptyArtWorkbenchState(), id: "legacy", title: "旧草稿", assets: [createArtAsset("character", { id: "old" })] }));
  storage.setItem(nextKey, JSON.stringify({ ...createEmptyArtWorkbenchState(), id: "current", assets: [createArtAsset("scene", { id: "new" })] }));

  const result = recoverLegacyArtDraft(storage, legacyKey, nextKey);

  assert.equal(result.mode, "archived");
  assert.equal(JSON.parse(storage.getItem(nextKey)).assets[0].id, "new");
  const index = JSON.parse(storage.getItem(`${nextKey}__archive_index`));
  assert.equal(index[0].title, "旧草稿");
  assert.equal(JSON.parse(storage.getItem(`${nextKey}__archive_${index[0].id}`)).assets[0].id, "old");
});

test("stored art paths can receive fresh signed preview URLs after an old URL expires", () => {
  const state = createEmptyArtWorkbenchState();
  const asset = createArtAsset("character", { id: "char-1" });
  asset.variants = [{ id: "master", name: "母版", type: "master", prompt: "", versions: [
      { id: "v1", imageUrl: "https://expired.example/old", storagePath: "u1/p1/generated/char-1/1.png", source: "generated", prompt: "", createdAt: "2026-08-01T00:00:00Z" },
    ] }];
  state.assets = [asset];
  assert.deepEqual(collectArtStoragePaths(state), ["u1/p1/generated/char-1/1.png"]);
  const refreshed = replaceArtVersionPreviewUrls(state, { "u1/p1/generated/char-1/1.png": "https://fresh.example/new" });
  assert.equal(refreshed.assets[0].variants[0].versions[0].imageUrl, "https://fresh.example/new");
});

test("expired Supabase preview URLs recover their durable art storage paths", () => {
  const state = createEmptyArtWorkbenchState();
  const asset = createArtAsset("character", { id: "legacy-char" });
  asset.variants = [{ id: "master", name: "母版", type: "master", prompt: "", versions: [
    { id: "v1", imageUrl: "https://demo.supabase.co/storage/v1/object/sign/art-assets/u1/p1/generated/legacy-char/old.png?token=expired", source: "generated", prompt: "", createdAt: "2026-08-01T00:00:00Z" },
  ] }];
  state.assets = [asset];
  assert.deepEqual(collectArtStoragePaths(state), ["u1/p1/generated/legacy-char/old.png"]);
  const refreshed = replaceArtVersionPreviewUrls(state, { "u1/p1/generated/legacy-char/old.png": "https://fresh.example/legacy" });
  assert.equal(refreshed.assets[0].variants[0].versions[0].storagePath, "u1/p1/generated/legacy-char/old.png");
  assert.equal(refreshed.assets[0].variants[0].versions[0].imageUrl, "https://fresh.example/legacy");
});

test("autosave is blocked while a different storage scope is hydrating", () => {
  assert.equal(canPersistArtDraft({ storageReady: true, storageKey: "new-work", hydratedStorageKey: "old-work" }), false);
  assert.equal(canPersistArtDraft({ storageReady: false, storageKey: "new-work", hydratedStorageKey: "new-work" }), false);
  assert.equal(canPersistArtDraft({ storageReady: true, storageKey: "new-work", hydratedStorageKey: "new-work" }), true);
});

test("late image-generation results append to their original variant without erasing newer edits", () => {
  const asset = createArtAsset("character", { id: "char-1", name: "编辑后的名字" });
  asset.identityAnchor = "用户等待生成时补充的身份锚点";
  asset.variants = [
    { id: "master", name: "母版", type: "master", prompt: "new prompt", versions: [] },
    { id: "look-2", name: "造型二", type: "appearance", prompt: "look 2", versions: [] },
  ];
  const next = appendArtVersions(asset, "master", [
    { id: "v1", imageUrl: "https://fresh/1", storagePath: "u/p/1.png", source: "generated", prompt: "old prompt", createdAt: "2026-09-01T00:00:00Z" },
  ]);
  assert.equal(next.name, "编辑后的名字");
  assert.equal(next.identityAnchor, "用户等待生成时补充的身份锚点");
  assert.equal(next.variants.find((variant) => variant.id === "master").versions[0].id, "v1");
  assert.equal(next.variants.find((variant) => variant.id === "look-2").versions.length, 0);
});

test("approving an image persists variant approval and asset approval atomically", () => {
  const asset = createArtAsset("character", { id: "char-1" });
  asset.variants = [{ id: "master", name: "母版", type: "master", prompt: "", versions: [
    { id: "v1", imageUrl: "https://fresh/1", storagePath: "u/p/1.png", source: "generated", prompt: "", createdAt: "2026-09-01T00:00:00Z" },
  ] }];
  const approved = approveArtAssetVersion(asset, "master", "v1");
  assert.equal(approved.variants[0].approvedVersionId, "v1");
  assert.equal(approved.approvedVersionId, "v1");
  assert.equal(approved.referenceSheetUrl, "https://fresh/1");
  assert.equal(approved.status, "ready");
});

test("corrupted draft bytes are backed up before the UI starts an empty recovery draft", () => {
  const values = new Map([["scope", "{broken-json"]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const backupKey = backupCorruptedArtDraft(storage, "scope", 1234);
  assert.equal(backupKey, "scope__corrupted_backup_1234");
  assert.equal(storage.getItem(backupKey), "{broken-json");
  assert.equal(storage.getItem("scope"), "{broken-json", "source bytes remain untouched");
});

test("embedded ArtWorkbench declares Work scope, hides standalone project navigation, and keeps asset editing reachable", async () => {
  const { readFile } = await import("node:fs/promises");
  const component = await readFile(new URL("../components/art/ArtWorkbench.tsx", import.meta.url), "utf8");

  assert.match(component, /contextWorkId\?: string/);
  assert.match(component, /resolveArtDraftKey\(/);
  assert.match(component, /isEmbedded \? null/);
  assert.match(component, /<Link className=\{styles\.assetCard\} href=\{assetDetailHref\}>\{cardContent\}<\/Link>/);
  assert.match(component, /workId: scopeWorkId/);
  assert.match(component, /\/api\/art\/sign-assets/);
  assert.match(component, /canPersistArtDraft/);
  assert.doesNotMatch(component, /embedded \? <div className=\{styles\.assetCard\}/);
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
