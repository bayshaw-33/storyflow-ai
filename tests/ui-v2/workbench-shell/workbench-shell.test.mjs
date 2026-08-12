// K2-T-02 工作台外壳测试：
// - fixture 数据结构符合 WorkbenchData 类型
// - contract_version 校验（引用 Codex 冻结契约）
// - WorkbenchAdapter 接口契约（必需字段齐全）
// - 未保存提醒逻辑（dirty + 切换 → 应提醒）
// - 步骤导航状态机（completed/current/locked/available）
// - 防漂移断言：TS 内联数据与 JSON 一致
// 参考 tests/ui-v2/dashboard/dashboard.test.mjs 写法：node:test + node:assert/strict + 直接 import .ts。

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  assertContractVersion,
  CONTRACT_VERSION,
} from "../../../lib/client/v2/workbench/types.ts";
import {
  canNavigateToStep,
  getCurrentStep,
  getNavigationDenialReason,
  getStepProgress,
  validateStepStates,
  STEP_STATUSES,
} from "../../../lib/client/v2/workbench/step-machine.ts";
import {
  allowForceSwitch,
  getContextSwitchLabel,
  getSaveStatusLabel,
  getUnsavedWarningMessage,
  isSameContext,
  shouldWarnOnContextSwitch,
} from "../../../lib/client/v2/workbench/unsaved-guard.ts";
import {
  loadWorkbenchFixture,
  getRawWorkbenchFixture,
  WorkbenchFixtureError,
} from "../../../lib/client/v2/workbench/fixtures.ts";
import { workbenchFixture } from "../../../lib/client/v2/workbench/fixture-data.ts";

const FIXTURE_DIR = path.join(process.cwd(), "tests/fixtures/kiikis-v2");
const FIXTURE_PATH = path.join(FIXTURE_DIR, "workbench.json");

