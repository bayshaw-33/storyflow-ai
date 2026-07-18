/**
 * art-asset-scope tests — PRD §7.2 / §4.1 美术资产作用域隔离
 *
 * 覆盖：
 * - getArtWorkbenchStorageKey: 三种参数组合的 key 派生
 * - 跨集隔离：相同 projectId + 不同 sourceUnitId → 不同 key
 * - 跨项目隔离：不同 projectId → 不同 key
 * - 同名角色不串资产：scope 不同则 key 不同
 * - 资产详情页使用与嵌入工作台相同的 scoped key
 *
 * 运行：node --test tests/art-asset-scope.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  ART_WORKBENCH_STORAGE_KEY,
  getArtWorkbenchStorageKey,
} from "../lib/art-workbench.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// 1. 无参数 → 基础 key（全局 fallback）
test("getArtWorkbenchStorageKey 无参数返回基础 key", () => {
  assert.equal(getArtWorkbenchStorageKey(), ART_WORKBENCH_STORAGE_KEY);
  assert.equal(getArtWorkbenchStorageKey(undefined, undefined), ART_WORKBENCH_STORAGE_KEY);
});

// 2. 仅 projectId → 旧独立美术台兼容 key
test("getArtWorkbenchStorageKey 仅 projectId 返回 :projectId 后缀", () => {
  assert.equal(
    getArtWorkbenchStorageKey("proj-1"),
    `${ART_WORKBENCH_STORAGE_KEY}:proj-1`,
  );
});

// 3. projectId + sourceUnitId → 完整 scoped key（嵌入模式）
test("getArtWorkbenchStorageKey 双参返回 :projectId:sourceUnitId", () => {
  assert.equal(
    getArtWorkbenchStorageKey("proj-1", "unit-1"),
    `${ART_WORKBENCH_STORAGE_KEY}:proj-1:unit-1`,
  );
});

// 4. 跨集隔离：同项目不同集 → 不同 key
test("跨集隔离：相同 projectId + 不同 sourceUnitId → 不同 key", () => {
  const ep1 = getArtWorkbenchStorageKey("proj-1", "episode-1");
  const ep2 = getArtWorkbenchStorageKey("proj-1", "episode-2");
  assert.notEqual(ep1, ep2, "同一项目不同集必须使用不同 storage key");
});

// 5. 跨项目隔离：不同 projectId → 不同 key
test("跨项目隔离：不同 projectId → 不同 key", () => {
  const a = getArtWorkbenchStorageKey("proj-a", "unit-1");
  const b = getArtWorkbenchStorageKey("proj-b", "unit-1");
  assert.notEqual(a, b, "不同项目必须使用不同 storage key");
});

// 6. PRD §6.4：两个项目使用同名角色也不串资产
test("同名角色不串资产：scope 不同则 key 不同", () => {
  const projectA = getArtWorkbenchStorageKey("draft-production-aaa", "draft-unit-aaa");
  const projectB = getArtWorkbenchStorageKey("draft-production-bbb", "draft-unit-bbb");
  assert.notEqual(projectA, projectB);
  // 确认 key 包含完整 scope，不会因为名字相同而碰撞
  assert.ok(projectA.includes("aaa"));
  assert.ok(projectB.includes("bbb"));
});

// 7. ArtAssetDetail 使用与嵌入工作台相同的 scoped key
test("ArtAssetDetail 从 URL projectId+sourceUnitId 派生 scoped key", async () => {
  const detail = await read("../components/art/ArtAssetDetail.tsx");
  // 必须导入 getArtWorkbenchStorageKey
  assert.match(detail, /import\s*\{[^}]*getArtWorkbenchStorageKey[^}]*\}\s*from\s*"@\/lib\/art-workbench"/);
  // 必须从 URL 读 projectId 和 sourceUnitId
  assert.match(detail, /searchParams\.get\("projectId"\)/);
  assert.match(detail, /searchParams\.get\("sourceUnitId"\)/);
  // 必须用两个上下文参数派生 storageKey
  assert.match(detail, /getArtWorkbenchStorageKey\(ctxProjectId \|\| undefined, ctxSourceUnitId \|\| undefined\)/);
  // 不得残留硬编码的 STORAGE_KEY 常量
  assert.doesNotMatch(detail, /const STORAGE_KEY = "kiikis_art_workbench_state"/);
});

// 8. ArtWorkbench 资产卡链接携带 scope query
test("ArtWorkbench 资产卡链接携带 projectId + sourceUnitId query", async () => {
  const component = await read("../components/art/ArtWorkbench.tsx");
  assert.match(component, /new URLSearchParams\(\{ projectId: scopeProjectId, sourceUnitId: scopeSourceUnitId \}\)/);
  // 嵌入模式必须接收 contextSourceUnitId prop
  assert.match(component, /contextSourceUnitId\?: string/);
});

// 9. ProductionWorkbench 传递 contextSourceUnitId 给 ArtWorkbench
test("ProductionWorkbench 传递 contextSourceUnitId 给 ArtWorkbench", async () => {
  const workbench = await read("../components/production/ProductionWorkbench.tsx");
  assert.match(workbench, /contextSourceUnitId=\{sourceUnitId \|\| undefined\}/);
});
