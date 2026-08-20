/**
 * production-scope tests — PRD §8.1 四区共享作用域 + §8.2 归档绑定
 *
 * 覆盖：
 * - getProductionScopeStatus: empty / draft / missing / valid 状态判定
 * - isScopeActionable: 按钮 fail-closed 闸门
 * - isCloudActionable: 云端操作需正式 scope（draft 不行）
 * - archive API route 源码契约：4 种绑定模式、link 失败不吞错、复用不重复
 *
 * 运行：node --test tests/production-scope.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  getProductionScopeStatus,
  isScopeActionable,
  isCloudActionable,
} from "../lib/production/scope.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// ===== scope 状态判定 =====

test("getProductionScopeStatus: 空 scope → empty", () => {
  assert.equal(getProductionScopeStatus("", ""), "empty");
});

test("getProductionScopeStatus: draft 前缀 → draft", () => {
  assert.equal(getProductionScopeStatus("draft-production-abc", "draft-unit-abc"), "draft");
});

test("getProductionScopeStatus: 正式 project + unit → valid", () => {
  assert.equal(getProductionScopeStatus("proj-123", "ep-proj-123-1"), "valid");
});

test("getProductionScopeStatus: 只有 projectId 缺 unit → missing_unit", () => {
  assert.equal(getProductionScopeStatus("proj-123", ""), "missing_unit");
});

test("getProductionScopeStatus: 只有 unitId 缺 project → missing_project", () => {
  // 注意：unitId 非空但 projectId 空，projectId.startsWith 不会报错（空字符串）
  assert.equal(getProductionScopeStatus("", "ep-123-1"), "missing_project");
});

// ===== 按钮 fail-closed 闸门 =====

test("isScopeActionable: empty 和 missing 不可操作", () => {
  assert.equal(isScopeActionable("", ""), false);
  assert.equal(isScopeActionable("proj", ""), false);
  assert.equal(isScopeActionable("", "unit"), false);
});

test("isScopeActionable: draft 和 valid 都可操作（draft 可触发归档保存）", () => {
  assert.equal(isScopeActionable("draft-p", "draft-u"), true);
  assert.equal(isScopeActionable("proj", "unit"), true);
});

// ===== 云端操作闸门（更严格，draft 不行）=====

test("isCloudActionable: draft 不可执行云端操作（需先归档）", () => {
  assert.equal(isCloudActionable("draft-p", "draft-u"), false);
});

test("isCloudActionable: valid 可执行云端操作", () => {
  assert.equal(isCloudActionable("proj", "unit"), true);
});

test("isCloudActionable: empty / missing 不可执行云端操作", () => {
  assert.equal(isCloudActionable("", ""), false);
  assert.equal(isCloudActionable("proj", ""), false);
});

// ===== archive API route 源码契约 =====

test("archive route 支持 4 种 universe 绑定模式（existing / create / none）", async () => {
  const route = await read("../app/api/production/archive/route.ts");
  assert.match(route, /universeMode.*existing.*create.*none/);
  // existing 模式必须校验 universe 归属
  assert.match(route, /UNIVERSE_NOT_FOUND/);
  assert.match(route, /UNIVERSE_FORBIDDEN/);
  // create 模式必须新建 universe 行
  assert.match(route, /storyflow_universes/);
  // none 模式必须在 metadata 标记 universe_link_state: unassigned
  assert.match(route, /universe_link_state.*unassigned/);
});

test("archive route 支持 existing / create 两种 project 模式", async () => {
  const route = await read("../app/api/production/archive/route.ts");
  assert.match(route, /projectMode.*existing.*create/);
  // existing 模式必须校验 project 归属，不重复创建
  assert.match(route, /PROJECT_NOT_FOUND/);
  assert.match(route, /PROJECT_FORBIDDEN/);
});

test("archive route: link 写失败不吞错（无 .catch(() => null)）", async () => {
  const route = await read("../app/api/production/archive/route.ts");
  // link 写入是 await serviceFetch（不是 void 或 .catch），失败会抛出
  assert.match(route, /await serviceFetch\(\s*"\/rest\/v1\/storyflow_universe_project_links"/);
  // 不得出现 .catch(() => null) 吞错模式
  assert.doesNotMatch(route, /\.catch\(\(\)\s*=>\s*null\)/);
});

test("archive route: 相同 owner + project 已有 link 时复用", async () => {
  const route = await read("../app/api/production/archive/route.ts");
  assert.match(route, /existingLinks/);
  assert.match(route, /reusedLink/);
});

test("archive route: link id 使用数据库兼容的 UUID，跨宇宙重复绑定返回冲突", async () => {
  const route = await read("../app/api/production/archive/route.ts");
  assert.match(route, /linkId = crypto\.randomUUID\(\)/);
  assert.doesNotMatch(route, /linkId = `universe-project-link-/);
  assert.match(route, /PROJECT_ALREADY_LINKED_TO_ANOTHER_UNIVERSE/);
  assert.match(route, /409/);
});

test("archive route: 写入顺序 project → link（FK 依赖）", async () => {
  const route = await read("../app/api/production/archive/route.ts");
  const projectPos = route.indexOf("storyflow_projects");
  const linkPos = route.indexOf("storyflow_universe_project_links");
  assert.ok(projectPos > 0, "project table must be referenced");
  assert.ok(linkPos > projectPos, "link must be written after project (FK dependency)");
});

test("archive route: 返回 projectId + sourceUnitId + universeId 供客户端 replace URL", async () => {
  const route = await read("../app/api/production/archive/route.ts");
  assert.match(route, /return ok\(\{/);
  assert.match(route, /projectId/);
  assert.match(route, /sourceUnitId/);
  assert.match(route, /universeId/);
  assert.match(route, /reused/);
});

test("archive route: 归档失败时返回 502 / 403 / 404，不返回空 Scene/Shot", async () => {
  const route = await read("../app/api/production/archive/route.ts");
  assert.match(route, /apiError\(error, "归档失败.*", 502\)/);
  assert.match(route, /404/);
  assert.match(route, /403/);
});