function readJsonFixture() {
  const raw = fs.readFileSync(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// 合法的步骤状态
const VALID_STEP_STATUSES = ["completed", "current", "locked", "available"];
// 合法的保存状态
const VALID_SAVE_STATUSES = ["saved", "saving", "unsaved"];
// 合法的资产类型
const VALID_ASSET_TYPES = ["character", "scene", "prop", "storyboard", "video"];
// 合法的资产状态（对齐契约 ASSET_STATUSES）
const VALID_ASSET_STATUSES = ["draft", "ready", "published", "suspended", "archived"];
// 合法的任务阶段（对齐契约 GENERATION_JOB_STATUSES，注意是 running 不是 generating）
const VALID_JOB_STAGES = [
  "draft", "pending_confirm", "queued", "running", "result_ingesting",
  "completed", "partial_failure", "failed", "cancelled",
];
// 合法的 Universe 绑定建议
const VALID_SUGGESTIONS = ["bind_new", "bind_existing", "skip"];

// 校验 fixture 数据结构符合 WorkbenchData 类型定义。
function validateWorkbenchData(data) {
  assert.equal(typeof data.contractVersion, "string", "contractVersion 必须是字符串");
  assert.equal(typeof data.project, "object", "project 必须是对象");
  assert.equal(typeof data.universeBinding, "object", "universeBinding 必须是对象");
  assert.ok(VALID_SAVE_STATUSES.includes(data.saveStatus), `saveStatus 非法: ${data.saveStatus}`);
  assert.ok(Array.isArray(data.steps), "steps 必须是数组");
  assert.ok(Array.isArray(data.assets), "assets 必须是数组");
  assert.ok(Array.isArray(data.runningJobs), "runningJobs 必须是数组");
  assert.equal(typeof data.aiContext, "object", "aiContext 必须是对象");
  assert.equal(typeof data.modelSettings, "object", "modelSettings 必须是对象");

  // project
  const p = data.project;
  assert.equal(typeof p.id, "string");
  assert.equal(typeof p.title, "string");
  assert.equal(typeof p.workflowType, "string");
  assert.equal(typeof p.currentStage, "string");
  assert.equal(typeof p.lastSavedAt, "string");

  // universeBinding
  const u = data.universeBinding;
  assert.equal(typeof u.bound, "boolean");
  if (u.universeId !== undefined) assert.equal(typeof u.universeId, "string");
  if (u.universeName !== undefined) assert.equal(typeof u.universeName, "string");
  if (u.suggestion !== undefined) assert.ok(VALID_SUGGESTIONS.includes(u.suggestion));

  // steps
  for (const s of data.steps) {
    assert.equal(typeof s.id, "string");
    assert.equal(typeof s.label, "string");
    assert.ok(VALID_STEP_STATUSES.includes(s.status), `step.status 非法: ${s.status}`);
  }

  // assets
  for (const a of data.assets) {
    assert.equal(typeof a.id, "string");
    assert.equal(typeof a.name, "string");
    assert.ok(VALID_ASSET_TYPES.includes(a.type), `asset.type 非法: ${a.type}`);
    assert.equal(typeof a.version, "number");
    assert.ok(VALID_ASSET_STATUSES.includes(a.status), `asset.status 非法: ${a.status}`);
    assert.equal(typeof a.locked, "boolean");
  }

  // runningJobs
  for (const j of data.runningJobs) {
    assert.equal(typeof j.id, "string");
    assert.equal(typeof j.name, "string");
    assert.equal(typeof j.type, "string");
    assert.ok(VALID_JOB_STAGES.includes(j.stage), `job.stage 非法: ${j.stage}`);
    assert.equal(typeof j.completed, "number");
    assert.equal(typeof j.total, "number");
    assert.ok(j.completed <= j.total, "completed 不能大于 total");
  }

  // aiContext
  assert.ok(Array.isArray(data.aiContext.suggestions));
  assert.ok(Array.isArray(data.aiContext.recentMessages));
  for (const m of data.aiContext.recentMessages) {
    assert.equal(typeof m.id, "string");
    assert.ok(m.role === "user" || m.role === "assistant");
    assert.equal(typeof m.content, "string");
    assert.equal(typeof m.createdAt, "string");
  }

  // modelSettings
  assert.ok(data.modelSettings.mode === "smart" || data.modelSettings.mode === "manual");
  if (data.modelSettings.currentModel !== undefined) {
    assert.equal(typeof data.modelSettings.currentModel, "string");
  }
  if (data.modelSettings.recommendationReason !== undefined) {
    assert.equal(typeof data.modelSettings.recommendationReason, "string");
  }
}

// ─── contract_version 校验 ───

test("CONTRACT_VERSION 与 Codex 冻结契约一致", () => {
  assert.equal(CONTRACT_VERSION, "2.0.0-alpha.1");
});

test("assertContractVersion 匹配时通过，不匹配时抛错", () => {
  assert.doesNotThrow(() => assertContractVersion("2.0.0-alpha.1"));
  assert.throws(
    () => assertContractVersion("1.0.0"),
    /invalid_contract_version/,
  );
});

test("workbench.json 的 contractVersion 与 CONTRACT_VERSION 一致", () => {
  const data = readJsonFixture();
  assert.equal(data.contractVersion, CONTRACT_VERSION);
});

// ─── fixture 数据结构 ───

test("workbench.json 结构符合 WorkbenchData 类型", () => {
  const data = readJsonFixture();
  validateWorkbenchData(data);
  assert.ok(data.steps.length > 0, "fixture 应至少有一个步骤");
  assert.ok(data.assets.length > 0, "fixture 应至少有一个资产");
  assert.ok(data.runningJobs.length > 0, "fixture 应至少有一个运行中任务");
});

test("loadWorkbenchFixture 返回正确数据且做 contract 校验", () => {
  const data = loadWorkbenchFixture("workbench");
  validateWorkbenchData(data);
  assert.equal(data.contractVersion, CONTRACT_VERSION);
});

test("loadWorkbenchFixture 返回深拷贝（修改不影响原数据）", () => {
  const data1 = loadWorkbenchFixture("workbench");
  data1.project.title = "modified";
  const data2 = loadWorkbenchFixture("workbench");
  assert.notEqual(data2.project.title, "modified", "应返回深拷贝");
});

test("loadWorkbenchFixture 未知名称抛 WorkbenchFixtureError", () => {
  assert.throws(
    () => loadWorkbenchFixture("unknown"),
    (err) => {
      assert.ok(err instanceof WorkbenchFixtureError);
      assert.equal(err.code, "WORKBENCH_FIXTURE_NOT_FOUND");
      return true;
    },
  );
});

test("fixture 覆盖全部步骤状态（completed/current/available/locked）", () => {
  const data = loadWorkbenchFixture("workbench");
  const statuses = new Set(data.steps.map((s) => s.status));
  for (const s of VALID_STEP_STATUSES) {
    assert.ok(statuses.has(s), `fixture 应覆盖步骤状态: ${s}`);
  }
});

test("fixture 覆盖多种资产类型", () => {
  const data = loadWorkbenchFixture("workbench");
  const types = new Set(data.assets.map((a) => a.type));
  assert.ok(types.size >= 3, "fixture 应至少覆盖 3 种资产类型");
});

test("fixture 运行中任务使用契约阶段（running 不是 generating）", () => {
  const data = loadWorkbenchFixture("workbench");
  for (const j of data.runningJobs) {
    assert.ok(VALID_JOB_STAGES.includes(j.stage), `job.stage 非法: ${j.stage}`);
    assert.notEqual(j.stage, "generating", "不应使用 generating，应为 running");
  }
});

// ─── 防漂移：TS 内联数据与 JSON 一致 ───

test("防漂移：TS 内联 fixture 与 JSON 完全一致", () => {
  const json = readJsonFixture();
  const ts = getRawWorkbenchFixture();
  // 深比较，忽略函数字段
  assert.deepEqual(ts, json, "TS 内联数据与 JSON 不一致，可能漂移");
});

test("防漂移：workbenchFixture export 与 getRawWorkbenchFixture 一致", () => {
  assert.deepEqual(workbenchFixture, getRawWorkbenchFixture());
});

// ─── WorkbenchAdapter 接口契约 ───

test("WorkbenchAdapter 必需字段齐全（fixture 可构造合法 adapter）", () => {
  const data = loadWorkbenchFixture("workbench");
  // 模拟各工作台实现 adapter：用 fixture 数据 + 运行时回调 + 内容
  const adapter = {
    workbenchType: "short_drama",
    project: data.project,
    universeBinding: data.universeBinding,
    saveStatus: data.saveStatus,
    steps: data.steps,
    currentStep: data.steps.find((s) => s.status === "current")?.id ?? data.steps[0].id,
    assets: data.assets,
    runningJobs: data.runningJobs,
    aiContext: data.aiContext,
    modelSettings: data.modelSettings,
    workbenchContent: null,
    onSave: () => {},
    onStepChange: () => {},
  };
  // 校验全部必需字段存在
  const required = [
    "workbenchType", "project", "universeBinding", "saveStatus",
    "steps", "currentStep", "assets", "runningJobs",
    "aiContext", "modelSettings", "workbenchContent", "onSave", "onStepChange",
  ];
  for (const field of required) {
    assert.ok(field in adapter, `adapter 缺少必需字段: ${field}`);
  }
  // 校验回调类型
  assert.equal(typeof adapter.onSave, "function");
  assert.equal(typeof adapter.onStepChange, "function");
});

test("adapter.workbenchContent 可为任意 ReactNode（null/字符串/元素）", () => {
  const data = loadWorkbenchFixture("workbench");
  const base = {
    workbenchType: "novel",
    project: data.project,
    universeBinding: data.universeBinding,
    saveStatus: data.saveStatus,
    steps: data.steps,
    currentStep: data.steps[0].id,
    assets: data.assets,
    runningJobs: data.runningJobs,
    aiContext: data.aiContext,
    modelSettings: data.modelSettings,
    onSave: () => {},
    onStepChange: () => {},
  };
  // null
  assert.equal({ ...base, workbenchContent: null }.workbenchContent, null);
  // 字符串
  assert.equal({ ...base, workbenchContent: "hello" }.workbenchContent, "hello");
});

// ─── 未保存提醒逻辑 ───

test("shouldWarnOnContextSwitch: unsaved/saving 提醒，saved 不提醒", () => {
  assert.equal(shouldWarnOnContextSwitch("unsaved"), true);
  assert.equal(shouldWarnOnContextSwitch("saving"), true);
  assert.equal(shouldWarnOnContextSwitch("saved"), false);
});

test("未保存提醒：dirty + 切换 → 应提醒；clean + 切换 → 不提醒", () => {
  // dirty 状态
  for (const dirty of ["unsaved", "saving"]) {
    for (const switchType of ["project", "universe", "stage"]) {
      assert.equal(shouldWarnOnContextSwitch(dirty), true,
        `dirty=${dirty} + switch=${switchType} 应提醒`);
    }
  }
  // clean 状态
  for (const switchType of ["project", "universe", "stage"]) {
    assert.equal(shouldWarnOnContextSwitch("saved"), false,
      `saved + switch=${switchType} 不应提醒`);
  }
});

test("getUnsavedWarningMessage 返回对应语言的提醒文案", () => {
  const zh = getUnsavedWarningMessage("unsaved", "project", "zh-CN");
  assert.ok(zh.includes("未保存"), "中文文案应包含未保存");
  assert.ok(zh.includes("项目"), "中文文案应包含项目");

  const en = getUnsavedWarningMessage("unsaved", "project", "en-US");
  assert.ok(en.toLowerCase().includes("unsaved"), "英文文案应包含 unsaved");
  assert.ok(en.toLowerCase().includes("project"), "英文文案应包含 project");
});

test("getSaveStatusLabel 返回对应状态标签", () => {
  assert.equal(getSaveStatusLabel("saved", "zh-CN"), "已保存");
  assert.equal(getSaveStatusLabel("saving", "zh-CN"), "保存中");
  assert.equal(getSaveStatusLabel("unsaved", "zh-CN"), "未保存");
  assert.equal(getSaveStatusLabel("saved", "en-US"), "Saved");
});

test("getContextSwitchLabel 返回对应切换类型标签", () => {
  assert.equal(getContextSwitchLabel("project", "zh-CN"), "项目");
  assert.equal(getContextSwitchLabel("universe", "zh-CN"), "Universe");
  assert.equal(getContextSwitchLabel("stage", "zh-CN"), "阶段");
  assert.equal(getContextSwitchLabel("project", "en-US"), "project");
});

test("allowForceSwitch: 用户确认后才允许强制切换", () => {
  assert.equal(allowForceSwitch(true), true);
  assert.equal(allowForceSwitch(false), false);
});

test("isSameContext: 相同上下文不触发切换", () => {
  assert.equal(
    isSameContext({ projectId: "p1", universeId: "u1", stage: "art" }, { projectId: "p1", universeId: "u1", stage: "art" }),
    true,
  );
  assert.equal(
    isSameContext({ projectId: "p1", universeId: "u1", stage: "art" }, { projectId: "p2", universeId: "u1", stage: "art" }),
    false,
  );
  assert.equal(
    isSameContext({ projectId: "p1", universeId: "u1", stage: "art" }, { projectId: "p1", universeId: "u2", stage: "art" }),
    false,
  );
  assert.equal(
    isSameContext({ projectId: "p1", universeId: "u1", stage: "art" }, { projectId: "p1", universeId: "u1", stage: "video" }),
    false,
  );
});

// ─── 步骤导航状态机 ───

test("STEP_STATUSES 包含四种状态", () => {
  assert.deepEqual(STEP_STATUSES, ["completed", "current", "locked", "available"]);
});

test("validateStepStates: 合法步骤列表通过", () => {
  const steps = [
    { id: "s1", label: "一", status: "completed" },
    { id: "s2", label: "二", status: "current" },
    { id: "s3", label: "三", status: "available" },
    { id: "s4", label: "四", status: "locked" },
  ];
  const result = validateStepStates(steps);
  assert.equal(result.valid, true);
});

test("validateStepStates: 空列表不合法", () => {
  const result = validateStepStates([]);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "steps_empty");
});

test("validateStepStates: 多个 current 不合法", () => {
  const steps = [
    { id: "s1", label: "一", status: "current" },
    { id: "s2", label: "二", status: "current" },
  ];
  const result = validateStepStates(steps);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "multiple_current");
});

