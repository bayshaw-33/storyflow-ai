/**
 * Phase 3 Task 3.4 — KK room & candidate diff panel logic.
 *
 * Component-tree validation (pure node): the two-action semantics, per-hunk
 * accept/reject state, and failure-preserving UI states.
 *
 * Run: node --test tests/ui-v2/screenplay-studio/candidate-diff.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  KK_ACTION_MODES,
  resolveKkActionMode,
  createCandidateDiffViewModel,
  nextDiffReviewState,
} from "../../../lib/client/v2/screenplay-studio/types.ts";

// ============================================================
// 1. Two action semantics: 聊一聊 vs 生成修改方案
// ============================================================

test("kk exposes exactly two action modes with distinct semantics", () => {
  assert.deepEqual([...KK_ACTION_MODES], ["discuss", "propose_change"]);
});

test("resolveKkActionMode maps UI intents to modes", () => {
  assert.equal(resolveKkActionMode("聊一聊"), "discuss");
  assert.equal(resolveKkActionMode("讨论一下"), "discuss");
  assert.equal(resolveKkActionMode("生成修改方案"), "propose_change");
  assert.equal(resolveKkActionMode("帮我改一版"), "propose_change");
  // default is discuss — never silently rewrites content
  assert.equal(resolveKkActionMode("随便一句"), "discuss");
});

// ============================================================
// 2. Candidate diff view model: per-hunk accept/reject
// ============================================================

test("createCandidateDiffViewModel exposes per-hunk toggles and unapplied state", () => {
  const vm = createCandidateDiffViewModel({
    id: "cand-1",
    status: "pending_review",
    patches: [
      { unitPath: "scene:1", before: "旧 A", after: "新 A" },
      { unitPath: "scene:2", before: "旧 B", after: "新 B" },
    ],
  });
  assert.equal(vm.hunks.length, 2);
  assert.equal(vm.allAccepted, false);
  assert.equal(vm.anyAccepted, false);
  // accept first hunk only
  const vm2 = nextDiffReviewState(vm, 0, true);
  assert.equal(vm2.hunks[0].accepted, true);
  assert.equal(vm2.hunks[1].accepted, false);
  assert.equal(vm2.anyAccepted, true);
  assert.equal(vm2.allAccepted, false);
});

test("candidate diff never mutates body until apply is explicit", () => {
  const vm = createCandidateDiffViewModel({
    id: "cand-2",
    status: "pending_review",
    patches: [{ unitPath: "scene:1", before: "x", after: "y" }],
  });
  const reviewed = nextDiffReviewState(vm, 0, true);
  // reviewing state is UI-only; persistence requires the apply action
  assert.equal(reviewed.persisted, false);
  assert.equal(reviewed.status, "pending_review");
});

// ============================================================
// 3. Failure protection in UI states
// ============================================================

test("generation failure keeps draft input and shows retry with same intent", () => {
  // nextDiffReviewState is for hunks; failure states are part of the view model
  const vm = createCandidateDiffViewModel({
    id: "cand-3",
    status: "failed",
    patches: [],
    error: "provider 503",
  });
  assert.equal(vm.status, "failed");
  assert.equal(vm.canRetry, true);
  assert.equal(vm.inputPreserved, true);
});
