/**
 * Phase 6 Task 6.3 — Evidence 校验助手单测（Step 7 逻辑层）。
 * Run: node --test e2e/support/v22-evidence.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

import {
  parseManifest,
  verifyManifestSha256,
  validateReferences,
  validateEvidenceZip,
} from "./v22-evidence.ts";
import { sampleEvidenceManifest, sampleTimeline, JourneyData } from "./v22-test-data.ts";

test("parseManifest 接受 kiikis.package/1，拒绝未知 schema", () => {
  const manifest = parseManifest(JSON.stringify(sampleEvidenceManifest()));
  assert.equal(manifest.schemaVersion, "kiikis.package/1");
  assert.throws(() => parseManifest(JSON.stringify({ schemaVersion: "kiikis.package/999" })), /unsupported/);
});

test("verifyManifestSha256 与确定性包一致", () => {
  const json = JSON.stringify(sampleEvidenceManifest());
  const hash = createHash("sha256").update(json).digest("hex");
  assert.equal(verifyManifestSha256(json, hash), true);
  assert.equal(verifyManifestSha256(json, "deadbeef"), false);
});

test("validateReferences 检查 Work/Version/Job/Asset 引用闭合", () => {
  const good = validateReferences(sampleEvidenceManifest());
  assert.equal(good.valid, true);
  const broken = validateReferences(sampleEvidenceManifest({ artifacts: [{ path: "x", storagePath: "", assetVersionId: "av-1", jobId: "job-1" }] }));
  assert.equal(broken.valid, false);
  assert.ok(broken.errors.some((e) => e.includes("storagePath")));
});

test("validateEvidenceZip 完整校验（sha256 不符 → invalid）", () => {
  const json = JSON.stringify(sampleEvidenceManifest());
  const hash = createHash("sha256").update(json).digest("hex");
  assert.equal(validateEvidenceZip({ manifestJson: json, expectedSha256: hash }).valid, true);
  assert.equal(validateEvidenceZip({ manifestJson: json, expectedSha256: "bad" }).valid, false);
});

test("sampleTimeline 是合法 kiikis.timeline/1", () => {
  const timeline = sampleTimeline();
  assert.equal(timeline.schemaVersion, "kiikis.timeline/1");
  assert.ok(timeline.tracks.length >= 1);
});

test("JourneyData 生成 owner-scoped 测试数据且可追踪清理", () => {
  const data = new JourneyData("market");
  assert.ok(data.scope.ownerId.startsWith("journey-owner-"));
  assert.ok(data.scope.projectId.includes("market"));
  assert.ok(data.scope.marker.includes("v22-journey:market"));
  data.track("publication", "pub-1");
  assert.equal(data.createdResources.length, 1);
});
