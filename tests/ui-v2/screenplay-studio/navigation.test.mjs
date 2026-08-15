/**
 * Phase 3 Task 3.3 — free navigation & soft gates.
 *
 * Verifies:
 *   - any unit node is openable regardless of upstream finalized state
 *   - empty content shows suggestions but “继续创作” stays available
 *   - only formal actions (batch production / publish / license / delivery)
 *     check Finalized; draft try-outs (art/storyboard/voice) auto-freeze a
 *     source Checkpoint instead of blocking
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

test("empty units show suggestions while 继续创作 stays available", () => {
  const suggestion = emptyUnitSuggestion("scene");
  assert.ok(Array.isArray(suggestion.hints) && suggestion.hints.length > 0);
  assert.equal(suggestion.canContinue, true);
  for (const type of ["world", "character", "outline", "episode", "scene"]) {
    const s = emptyUnitSuggestion(type);
    assert.equal(s.canContinue, true, `${type} continue must stay available`);
  }
});
