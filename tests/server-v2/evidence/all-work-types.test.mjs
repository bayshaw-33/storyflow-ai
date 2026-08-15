/**
 * Phase 5 Task 5.6 — 七类 Work 横向 Evidence 覆盖 (RED).
 *
 * Verifies:
 *   - script/song/art/storyboard/video/voice/editing 全部可导出
 *     draft/checkpoint/finalized/messages/generations/choices/sources/
 *     universe/rights/hashes
 *   - 演员留痕：Actor/Portrayal/Asset Version、生成 Job、人工选择、权利声明
 *   - 临时 URL / secret / 未授权原始声音不进入包
 *
 * Run: node --test tests/server-v2/evidence/all-work-types.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_WORK_TYPES,
  buildAllWorkTypesManifest,
  actorEvidenceEntries,
  sanitizePackageEntries,
} from "../../../lib/server/v2/evidence/all-work-types.ts";

test("covers all seven work types", () => {
  assert.deepEqual(ALL_WORK_TYPES, ["script", "song", "art", "storyboard", "video", "voice", "editing"]);
});

test("every work type yields draft/checkpoint/finalized/messages/generations/choices/sources/universe/rights/hashes", () => {
  const manifest = buildAllWorkTypesManifest({
    ownerId: "owner-1",
    projectId: "proj-1",
    works: ALL_WORK_TYPES.map((t) => ({
      workType: t,
      workId: `work-${t}`,
      universeId: "universe-1",
      versions: [
        { id: `v-${t}-1`, kind: "editing_draft" },
        { id: `v-${t}-2`, kind: "checkpoint" },
        { id: `v-${t}-3`, kind: "finalized" },
      ],
      messages: 2,
      generations: 1,
      choices: 1,
      rights: { basis: "own_work" },
    })),
  });
  assert.equal(manifest.works.length, 7);
  for (const work of manifest.works) {
    assert.ok(work.hasDraft, `${work.workType} draft`);
    assert.ok(work.hasCheckpoint, `${work.workType} checkpoint`);
    assert.ok(work.hasFinalized, `${work.workType} finalized`);
    assert.ok(work.messageCount >= 2, `${work.workType} messages`);
    assert.ok(work.generationCount >= 1, `${work.workType} generations`);
    assert.ok(work.choiceCount >= 1, `${work.workType} choices`);
    assert.equal(work.universeId, "universe-1");
    assert.ok(work.rights, `${work.workType} rights`);
    assert.ok(work.versionHashes.length >= 3, `${work.workType} hashes`);
    assert.ok(work.sources !== undefined, `${work.workType} sources`);
  }
});

test("actor evidence includes portrayal, asset versions, jobs, human choices, rights", () => {
  const input = {
    actorId: "actor-1",
    actorName: "林晚",
    portrayals: [
      {
        characterId: "char-9",
        characterName: "阿仁",
        assetVersionIds: ["av-1", "av-2"],
        generationJobIds: ["job-1"],
        selectedBy: "owner-1",
        selectedAt: "2026-08-01T00:00:00Z",
        rightsDeclaration: { basis: "authorized", holder: "林晚" },
      },
    ],
  };
  const entries = actorEvidenceEntries(input);
  assert.equal(entries.length, 1);
  const e = entries[0];
  assert.equal(e.characterId, "char-9");
  assert.equal(e.assetVersionIds.length, 2);
  assert.equal(e.generationJobIds.length, 1);
  assert.equal(e.humanSelected, true);
  assert.equal(e.selectedBy, "owner-1");
  assert.equal(e.rightsDeclaration.holder, "林晚");
  assert.ok(e.evidenceHash.length > 0, "deterministic evidence hash present");
});

test("temporary URLs, secrets and unauthorized raw voice never enter the package", () => {
  const cleaned = sanitizePackageEntries([
    { path: "media/video.mp4", url: "https://provider-a.example/tasks/123/out.mp4", kind: "provider_temp" },
    { path: "media/final.mp4", url: "https://cdn.example.com/owner/final.mp4", kind: "persistent" },
    { path: "secrets/.env", content: "COSYVOICE_API_TOKEN=secret", kind: "secret" },
    { path: "voice/raw-clone.wav", url: "https://cdn.example.com/owner/raw-clone.wav", kind: "unauthorized_voice" },
    { path: "manifest.json", content: "{}", kind: "manifest" },
  ]);
  assert.deepEqual(
    cleaned.map((c) => c.path),
    ["media/final.mp4", "manifest.json"],
    "only persistent + non-secret + authorized entries survive",
  );
});
