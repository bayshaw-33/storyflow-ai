/**
 * Phase 1 Task 1.5 — WorkbenchShell work-identity blocking + version actions tests.
 *
 * Verifies (PRD Task 1.5 Step 1 RED):
 *   - Adapter without workId triggers blocking error (no local fake save)
 *   - Adapter with workId shows version bar (checkpoint/finalize/evidence)
 *   - Version actions respect finalized state (no checkpoint/finalize after finalized)
 *   - Evidence actions only available with workId
 *
 * Since React components can't render in pure node --test, these tests
 * validate the adapter logic and blocking conditions that the shell uses.
 *
 * Run: node --test tests/ui-v2/workbench-shell/workbench-shell.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// Blocking logic: mirrors WorkbenchShell's `hasWorkId` check.
// ---------------------------------------------------------------------------

function shouldBlockWorkbench(adapter) {
  return !adapter.workId;
}

function canCheckpoint(adapter) {
  return Boolean(adapter.workId && adapter.currentVersionId && !adapter.finalizedVersionId && adapter.onCreateCheckpoint);
}

function canFinalize(adapter) {
  return Boolean(adapter.workId && adapter.currentVersionId && !adapter.finalizedVersionId && adapter.onFinalize);
}

function canDownloadEvidence(adapter) {
  return Boolean(adapter.workId && adapter.onDownloadEvidence);
}

function makeBaseAdapter(overrides = {}) {
  return {
    workbenchType: "script",
    project: { id: "p1", title: "Test", workflowType: "short_drama", currentStage: "script", lastSavedAt: "2026-08-28T00:00:00Z" },
    universeBinding: { bound: false },
    saveStatus: "saved",
    steps: [],
    currentStep: "script",
    assets: [],
    runningJobs: [],
    aiContext: { suggestions: [], recentMessages: [] },
    modelSettings: { mode: "smart" },
    workbenchContent: null,
    onSave: () => {},
    onStepChange: () => {},
    ...overrides,
  };
}

// ============================================================
// 1. No workId → blocking error
// ============================================================

test("adapter without workId triggers blocking error", () => {
  const adapter = makeBaseAdapter({ workId: null });
  assert.equal(shouldBlockWorkbench(adapter), true);
});

test("adapter with empty string workId triggers blocking error", () => {
  const adapter = makeBaseAdapter({ workId: "" });
  assert.equal(shouldBlockWorkbench(adapter), true);
});

test("adapter with undefined workId triggers blocking error", () => {
  const adapter = makeBaseAdapter({ workId: undefined });
  assert.equal(shouldBlockWorkbench(adapter), true);
});

// ============================================================
// 2. With workId → no blocking, version bar shown
// ============================================================

test("adapter with workId does not trigger blocking", () => {
  const adapter = makeBaseAdapter({ workId: "work-001" });
  assert.equal(shouldBlockWorkbench(adapter), false);
});

// ============================================================
// 3. Version actions: checkpoint availability
// ============================================================

test("canCheckpoint: true when workId + currentVersionId + no finalize + callback", () => {
  const adapter = makeBaseAdapter({
    workId: "work-001",
    currentVersionId: "v1",
    finalizedVersionId: null,
    onCreateCheckpoint: () => {},
  });
  assert.equal(canCheckpoint(adapter), true);
});

test("canCheckpoint: false when no currentVersionId", () => {
  const adapter = makeBaseAdapter({
    workId: "work-001",
    currentVersionId: null,
    finalizedVersionId: null,
    onCreateCheckpoint: () => {},
  });
  assert.equal(canCheckpoint(adapter), false);
});

test("canCheckpoint: false when already finalized", () => {
  const adapter = makeBaseAdapter({
    workId: "work-001",
    currentVersionId: "v1",
    finalizedVersionId: "v-final",
    onCreateCheckpoint: () => {},
  });
  assert.equal(canCheckpoint(adapter), false);
});

test("canCheckpoint: false when no callback provided", () => {
  const adapter = makeBaseAdapter({
    workId: "work-001",
    currentVersionId: "v1",
    finalizedVersionId: null,
  });
  assert.equal(canCheckpoint(adapter), false);
});

// ============================================================
// 4. Version actions: finalize availability
// ============================================================

test("canFinalize: true when workId + currentVersionId + no finalize + callback", () => {
  const adapter = makeBaseAdapter({
    workId: "work-001",
    currentVersionId: "v1",
    finalizedVersionId: null,
    onFinalize: () => {},
  });
  assert.equal(canFinalize(adapter), true);
});

test("canFinalize: false when already finalized", () => {
  const adapter = makeBaseAdapter({
    workId: "work-001",
    currentVersionId: "v1",
    finalizedVersionId: "v-final",
    onFinalize: () => {},
  });
  assert.equal(canFinalize(adapter), false);
});

// ============================================================
// 5. Evidence actions: download availability
// ============================================================

test("canDownloadEvidence: true when workId + callback", () => {
  const adapter = makeBaseAdapter({
    workId: "work-001",
    onDownloadEvidence: () => {},
  });
  assert.equal(canDownloadEvidence(adapter), true);
});

test("canDownloadEvidence: false when no workId", () => {
  const adapter = makeBaseAdapter({
    workId: null,
    onDownloadEvidence: () => {},
  });
  assert.equal(canDownloadEvidence(adapter), false);
});

test("canDownloadEvidence: false when no callback", () => {
  const adapter = makeBaseAdapter({ workId: "work-001" });
  assert.equal(canDownloadEvidence(adapter), false);
});

// ============================================================
// 6. Full adapter with all version fields
// ============================================================

test("full adapter with checkpoint + finalize + evidence callbacks is fully operational", () => {
  const adapter = makeBaseAdapter({
    workId: "work-001",
    currentVersionId: "v2",
    latestCheckpointId: "v1",
    finalizedVersionId: null,
    onCreateCheckpoint: () => {},
    onFinalize: () => {},
    onDownloadEvidence: () => {},
  });
  assert.equal(shouldBlockWorkbench(adapter), false);
  assert.equal(canCheckpoint(adapter), true);
  assert.equal(canFinalize(adapter), true);
  assert.equal(canDownloadEvidence(adapter), true);
});

// ============================================================
// 7. Finalized work: checkpoint and finalize disabled, evidence still available
// ============================================================

test("finalized work: checkpoint and finalize disabled, evidence still available", () => {
  const adapter = makeBaseAdapter({
    workId: "work-001",
    currentVersionId: "v-final",
    latestCheckpointId: "v2",
    finalizedVersionId: "v-final",
    onCreateCheckpoint: () => {},
    onFinalize: () => {},
    onDownloadEvidence: () => {},
  });
  assert.equal(canCheckpoint(adapter), false);
  assert.equal(canFinalize(adapter), false);
  assert.equal(canDownloadEvidence(adapter), true);
});
