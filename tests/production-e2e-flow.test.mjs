/**
 * Phase 5 Task 5.3 — 全链谱系：剧本→美术→分镜→视频 (RED).
 *
 * Verifies:
 *   - 剧本场→美术试做自动创建 source Checkpoint
 *   - Art/Storyboard/Video 复用同 projectId、独立 workId、来源版本可追溯
 *   - 视频 Job 绑定 Shot/Storyboard Version/Model/Provider
 *   - Provider URL 只用于 ingestion；ready 后 Asset Version 指向持久 storage
 *   - 上游变化：产物保留标 stale；继续旧版或新建候选，不自动删除替换
 *
 * Run: node --test tests/production-e2e-flow.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveWorkId,
  fromScriptScene,
  buildChain,
  markUpstreamChanged,
  resolveStale,
  videoJobBinding,
  isTemporaryProviderUrl,
  finalizeToPersistentStorage,
} from "../lib/production/lineage.ts";

const PROJECT = "proj-1";
const SCENE_ID = "scene-1";
const SCENE_VERSION = "wv-scene-1";

test("script scene → art try-out auto-creates a source checkpoint", () => {
  const art = fromScriptScene({
    kind: "art",
    projectId: PROJECT,
    sceneId: SCENE_ID,
    sceneVersionId: SCENE_VERSION,
  });
  assert.equal(art.sourceWorkId, "work:screenplay");
  assert.equal(art.sourceVersionId, SCENE_VERSION);
  assert.equal(art.checkpointId, `checkpoint:${SCENE_ID}:${SCENE_VERSION}`);
  assert.equal(art.projectId, PROJECT);
});

test("art/storyboard/video share projectId but own distinct stable workIds", () => {
  const art = deriveWorkId(PROJECT, "art");
  const storyboard = deriveWorkId(PROJECT, "storyboard");
  const video = deriveWorkId(PROJECT, "video");
  assert.notEqual(art, storyboard);
  assert.notEqual(storyboard, video);
  assert.notEqual(art, video);
  // 稳定：同一输入得到同一 id
  assert.equal(deriveWorkId(PROJECT, "art"), art);
});

test("chain lineage is fully traceable to the script version", () => {
  const chain = buildChain({
    projectId: PROJECT,
    art: { sourceVersionId: SCENE_VERSION, workId: deriveWorkId(PROJECT, "art") },
    storyboard: { sourceWorkId: deriveWorkId(PROJECT, "art"), sourceVersionId: "av-1", workId: deriveWorkId(PROJECT, "storyboard") },
    video: { sourceWorkId: deriveWorkId(PROJECT, "storyboard"), sourceVersionId: "sbv-1", workId: deriveWorkId(PROJECT, "video") },
  });
  assert.equal(chain.length, 3);
  const video = chain.find((n) => n.kind === "video");
  assert.equal(video.sourceWorkId, deriveWorkId(PROJECT, "storyboard"));
  // 回溯：video → storyboard → art → screenplay
  const storyboard = chain.find((n) => n.kind === "storyboard");
  assert.equal(storyboard.sourceWorkId, deriveWorkId(PROJECT, "art"));
  const art = chain.find((n) => n.kind === "art");
  assert.equal(art.sourceWorkId, "work:screenplay");
  assert.equal(art.sourceVersionId, SCENE_VERSION);
});

test("video job binds shot, storyboard version, model and provider", () => {
  const job = videoJobBinding({
    shotId: "shot-3",
    storyboardVersionId: "sbv-1",
    model: "video-model-x",
    provider: "provider-a",
  });
  assert.equal(job.shotId, "shot-3");
  assert.equal(job.storyboardVersionId, "sbv-1");
  assert.equal(job.model, "video-model-x");
  assert.equal(job.provider, "provider-a");
});

test("provider URL is temporary during ingestion; ready points to persistent storage", () => {
  assert.equal(isTemporaryProviderUrl("https://provider-a.example/tasks/123/out.mp4"), true);
  assert.equal(isTemporaryProviderUrl("https://cdn.example.com/owner/video/av-9.mp4"), false);
  const asset = finalizeToPersistentStorage({
    temporaryUrl: "https://provider-a.example/tasks/123/out.mp4",
    storagePath: "video/owner/av-9.mp4",
  });
  assert.equal(asset.storagePath, "video/owner/av-9.mp4");
  assert.equal(asset.temporaryUrl, null, "temp URL is dropped once persisted");
  assert.equal(asset.ready, true);
});

test("upstream change keeps artifacts, marks stale, never auto-deletes", () => {
  const chain = buildChain({
    projectId: PROJECT,
    art: { sourceVersionId: SCENE_VERSION, workId: deriveWorkId(PROJECT, "art") },
    storyboard: { sourceWorkId: deriveWorkId(PROJECT, "art"), sourceVersionId: "av-1", workId: deriveWorkId(PROJECT, "storyboard") },
    video: { sourceWorkId: deriveWorkId(PROJECT, "storyboard"), sourceVersionId: "sbv-1", workId: deriveWorkId(PROJECT, "video") },
  });
  const after = markUpstreamChanged({
    chain,
    upstreamWorkId: deriveWorkId(PROJECT, "art"),
    newUpstreamVersionId: "av-2",
  });
  const storyboard = after.find((n) => n.kind === "storyboard");
  assert.equal(storyboard.stale, true, "downstream marked stale");
  assert.equal(storyboard.sourceVersionId, "av-1", "old version kept");
  assert.equal(after.length, 3, "nothing deleted");

  // 继续旧版：保持 stale=false、版本不变
  const keepOld = resolveStale({ chain: after, workId: storyboard.workId, resolution: "keep_old" });
  const sbKeep = keepOld.find((n) => n.kind === "storyboard");
  assert.equal(sbKeep.stale, false);
  assert.equal(sbKeep.sourceVersionId, "av-1");

  // 新建候选：保留旧产物，新增 candidate 指向新上游
  const withCandidate = resolveStale({ chain: after, workId: storyboard.workId, resolution: "new_candidate", newSourceVersionId: "av-2" });
  const sbCandidate = withCandidate.find((n) => n.kind === "storyboard");
  assert.equal(sbCandidate.stale, true, "original kept as-is");
  assert.ok(withCandidate.some((n) => n.kind === "storyboard_candidate" && n.sourceVersionId === "av-2"));
});

test("fromScriptScene requires a script version for the checkpoint", () => {
  assert.throws(
    () => fromScriptScene({ kind: "art", projectId: PROJECT, sceneId: SCENE_ID, sceneVersionId: "" }),
    /剧本版本|sceneVersionId/i,
  );
});
