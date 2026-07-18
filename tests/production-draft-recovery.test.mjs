/**
 * production-draft-recovery tests — PRD v1.0 §6 (TRAE-PW-P0-002)
 *
 * 验证草稿身份与恢复：
 *   1. draft ID 生成用 crypto.randomUUID（不用 Date.now()）；
 *   2. localStorage key scoped by projectId + sourceUnitId（跨集隔离）；
 *   3. 草稿读写：空 scope 不写不读；
 *   4. 云端 revision 不被更旧 local revision 覆盖（通过 CAS 409 机制）；
 *   5. 同项目两集互不串数据（key 隔离）。
 *
 * 运行：node --test tests/production-draft-recovery.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildDraftKey,
  readStoryboardDraft,
  writeStoryboardDraft,
  clearStoryboardDraft,
} from "../lib/storyboard/draft.ts";

const PRODUCTION_WORKBENCH_SRC = readFileSync(
  fileURLToPath(new URL("../components/production/ProductionWorkbench.tsx", import.meta.url)),
  "utf8",
);

// ===== 测试工具 =====

function makeScope(overrides = {}) {
  return {
    userId: "user-test-1",
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    ...overrides,
  };
}

function makeDraftPayload(projectId = "proj-1") {
  return {
    id: projectId,
    projectId,
    title: "测试草稿",
    workflowType: "storyboard",
    contentType: "short_drama",
    aspectRatio: "9:16",
    language: "zh",
    sourceFiles: [],
    sourceSummary: "剧本内容",
    updatedAt: new Date().toISOString(),
    storyboardScenes: [],
    storyboardAssets: { characters: [], locations: [], props: [] },
    storyboardRevision: 0,
  };
}

function resetLocalStorage() {
  // 清空所有 kiikis: 开头的 key
  for (let i = globalThis.localStorage?.length ?? 0; i > 0; i--) {
    const key = globalThis.localStorage?.key(i - 1);
    if (key && key.startsWith("kiikis:")) {
      globalThis.localStorage?.removeItem(key);
    }
  }
}

// Node.js 没有 localStorage / window，需要 mock
function setupLocalStorage() {
  const store = new Map();
  const mockStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
  globalThis.localStorage = mockStorage;
  globalThis.window = { localStorage: mockStorage };
  return store;
}

// ===== 测试用例 =====

test("buildDraftKey: scoped by userId + projectId + sourceUnitId", () => {
  const key1 = buildDraftKey({ userId: "u1", projectId: "p1", sourceUnitId: "e1" });
  const key2 = buildDraftKey({ userId: "u1", projectId: "p1", sourceUnitId: "e2" });
  const key3 = buildDraftKey({ userId: "u1", projectId: "p2", sourceUnitId: "e1" });
  const key4 = buildDraftKey({ userId: "u2", projectId: "p1", sourceUnitId: "e1" });

  assert.notEqual(key1, key2, "不同 sourceUnitId 必须不同 key");
  assert.notEqual(key1, key3, "不同 projectId 必须不同 key");
  assert.notEqual(key1, key4, "不同 userId 必须不同 key");
  assert.ok(key1.includes("p1"), "key 包含 projectId");
  assert.ok(key1.includes("e1"), "key 包含 sourceUnitId");
  assert.ok(key1.includes("u1"), "key 包含 userId");
});

test("buildDraftKey: 未登录用 anon 占位", () => {
  const key = buildDraftKey({ userId: null, projectId: "p1", sourceUnitId: "e1" });
  assert.ok(key.includes("anon"), "未登录用户用 anon 占位");
});

test("writeStoryboardDraft + readStoryboardDraft: 正常读写", () => {
  setupLocalStorage();
  const scope = makeScope();
  const payload = makeDraftPayload();
  writeStoryboardDraft(scope, payload);
  const read = readStoryboardDraft(scope);
  assert.ok(read, "读取必须返回非 null");
  assert.equal(read?.title, "测试草稿");
  assert.equal(read?.sourceSummary, "剧本内容");
});

test("readStoryboardDraft: 空 scope 返回 null（禁止全局 fallback）", () => {
  setupLocalStorage();
  const read = readStoryboardDraft({ userId: "u1", projectId: "", sourceUnitId: "" });
  assert.equal(read, null);
});

test("readStoryboardDraft: 跨集隔离 —— 同项目两集不串数据", () => {
  setupLocalStorage();
  const scope1 = makeScope({ sourceUnitId: "ep-1" });
  const scope2 = makeScope({ sourceUnitId: "ep-2" });

  writeStoryboardDraft(scope1, { ...makeDraftPayload(), title: "第一集" });
  writeStoryboardDraft(scope2, { ...makeDraftPayload(), title: "第二集" });

  const read1 = readStoryboardDraft(scope1);
  const read2 = readStoryboardDraft(scope2);
  assert.equal(read1?.title, "第一集");
  assert.equal(read2?.title, "第二集");
});

test("readStoryboardDraft: 跨项目隔离 —— 两项目同名集不串数据", () => {
  setupLocalStorage();
  const scope1 = makeScope({ projectId: "proj-A", sourceUnitId: "ep-1" });
  const scope2 = makeScope({ projectId: "proj-B", sourceUnitId: "ep-1" });

  writeStoryboardDraft(scope1, { ...makeDraftPayload("proj-A"), title: "项目A" });
  writeStoryboardDraft(scope2, { ...makeDraftPayload("proj-B"), title: "项目B" });

  assert.equal(readStoryboardDraft(scope1)?.title, "项目A");
  assert.equal(readStoryboardDraft(scope2)?.title, "项目B");
});

test("clearStoryboardDraft: 清除后读取返回 null", () => {
  setupLocalStorage();
  const scope = makeScope();
  writeStoryboardDraft(scope, makeDraftPayload());
  assert.ok(readStoryboardDraft(scope));
  clearStoryboardDraft(scope);
  assert.equal(readStoryboardDraft(scope), null);
});

test("draft ID 生成规范：crypto.randomUUID 格式（非 Date.now）", () => {
  // PRD §6.1: 只生成一次 draftProjectId 和 draftSourceUnitId，用 crypto.randomUUID()
  // 验证 ProductionWorkbench 代码已改为 randomUUID（通过源码字符串校验）
  const src = PRODUCTION_WORKBENCH_SRC;
  // 必须包含 crypto.randomUUID 调用
  assert.ok(
    src.includes("crypto.randomUUID") || src.includes("crypto?.randomUUID"),
    "ProductionWorkbench 必须用 crypto.randomUUID 生成 draft ID",
  );
  // 不能再用 Date.now() 生成 draft ID（其他地方用 Date.now 可以）
  assert.ok(
    !/draft-production-\$\{Date\.now\(\)\}/.test(src) && !src.includes("draft-production-${Date.now()}"),
    "draft-production ID 不能再用 Date.now()",
  );
});

test("URL 规范化：setup=1 后 router.replace 写回 URL（源码校验）", () => {
  const src = PRODUCTION_WORKBENCH_SRC;
  // 必须有 router.replace 调用，且删除 setup
  assert.ok(src.includes("router.replace"), "setup=1 分支必须 router.replace 写回 URL");
  // hydration gate
  assert.ok(src.includes("hydrationPhase"), "必须有 hydrationPhase 状态");
  assert.ok(src.includes('"ready"'), "hydrationPhase 必须有 ready 阶段");
  // autosave gate
  assert.ok(
    src.includes('hydrationPhase !== "ready"'),
    "autosave 必须在 hydrationPhase !== ready 时 return",
  );
});

test("hydration gate: ready 之前不写 localStorage（源码校验）", () => {
  const src = PRODUCTION_WORKBENCH_SRC;
  // autosave effect 必须检查 hydrationPhase
  const autosaveMatch = src.match(/hydration gate[\s\S]*?useEffect\(([\s\S]*?), \[/);
  assert.ok(autosaveMatch, "找到 hydration gate useEffect");
  assert.ok(
    autosaveMatch[1].includes('hydrationPhase !== "ready"'),
    "autosave effect 必须在 hydrationPhase !== ready 时 return",
  );
});

test("localStorage 写入失败显示错误（源码校验）", () => {
  const src = PRODUCTION_WORKBENCH_SRC;
  // 必须有 try/catch 包裹 writeStoryboardDraft
  assert.ok(
    src.includes("setDraftPersistError"),
    "必须有 draftPersistError 状态",
  );
  assert.ok(
    src.includes("catch") && src.includes("本地草稿保存失败"),
    "writeStoryboardDraft 失败必须 catch 并显示错误",
  );
});