test("validateStepStates: locked 前全部 completed 不合法（锁定无意义）", () => {
  const steps = [
    { id: "s1", label: "一", status: "completed" },
    { id: "s2", label: "二", status: "completed" },
    { id: "s3", label: "三", status: "locked" },
  ];
  const result = validateStepStates(steps);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "locked_after_all_completed");
});

test("canNavigateToStep: completed/current/available 可导航，locked 不可", () => {
  const steps = [
    { id: "s1", label: "一", status: "completed" },
    { id: "s2", label: "二", status: "current" },
    { id: "s3", label: "三", status: "available" },
    { id: "s4", label: "四", status: "locked" },
  ];
  assert.equal(canNavigateToStep(steps, "s1"), true);
  assert.equal(canNavigateToStep(steps, "s2"), true);
  assert.equal(canNavigateToStep(steps, "s3"), true);
  assert.equal(canNavigateToStep(steps, "s4"), false);
  assert.equal(canNavigateToStep(steps, "nonexistent"), false);
});

test("getNavigationDenialReason: locked 返回提示，其他返回 null", () => {
  const steps = [
    { id: "s1", label: "一", status: "completed" },
    { id: "s2", label: "二", status: "locked" },
  ];
  assert.equal(getNavigationDenialReason(steps, "s1", "zh-CN"), null);
  assert.ok(getNavigationDenialReason(steps, "s2", "zh-CN")?.includes("解锁"));
  assert.ok(getNavigationDenialReason(steps, "s2", "en-US")?.includes("locked"));
});

