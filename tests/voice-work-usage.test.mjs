/**
 * Phase 5 Task 5.4 — 配音显式关系 + 真人声音保护 (RED).
 *
 * Verifies:
 *   - 角色声音绑定 Character → Voice Identity
 *   - 台词绑定 Scene / Dialogue Line / Text Version
 *   - 替换配音不改变已定稿剪辑（append-only，finalized 剪辑不变）
 *   - voice clone 缺授权：仅可私有试用，不可公开/商业（服务端 enforce）
 *
 * Run: node --test tests/voice-work-usage.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVoiceUsageLinks,
  replaceDubbing,
  privateTrialOnly,
} from "../lib/voice/queries.ts";

// ============================================================
// 1. 显式关系
// ============================================================

test("character voice binds Character → Voice Identity", () => {
  const links = buildVoiceUsageLinks({
    sourceWorkId: "work-voice-1",
    sourceWorkVersionId: "wv-voice-1",
    targetProjectId: "proj-1",
    targetWorkId: "work-drama-1",
    characterId: "char-9",
    voiceIdentityId: "vi-3",
  });
  const characterVoice = links.find((l) => l.usageRole === "character_voice");
  assert.ok(characterVoice, "character_voice link exists");
  assert.equal(characterVoice.targetEntityType, "character");
  assert.equal(characterVoice.targetEntityId, "char-9");
  assert.equal(characterVoice.voiceIdentityId, "vi-3");
});

test("dialogue line binds Scene / Dialogue Line / Text Version", () => {
  const links = buildVoiceUsageLinks({
    sourceWorkId: "work-voice-1",
    sourceWorkVersionId: "wv-voice-1",
    targetProjectId: "proj-1",
    targetWorkId: "work-drama-1",
    sceneId: "sc-4",
    dialogueLineId: "dl-7",
    textVersionId: "tv-2",
  });
  const dialogue = links.find((l) => l.usageRole === "dialogue_line");
  assert.ok(dialogue, "dialogue_line link exists");
  assert.equal(dialogue.targetEntityType, "scene");
  assert.equal(dialogue.targetEntityId, "sc-4");
  assert.equal(dialogue.dialogueLineId, "dl-7");
  assert.equal(dialogue.textVersionId, "tv-2");
});

// ============================================================
// 2. 替换配音不改变已定稿剪辑
// ============================================================

test("replacing dubbing appends a new version; finalized editing stays untouched", () => {
  const finalized = { id: "edit-1", versionNo: 3, finalizedAt: "2026-08-10T00:00:00Z", dubbingId: "voice-old" };
  const result = replaceDubbing({
    editingWorkId: "work-edit-1",
    finalizedEditingVersion: finalized,
    newDubbingId: "voice-new",
  });
  assert.equal(result.finalizedEditingVersion.id, "edit-1");
  assert.equal(result.finalizedEditingVersion.dubbingId, "voice-old", "finalized editing unchanged");
  assert.equal(result.newDubbingLink.sourceDubbingId, "voice-new");
  assert.equal(result.newDubbingLink.finalizedEditingVersionId, null, "new link never claims the finalized version");
});

// ============================================================
// 3. 真人声音保护（服务端 enforce）
// ============================================================

test("voice clone without authorization is private-trial only", () => {
  const trial = privateTrialOnly({
    voiceIdentityId: "vi-3",
    isRealPerson: true,
    cloneAuthorized: false,
  });
  assert.equal(trial.canUsePrivately, true);
  assert.equal(trial.canPublish, false);
  assert.equal(trial.canCommercial, false);
  assert.equal(trial.reason.length > 0, true);
});

test("authorized clone or non-real-person voice can publish", () => {
  const authorized = privateTrialOnly({
    voiceIdentityId: "vi-3",
    isRealPerson: true,
    cloneAuthorized: true,
  });
  assert.equal(authorized.canPublish, true);
  assert.equal(authorized.canCommercial, true);

  const synthetic = privateTrialOnly({
    voiceIdentityId: "vi-4",
    isRealPerson: false,
    cloneAuthorized: false,
  });
  assert.equal(synthetic.canPublish, true);
});
