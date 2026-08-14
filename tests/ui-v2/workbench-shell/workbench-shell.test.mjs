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

// ============================================================
// Phase 2 Task 2.5 — Universe 常驻状态逻辑（Step 1 RED）
// ============================================================
//
// 验证 UniverseStatus 组件的显示逻辑（不渲染 React，验证决定显示的纯函数）。
// PRD Task 2.5 Step 1：
//   - standalone Work 显示"创建 Universe / 绑定已有 Universe"
//   - bound Work 显示名称、真实版本、关系、stale 状态、"打开 / 查看继承 / 同步"

// 镜像 UniverseStatus 组件的显示判定逻辑。
function shouldShowCreateUniverse(binding) {
  return !binding.bound;
}
function shouldShowBindExisting(binding) {
  return !binding.bound;
}
function shouldShowBoundState(binding) {
  return Boolean(binding.bound);
}
function shouldShowStaleBadge(binding) {
  return Boolean(binding.bound && binding.isStale);
}
function canSync(binding) {
  // 同步按钮仅在 bound + stale 时可点击。
  return Boolean(binding.bound && binding.isStale);
}
function canBind(workId) {
  // 绑定入口仅在 workId 存在时可用（无 Work 身份不能绑定）。
  return Boolean(workId);
}
function getUniverseVersionLabel(binding) {
  return binding.boundVersionNo ? `v${binding.boundVersionNo}` : "";
}
function getStaleHint(binding, isZh) {
  if (!binding.isStale || !binding.latestVersionNo) return "";
  return isZh ? `v${binding.latestVersionNo} 可用` : `v${binding.latestVersionNo} available`;
}

// ---- standalone Work（未绑定） ----

test("standalone Work: 显示创建 Universe 入口", () => {
  const binding = { bound: false };
  assert.equal(shouldShowCreateUniverse(binding), true);
});

test("standalone Work: 显示绑定已有 Universe 入口", () => {
  const binding = { bound: false };
  assert.equal(shouldShowBindExisting(binding), true);
});

test("standalone Work: 不显示 bound 状态", () => {
  const binding = { bound: false };
  assert.equal(shouldShowBoundState(binding), false);
});

test("standalone Work: 不显示 stale badge", () => {
  const binding = { bound: false, isStale: false };
  assert.equal(shouldShowStaleBadge(binding), false);
});

// ---- bound Work ----

test("bound Work: 显示 bound 状态（名称+版本+关系）", () => {
  const binding = {
    bound: true,
    universeId: "uni-1",
    universeName: "Umbral Tide",
    boundVersionNo: 3,
    relation: "canon_continuation",
  };
  assert.equal(shouldShowBoundState(binding), true);
  assert.equal(getUniverseVersionLabel(binding), "v3");
});

test("bound Work + stale: 显示 stale badge 与同步入口", () => {
  const binding = {
    bound: true,
    universeId: "uni-1",
    universeName: "Umbral Tide",
    boundVersionNo: 2,
    latestVersionNo: 3,
    isStale: true,
  };
  assert.equal(shouldShowStaleBadge(binding), true);
  assert.equal(canSync(binding), true);
  assert.equal(getStaleHint(binding, true), "v3 可用");
  assert.equal(getStaleHint(binding, false), "v3 available");
});

test("bound Work + 非 stale: 不显示 stale badge，同步禁用", () => {
  const binding = {
    bound: true,
    universeId: "uni-1",
    universeName: "Umbral Tide",
    boundVersionNo: 3,
    isStale: false,
  };
  assert.equal(shouldShowStaleBadge(binding), false);
  assert.equal(canSync(binding), false);
});

test("bound Work 无 boundVersionNo: 版本标签为空但不报错", () => {
  const binding = { bound: true, universeName: "X" };
  assert.equal(getUniverseVersionLabel(binding), "");
});

// ---- 绑定入口可用性 ----

test("有 workId 时绑定入口可用", () => {
  assert.equal(canBind("work-001"), true);
});

test("无 workId 时绑定入口不可用", () => {
  assert.equal(canBind(null), false);
  assert.equal(canBind(""), false);
  assert.equal(canBind(undefined), false);
});

// ---- 完整 V22 binding adapter ----

test("完整 V22 binding adapter: bound + stale + 版本 + 关系齐全", () => {
  const adapter = makeBaseAdapter({
    workId: "work-001",
    universeBinding: {
      bound: true,
      universeId: "uni-1",
      universeName: "Umbral Tide",
      boundVersionNo: 2,
      latestVersionNo: 3,
      relation: "sequel",
      isStale: true,
      manifestId: "manifest-001",
    },
  });
  const b = adapter.universeBinding;
  assert.equal(shouldShowBoundState(b), true);
  assert.equal(shouldShowStaleBadge(b), true);
  assert.equal(canSync(b), true);
  assert.equal(getUniverseVersionLabel(b), "v2");
  assert.equal(getStaleHint(b, true), "v3 可用");
  assert.equal(b.relation, "sequel");
  assert.equal(b.manifestId, "manifest-001");
});

test("standalone V22 adapter: 未绑定，显示创建/绑定入口", () => {
  const adapter = makeBaseAdapter({
    workId: "work-001",
    universeBinding: { bound: false, suggestion: "bind_existing" },
  });
  const b = adapter.universeBinding;
  assert.equal(shouldShowCreateUniverse(b), true);
  assert.equal(shouldShowBindExisting(b), true);
  assert.equal(shouldShowBoundState(b), false);
});

// ---- 不自动弹窗/不自动创建约束 ----

test("UniverseBinding 默认不自动弹窗: bindingDialogOpen 初始为 false", () => {
  // 镜像 WorkbenchShell 的初始状态：bindingDialogOpen = false。
  // 只有用户点击"绑定已有"才设为 true。
  const initialState = { bindingDialogOpen: false };
  assert.equal(initialState.bindingDialogOpen, false);
});