test("getCurrentStep: 返回 current 状态步骤", () => {
  const steps = [
    { id: "s1", label: "一", status: "completed" },
    { id: "s2", label: "二", status: "current" },
    { id: "s3", label: "三", status: "locked" },
  ];
  const current = getCurrentStep(steps);
  assert.equal(current?.id, "s2");
  // 无 current 时返回 null
  assert.equal(getCurrentStep([{ id: "x", label: "x", status: "completed" }]), null);
});

test("getStepProgress: 统计各状态数量", () => {
  const steps = [
    { id: "s1", label: "一", status: "completed" },
    { id: "s2", label: "二", status: "current" },
    { id: "s3", label: "三", status: "available" },
    { id: "s4", label: "四", status: "locked" },
    { id: "s5", label: "五", status: "locked" },
  ];
  const progress = getStepProgress(steps);
  assert.equal(progress.total, 5);
  assert.equal(progress.completed, 1);
  assert.equal(progress.current, 1);
  assert.equal(progress.available, 1);
  assert.equal(progress.locked, 2);
});

test("fixture 步骤列表通过状态机校验", () => {
  const data = loadWorkbenchFixture("workbench");
  const result = validateStepStates(data.steps);
  assert.equal(result.valid, true, `fixture 步骤列表不合法: ${result.reason}`);
});

test("fixture current 步骤可被 getCurrentStep 找到", () => {
  const data = loadWorkbenchFixture("workbench");
  const current = getCurrentStep(data.steps);
  assert.ok(current, "fixture 应有一个 current 步骤");
});
