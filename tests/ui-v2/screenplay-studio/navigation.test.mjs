/**
 * KIIKIS V2.2 — trilogy checkpoints and downstream gates.
 *
 * Verifies:
 *   - any unit node is openable regardless of upstream finalized state
 *   - existing units remain openable for revision
 *   - new downstream work requires usable upstream checkpoints
 *   - similarity review belongs to the outline stage
 *
 * Run: node --test tests/ui-v2/screenplay-studio/navigation.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  canOpenUnit,
  formalActionRequiresFinalized,
  draftTryoutPolicy,
  emptyUnitSuggestion,
  canCreateUnit,
  isUsableCheckpoint,
  similarityReviewBelongsTo,
} from "../../../lib/client/v2/screenplay-studio/types.ts";

// ============================================================
// 1. Free navigation: never blocked by upstream readiness
// ============================================================

test("any unit can be opened regardless of upstream finalized state", () => {
  for (const readiness of ["empty", "draft", "checkpoint", "finalized"]) {
    for (const dependencyState of ["current", "stale", "conflict"]) {
      assert.equal(
        canOpenUnit({ type: "scene", readiness, dependencyState }),
        true,
        `scene/${readiness}/${dependencyState} must be openable`,
      );
    }
  }
  // Even nonexistent upstream content never blocks opening a node.
  assert.equal(canOpenUnit({ type: "episode", readiness: "empty", dependencyState: "stale" }), true);
});

test("downstream creation waits for usable trilogy checkpoints", () => {
  const empty = [];
  assert.equal(canCreateUnit("world", empty), true);
  assert.equal(canCreateUnit("character", empty), false);

  const world = [{ type: "world", readiness: "checkpoint", finalizedVersionId: "wv-1" }];
  assert.equal(canCreateUnit("character", world), true);
  assert.equal(canCreateUnit("outline", world), false);

  const trilogy = [
    ...world,
    { type: "character", readiness: "finalized", finalizedVersionId: "cv-1" },
    { type: "outline", readiness: "checkpoint", finalizedVersionId: "ov-1" },
  ];
  assert.equal(canCreateUnit("episode", trilogy), true);
  assert.equal(canCreateUnit("scene", trilogy), false);
  assert.equal(canCreateUnit("scene", [...trilogy, { type: "episode", readiness: "checkpoint", finalizedVersionId: "ev-1" }]), true);
});

test("usable checkpoint means user-confirmed checkpoint or finalized version", () => {
  assert.equal(isUsableCheckpoint({ readiness: "checkpoint", finalizedVersionId: null }), true);
  assert.equal(isUsableCheckpoint({ readiness: "finalized", finalizedVersionId: "v1" }), true);
  assert.equal(isUsableCheckpoint({ readiness: "draft", finalizedVersionId: null }), false);
  assert.equal(similarityReviewBelongsTo, "outline");
});

// ============================================================
// 2. Soft gates: only formal actions check Finalized
// ============================================================

test("formal actions require finalized; draft try-outs never block", () => {
  const formalActions = ["batch_production", "publish", "license", "official_delivery"];
  for (const action of formalActions) {
    assert.equal(formalActionRequiresFinalized(action), true, `${action} requires finalized`);
  }
  // draft try-outs auto-freeze a checkpoint instead of blocking
  const policy = draftTryoutPolicy("storyboard_tryout");
  assert.equal(policy.blocked, false);
  assert.equal(policy.autoFreeze, "checkpoint");
  // editing/chatting are not formal
  assert.equal(formalActionRequiresFinalized("edit_draft"), false);
  assert.equal(formalActionRequiresFinalized("kk_chat"), false);
  assert.equal(formalActionRequiresFinalized("unknown_action"), false);
});

// ============================================================
// 3. Empty unit suggestions (soft onboarding, never a gate)
// ============================================================

test("empty units show focused suggestions while 继续创作 stays available", () => {
  const suggestion = emptyUnitSuggestion("scene");
  assert.ok(Array.isArray(suggestion.hints) && suggestion.hints.length > 0);
  assert.equal(suggestion.canContinue, true);
  for (const type of ["world", "character", "outline", "episode", "scene"]) {
    const s = emptyUnitSuggestion(type);
    assert.equal(s.canContinue, true, `${type} continue must stay available`);
    assert.equal(s.hints.some((hint) => /跳过|直接开写|边写正文/.test(hint)), false, `${type} must not suggest bypassing the workflow`);
  }
});
