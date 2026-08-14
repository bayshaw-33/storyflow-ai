/**
 * tests/kiikis-21-kk-runtime.test.mjs
 * KIIKIS 2.1 Phase 3 — Task 3.3 单一全站 KK runtime 测试
 *
 * 覆盖 K21-KK-001..007:
 *   - KkRuntimeProvider 文件存在 + useKkRuntime hook 文件存在
 *   - DEFAULT_KK_RUNTIME_CONTEXT 形状
 *   - app/layout.tsx 挂载 KkRuntimeProvider + KkCompanion
 *   - app/kk/page.tsx & app/companions/page.tsx 不再 redirect
 *   - KkCompanion/KkPanel 文件改造（不再直接 fetch，从 runtime 读）
 *   - kk.module.css 含 connectionBar 样式
 *   - KkConnectionState 5 个状态完整
 *   - feature flag resolveKiikis21Flags 别名可用 (parseKiikis21Flags 别名)
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  ALL_KK_ACTIONS,
  ALL_KK_CONNECTION_STATES,
} from "../lib/client/v2/kk/types.ts";
import {
  parseKiikis21Flags,
  resolveKiikis21Flags,
  DEFAULT_KIIKIS21_FLAGS,
} from "../lib/server/v2/feature-flags.ts";

const ROOT = process.cwd();

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ============================================================
// 1. 文件存在性 (Task 3.3 deliverables)
// ============================================================

test("Task 3.3 文件全部创建", () => {
  const files = [
    "components/v2/kk/KkRuntimeProvider.tsx",
    "components/v2/kk/useKkRuntime.ts",
    "components/v2/kk/KkCompanion.tsx",
    "components/v2/kk/KkPanel.tsx",
    "app/layout.tsx",
    "app/kk/page.tsx",
    "app/kk/KkRuntimeStatusClient.tsx",
    "app/companions/page.tsx",
  ];
  for (const f of files) {
    assert.ok(exists(f), `文件缺失: ${f}`);
  }
});

test("test 文件本身存在", () => {
  assert.ok(exists("tests/kiikis-21-kk-runtime.test.mjs"));
});

// ============================================================
// 2. KkRuntimeProvider 文件结构
// ============================================================

test("KkRuntimeProvider.tsx — 导出 Provider + Context + DEFAULT_KK_RUNTIME_CONTEXT", () => {
  const src = readFile("components/v2/kk/KkRuntimeProvider.tsx");
  assert.match(src, /export function KkRuntimeProvider/);
  assert.match(src, /export (const |{ )KkRuntimeContext/);
  assert.match(src, /DEFAULT_KK_RUNTIME_CONTEXT/);
  assert.match(src, /export interface KkRuntimeContextValue/);
});

test("KkRuntimeProvider.tsx — 实现 K21-KK-001..007 关键逻辑", () => {
  const src = readFile("components/v2/kk/KkRuntimeProvider.tsx");
  // K21-KK-001 单一 runtime
  assert.match(src, /K21-KK-001/);
  // K21-KK-002 production/staging fail closed
  assert.match(src, /K21-KK-002/);
  // K21-KK-003/004 状态机 + 增量补拉
  assert.match(src, /K21-KK-003/);
  assert.match(src, /K21-KK-004/);
  assert.match(src, /polling/);
  assert.match(src, /connectionState/);
  // K21-KK-005 任务投影
  assert.match(src, /K21-KK-005/);
  // K21-KK-006 allowedActions 来自服务端
  assert.match(src, /allowedActions/);
  // K21-KK-007 事件按 sequence 单调 + 去重
  assert.match(src, /K21-KK-007/);
  assert.match(src, /seen/);
  assert.match(src, /sort\(\(a, b\) => a\.sequence - b\.sequence\)/);
});

test("KkRuntimeProvider.tsx — 暴露 refresh + pullEvents", () => {
  const src = readFile("components/v2/kk/KkRuntimeProvider.tsx");
  assert.match(src, /readonly refresh: \(\) => Promise<void>/);
  assert.match(src, /readonly pullEvents: \(\) => Promise<void>/);
});

test("KkRuntimeProvider.tsx — fixture 兜底仅 allowFixtureFallback=true 时启用 (K21-KK-002)", () => {
  const src = readFile("components/v2/kk/KkRuntimeProvider.tsx");
  assert.match(src, /allowFixtureFallback/);
  assert.match(src, /fetchKkMessages/);
});

// ============================================================
// 3. useKkRuntime hook
// ============================================================

test("useKkRuntime.ts — 导出 useKkRuntime hook + 类型", () => {
  const src = readFile("components/v2/kk/useKkRuntime.ts");
  assert.match(src, /export function useKkRuntime/);
  assert.match(src, /useContext\(KkRuntimeContext\)/);
  assert.match(src, /export type \{ KkRuntimeContextValue \}/);
});

// ============================================================
// 4. KkCompanion/KkPanel 改造（不再直接 fetch，改用 runtime）
// ============================================================

test("KkCompanion — 不再直接 fetchKkMessages，改用 useKkRuntime", () => {
  const src = readFile("components/v2/kk/KkCompanion.tsx");
  assert.match(src, /useKkRuntime/);
  // 不应再直接调用 fetchKkMessages/updateKkSettings（应该从 runtime 读）
  assert.ok(!/fetchKkMessages\(/.test(src), "KkCompanion 不应直接 fetchKkMessages");
  assert.ok(!/updateKkSettings\(/.test(src), "KkCompanion 不应直接 updateKkSettings");
  assert.match(src, /runtime\.messages/);
  assert.match(src, /runtime\.stats/);
  assert.match(src, /runtime\.connectionState/);
  assert.match(src, /runtime\.error/);
});

test("KkCompanion — 仍渲染 FAB + KkPanel", () => {
  const src = readFile("components/v2/kk/KkCompanion.tsx");
  assert.match(src, /styles\.fab/);
  assert.match(src, /<KkPanel/);
  assert.match(src, /aria-label/);
});

test("KkPanel — 新增 connectionState + errorMessage + onRefresh props", () => {
  const src = readFile("components/v2/kk/KkPanel.tsx");
  assert.match(src, /connectionState\?: KkConnectionState/);
  assert.match(src, /errorMessage\?: string \| null/);
  assert.match(src, /onRefresh\?: \(\) => void/);
  // 渲染 connection bar
  assert.match(src, /styles\.connectionBar/);
  assert.match(src, /showOfflineBar/);
  assert.match(src, /showPollingBar/);
  // refresh 按钮
  assert.match(src, /styles\.refreshBtn/);
});

test("kk.module.css — 含 connectionBar 样式", () => {
  const src = readFile("components/v2/kk/kk.module.css");
  assert.match(src, /\.connectionBar\b/);
  assert.match(src, /\.connectionBarPolling/);
  assert.match(src, /\.refreshBtn/);
});

// ============================================================
// 5. layout.tsx 挂载 Provider
// ============================================================

test("app/layout.tsx — 挂载 KkRuntimeProvider + KkCompanion", () => {
  const src = readFile("app/layout.tsx");
  assert.match(src, /import \{ KkRuntimeProvider \}/);
  assert.match(src, /import \{ KkCompanion \}/);
  assert.match(src, /<KkRuntimeProvider/);
  assert.match(src, /<KkCompanion/);
  // Provider 必须包裹 children
  const block = src.match(/<KkRuntimeProvider[^>]*>([\s\S]*?)<\/KkRuntimeProvider>/);
  assert.ok(block, "未找到 <KkRuntimeProvider> 包裹块");
  assert.ok(block[1].includes("{children}"), "children 必须在 KkRuntimeProvider 内部");
  assert.ok(block[1].includes("<KkCompanion"), "KkCompanion 必须在 KkRuntimeProvider 内部");
});

// ============================================================
// 6. /kk & /companions 不再 redirect
// ============================================================

test("K21-KK-001: app/kk/page.tsx 不再 redirect，渲染 runtime 状态页", () => {
  const src = readFile("app/kk/page.tsx");
  assert.ok(!/redirect\(/.test(src), "app/kk/page.tsx 不应再 redirect");
  assert.match(src, /KkRuntimeStatusClient/);
});

test("K21-KK-001: app/companions/page.tsx 不再 redirect，复用 /kk 的 runtime 视图", () => {
  const src = readFile("app/companions/page.tsx");
  assert.ok(!/redirect\(/.test(src), "app/companions/page.tsx 不应再 redirect");
  assert.match(src, /KkRuntimeStatusClient/);
  assert.match(src, /\.\.\/kk\/KkRuntimeStatusClient/);
});

test("KkRuntimeStatusClient — 显示连接状态 + task projection + pending confirmations", () => {
  const src = readFile("app/kk/KkRuntimeStatusClient.tsx");
  assert.match(src, /useKkRuntime/);
  assert.match(src, /runtime\.connectionState/);
  assert.match(src, /runtime\.taskProjection/);
  assert.match(src, /runtime\.pendingConfirmations/);
  assert.match(src, /runtime\.allowedActions/);
  // refresh 按钮
  assert.match(src, /runtime\.refresh/);
});

// ============================================================
// 7. KkConnectionState 完整性 (K21-KK-003/004)
// ============================================================

test("K21-KK-003/004: ALL_KK_CONNECTION_STATES 含 5 个状态", () => {
  assert.equal(ALL_KK_CONNECTION_STATES.length, 5);
  const expected = ["connecting", "live", "reconnecting", "polling", "offline"];
  for (const s of expected) {
    assert.ok(ALL_KK_CONNECTION_STATES.includes(s), `缺少状态: ${s}`);
  }
});

// ============================================================
// 8. resolveKiikis21Flags 别名 (Task 3.2 修复回归)
// ============================================================

test("resolveKiikis21Flags 是 parseKiikis21Flags 的别名", () => {
  assert.equal(typeof resolveKiikis21Flags, "function");
  assert.equal(typeof parseKiikis21Flags, "function");
  assert.equal(resolveKiikis21Flags, parseKiikis21Flags);
});

test("resolveKiikis21Flags — production 默认 fail closed (K21-FF-001)", () => {
  const flags = resolveKiikis21Flags({ NODE_ENV: "production" });
  assert.equal(flags.kkRealtime, false);
  assert.equal(flags.kkAppearance, false);
  assert.equal(flags.resourceGrants, false);
  assert.equal(flags.communityBeta, false);
  assert.equal(flags.billingLifecycle, false);
});

test("resolveKiikis21Flags — 显式启用", () => {
  const flags = resolveKiikis21Flags({
    NODE_ENV: "production",
    KIIKIS21_FF_KK_REALTIME_ENABLED: "true",
  });
  assert.equal(flags.kkRealtime, true);
  assert.equal(flags.kkAppearance, false);
});

test("DEFAULT_KIIKIS21_FLAGS — 全 false", () => {
  assert.deepEqual(DEFAULT_KIIKIS21_FLAGS, {
    kkRealtime: false,
    kkAppearance: false,
    resourceGrants: false,
    communityBeta: false,
    billingLifecycle: false,
  });
});

// ============================================================
// 9. KkActionId 契约 (K21-KK-006)
// ============================================================

test("K21-KK-006: ALL_KK_ACTIONS 含 12 个 action", () => {
  assert.equal(ALL_KK_ACTIONS.length, 12);
  for (const a of ["open_task", "open_project", "open_universe", "propose_action", "confirm_action", "cancel_action", "equip_item", "unequip_item", "update_profile", "update_privacy", "export_memory", "delete_memory"]) {
    assert.ok(ALL_KK_ACTIONS.includes(a), `缺少 action: ${a}`);
  }
});
