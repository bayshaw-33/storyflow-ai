/**
 * Phase 5 Task 5.6 — 确定性导出包 (RED).
 *
 * Verifies:
 *   - 同一 Work Version 重复导出 manifest/hash 一致（确定性）
 *   - 媒体文件从持久 storage 读取；临时 URL 不进包
 *   - manifest 可反查每个成果的来源 Work/Version/Asset/Job
 *
 * Run: node --test tests/v2-production-package.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeterministicPackage,
  packageManifest,
  resolveArtifactOrigin,
} from "../lib/export/deterministic-package.ts";

const INPUT = {
  ownerId: "owner-1",
  projectId: "proj-1",
  works: [
    { workType: "script", workId: "work-script", versionId: "v-s-1", contentHash: "hash-s" },
    { workType: "art", workId: "work-art", versionId: "v-a-1", contentHash: "hash-a" },
    { workType: "video", workId: "work-video", versionId: "v-v-1", contentHash: "hash-v" },
  ],
  artifacts: [
    { path: "art/av-1.png", storagePath: "art/owner/av-1.png", assetVersionId: "av-1", jobId: "job-art-1" },
    { path: "video/final.mp4", storagePath: "video/owner/final.mp4", assetVersionId: "av-9", jobId: "job-video-1" },
  ],
  now: new Date("2026-08-16T00:00:00Z"),
};

test("same inputs → identical manifest hash (deterministic)", () => {
  const first = buildDeterministicPackage(INPUT);
  const second = buildDeterministicPackage(INPUT);
  assert.equal(first.manifestHash, second.manifestHash);
  assert.equal(first.package.sha256, second.package.sha256);
});

test("different inputs → different hash", () => {
  const changed = buildDeterministicPackage({ ...INPUT, works: [...INPUT.works, { workType: "voice", workId: "work-voice", versionId: "v-vo-1", contentHash: "hash-vo" }] });
  assert.notEqual(changed.manifestHash, buildDeterministicPackage(INPUT).manifestHash);
});

test("artifact media comes from persistent storage; temp URLs excluded", () => {
  const pkg = buildDeterministicPackage(INPUT);
  assert.ok(pkg.artifacts.every((a) => a.storagePath.startsWith("art/") || a.storagePath.startsWith("video/")));
  assert.ok(pkg.artifacts.every((a) => !a.storagePath.includes("tasks/")), "no provider temp URLs");
  assert.ok(pkg.package.files.every((f) => !f.path.includes("secrets")));
});

test("manifest resolves every artifact origin to Work/Version/Asset/Job", () => {
  const pkg = buildDeterministicPackage(INPUT);
  const manifest = packageManifest(pkg);
  assert.equal(manifest.artifacts.length, 2);
  for (const artifact of manifest.artifacts) {
    const origin = resolveArtifactOrigin(artifact, manifest);
    assert.ok(origin.workId, "origin work");
    assert.ok(origin.workVersionId, "origin version");
    assert.equal(origin.assetVersionId, artifact.assetVersionId);
    assert.equal(origin.jobId, artifact.jobId);
  }
});
