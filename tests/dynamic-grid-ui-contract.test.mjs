/**
 * tests/dynamic-grid-ui-contract.test.mjs
 * KIIKIS 2.1 Phase 2 — Task 2.6 Production Workbench 接入 UI 契约测试
 *
 * 验证点 (PRD §7 Task 2.6)：
 *   - DynamicGridEditor 必须显示：场标题、NEW/CONTINUOUS、格数与理由、
 *     空间/轴线、共享摄影参数、每格图像/说明/锁定、上游差异和冲突选择
 *   - DynamicGridDiffDialog 提供保留/接受/取消三个动作
 *   - ProductionWorkbench 接入 "grid" tab 并读取 handoffId URL 参数
 *   - dynamic-grid-client 暴露 DynamicGridClient + Conflict/Success payload 类型字段
 *   - 不重做整个 Production Workbench（仅新增 tab + 渲染编辑器）
 *
 * 与 workbench-shell.test.mjs 一致：node:test + node:assert/strict，
 * TS 模块直接 import；React .tsx 按源文件文本断言契约。
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import { DynamicGridClient, DynamicGridClientError } from "../lib/storyboard/dynamic-grid-client.ts";

const ROOT = process.cwd();
const PROD_DIR = path.join(ROOT, "components/production");
const EDITOR_SRC = fs.readFileSync(path.join(PROD_DIR, "DynamicGridEditor.tsx"), "utf-8");
const DIALOG_SRC = fs.readFileSync(path.join(PROD_DIR, "DynamicGridDiffDialog.tsx"), "utf-8");
const WORKBENCH_SRC = fs.readFileSync(path.join(PROD_DIR, "ProductionWorkbench.tsx"), "utf-8");
// K2.2 统一工作台重构后，grid 不再是 ProductionWorkbench 的独立 Tab，
// 而是统一分镜阶段（UnifiedStoryboardStage）的子视图（宫格 + 运动预览）。
const STORYBOARD_STAGE_SRC = fs.readFileSync(path.join(PROD_DIR, "UnifiedStoryboardStage.tsx"), "utf-8");

// ============================================================
// 1. dynamic-grid-client 契约
// ============================================================

test("DynamicGridClient 暴露静态 fromSupabase 工厂方法", () => {
  assert.equal(typeof DynamicGridClient, "function");
  assert.equal(typeof DynamicGridClient.fromSupabase, "function");
});

test("DynamicGridClientError 携带 code 和 status 字段", () => {
  const err = new DynamicGridClientError("NOT_FOUND", "missing", 404);
  assert.equal(err.code, "NOT_FOUND");
  assert.equal(err.status, 404);
  assert.equal(err.name, "DynamicGridClientError");
});

test("DynamicGridClient 原型暴露 5 个端点方法", () => {
  const proto = DynamicGridClient.prototype;
  assert.equal(typeof proto.listForHandoff, "function");
  assert.equal(typeof proto.getCurrent, "function");
  assert.equal(typeof proto.getHistory, "function");
  assert.equal(typeof proto.getById, "function");
  assert.equal(typeof proto.diffVersions, "function");
  assert.equal(typeof proto.upsert, "function");
});

test("upsert 返回类型为联合类型 (success | conflict) — 通过源码静态断言", () => {
  // 通过源码确认：upsert 签名声明返回 Promise<UpsertSuccessPayload | UpsertConflictPayload>
  assert.match(
    CLIENT_SRC(),
    /upsert\(body: UpsertStoryboardBody\): Promise<UpsertSuccessPayload \| UpsertConflictPayload>/,
  );
});

// client.ts 源码（一次性读取，供多个测试用）
function CLIENT_SRC() {
  return fs.readFileSync(path.join(ROOT, "lib/storyboard/dynamic-grid-client.ts"), "utf-8");
}

test("UpsertStoryboardBody 字段顺序固定（handoffId → sceneId → continuityMode → gridCount → ...）", () => {
  const src = CLIENT_SRC();
  const match = src.match(/export interface UpsertStoryboardBody \{([\s\S]*?)\}/);
  assert.ok(match, "UpsertStoryboardBody 接口未找到");
  const fields = match[1]
    .split("\n")
    .map((l) => l.trim().replace(/:.*/, "").replace(/[?].*/, ""))
    .filter((f) => /^[a-zA-Z]/.test(f));
  assert.deepEqual(
    fields,
    [
      "handoffId",
      "sceneId",
      "continuityMode",
      "gridCount",
      "gridRationale",
      "spatialPlan",
      "sharedCinematography",
      "negativePrompt",
      "frames",
      "revisionSource",
      "expectedRevision",
    ],
    "UpsertStoryboardBody 字段顺序必须固定，防止序列化差异",
  );
});

test("UpsertConflictPayload 字段顺序固定（kind → currentRevision → currentStoryboard → attemptedStoryboard → diff → message）", () => {
  const src = CLIENT_SRC();
  const match = src.match(/export interface UpsertConflictPayload \{([\s\S]*?)\}/);
  assert.ok(match, "UpsertConflictPayload 接口未找到");
  const fields = match[1]
    .split("\n")
    .map((l) => l.trim().replace(/:.*/, "").replace(/[?].*/, ""))
    .filter((f) => /^[a-zA-Z]/.test(f));
  assert.deepEqual(fields, [
    "kind",
    "currentRevision",
    "currentStoryboard",
    "attemptedStoryboard",
    "diff",
    "message",
  ]);
});

test("UpsertSuccessPayload.status 限定为 created | revision_added | idempotent_skip", () => {
  const src = CLIENT_SRC();
  assert.match(src, /status: "created" \| "revision_added" \| "idempotent_skip"/);
});

// ============================================================
// 2. DynamicGridEditor UI 契约
// ============================================================

test("DynamicGridEditor 导出命名组件 + 接收 handoffId prop", () => {
  assert.match(EDITOR_SRC, /export function DynamicGridEditor\(\{ handoffId \}: DynamicGridEditorProps\)/);
  assert.match(EDITOR_SRC, /export interface DynamicGridEditorProps \{[^}]*handoffId: string;[^}]*\}/s);
});

test("DynamicGridEditor 显示场标题 (sceneId 选择器 + 场标题展示)", () => {
  // 场景选择栏提供场景切换，展示 sceneId
  assert.match(EDITOR_SRC, /<select[\s\S]*?aria-label="选择场景"/);
  assert.match(EDITOR_SRC, /value=\{selectedSceneId\}/);
});

test("DynamicGridEditor 显示 NEW/CONTINUOUS 标记", () => {
  assert.match(EDITOR_SRC, /continuityMode === "NEW"/);
  assert.match(EDITOR_SRC, /NEW 场/);
  assert.match(EDITOR_SRC, /CONTINUOUS/);
});

test("DynamicGridEditor 显示格数与理由", () => {
  assert.match(EDITOR_SRC, /\{draft\.gridCount\} 宫格/);
  assert.match(EDITOR_SRC, /gridRationale/);
});

test("DynamicGridEditor 支持 4/6/9/12 宫格布局 className", () => {
  assert.match(EDITOR_SRC, /case 4: return styles\.grid4/);
  assert.match(EDITOR_SRC, /case 6: return styles\.grid6/);
  assert.match(EDITOR_SRC, /case 9: return styles\.grid9/);
  assert.match(EDITOR_SRC, /case 12: return styles\.grid12/);
});

test("DynamicGridEditor 显示空间/轴线信息 (axis + entrances + screenDirections)", () => {
  assert.match(EDITOR_SRC, /spatialPlan\.axis/);
  assert.match(EDITOR_SRC, /spatialPlan\.entrances\.join/);
  assert.match(EDITOR_SRC, /spatialPlan\.screenDirections\.join/);
});

test("DynamicGridEditor 显示共享摄影参数 + Negative Prompt", () => {
  assert.match(EDITOR_SRC, /sharedCinematography/);
  assert.match(EDITOR_SRC, /Negative Prompt/);
});

test("DynamicGridEditor 每格支持图像/说明/锁定切换", () => {
  assert.match(EDITOR_SRC, /FrameCard/);
  assert.match(EDITOR_SRC, /toggleFrameLock/);
  assert.match(EDITOR_SRC, /frame\.locked \? <Lock/);
  assert.match(EDITOR_SRC, /frame\.locked \? " 锁定" : " 解锁"/);
  assert.match(EDITOR_SRC, /aria-label=\{frame\.locked \? "解锁此格" : "锁定此格"\}/);
});

test("DynamicGridEditor 每格展示 9:16 aspect + 视觉描述可编辑 (contentEditable)", () => {
  assert.match(EDITOR_SRC, /contentEditable=\{!frame\.locked\}/);
  assert.match(EDITOR_SRC, /9:16/);
  assert.match(EDITOR_SRC, /onBlur=\{\(e\) =>/);
});

test("DynamicGridEditor 调用 client.upsert 走 CAS 路径 (expectedRevision)", () => {
  assert.match(EDITOR_SRC, /const expectedRevision = current\?\.revision \?\? -1;/);
  assert.match(EDITOR_SRC, /client\.upsert\(/);
  assert.match(EDITOR_SRC, /expectedRevision,/);
});

test("DynamicGridEditor 在 409 冲突时渲染 DynamicGridDiffDialog", () => {
  assert.match(EDITOR_SRC, /const \[conflict, setConflict\] = useState/);
  assert.match(EDITOR_SRC, /<DynamicGridDiffDialog/);
  assert.match(EDITOR_SRC, /onKeepMine=\{handleConflictKeepMine\}/);
  assert.match(EDITOR_SRC, /onAcceptServer=\{handleConflictAcceptServer\}/);
  assert.match(EDITOR_SRC, /onCancel=\{handleConflictCancel\}/);
});

test("DynamicGridEditor 强制保留我的版本时使用 conflict.currentRevision 作为 expectedRevision", () => {
  assert.match(EDITOR_SRC, /expectedRevision: conflict\.currentRevision,/);
});

test("DynamicGridEditor 接受服务端版本时重新加载到 draft 状态", () => {
  assert.match(EDITOR_SRC, /setDraft\(conflict\.currentStoryboard\)/);
});

test("DynamicGridEditor 401/未登录路径由 DynamicGridClientError 抛出 (DynamicGridClient 已处理)", () => {
  // client.ts 中 401 → DynamicGridClientError code=UNAUTHORIZED
  const src = CLIENT_SRC();
  assert.match(src, /response\.status === 401/);
  assert.match(src, /throw new DynamicGridClientError\("UNAUTHORIZED"/);
});

test("DynamicGridEditor 锁定统计展示 (锁定数 / 人工编辑数)", () => {
  assert.match(EDITOR_SRC, /frames\.filter\(\(f\) => f\.locked\)\.length/);
  assert.match(EDITOR_SRC, /frames\.filter\(\(f\) => f\.userEdited\)\.length/);
});

// ============================================================
// 3. DynamicGridDiffDialog UI 契约
// ============================================================

test("DynamicGridDiffDialog 导出命名组件 + 接收 conflict + 3 个回调", () => {
  assert.match(
    DIALOG_SRC,
    /export interface DynamicGridDiffDialogProps \{[\s\S]*?conflict: UpsertConflictPayload;[\s\S]*?onKeepMine: \(\) => void;[\s\S]*?onAcceptServer: \(\) => void;[\s\S]*?onCancel: \(\) => void;[\s\S]*?\}/,
  );
  assert.match(DIALOG_SRC, /export function DynamicGridDiffDialog\(/);
});

test("DynamicGridDiffDialog 标记为 role=dialog + aria-modal", () => {
  assert.match(DIALOG_SRC, /role="dialog"/);
  assert.match(DIALOG_SRC, /aria-modal="true"/);
  assert.match(DIALOG_SRC, /aria-labelledby="dyn-grid-diff-title"/);
});

test("DynamicGridDiffDialog 显示冲突 kind (cas_mismatch / locked_override)", () => {
  assert.match(DIALOG_SRC, /kind === "cas_mismatch"/);
  assert.match(DIALOG_SRC, /"版本冲突"/);
  assert.match(DIALOG_SRC, /"锁定覆盖"/);
});

test("DynamicGridDiffDialog 渲染 metadataDeltas (场景元数据变化)", () => {
  assert.match(DIALOG_SRC, /diff\.metadataChanged/);
  assert.match(DIALOG_SRC, /diff\.metadataDeltas\.length > 0/);
  assert.match(DIALOG_SRC, /formatValue\(d\.oldValue\)/);
  assert.match(DIALOG_SRC, /formatValue\(d\.newValue\)/);
});

test("DynamicGridDiffDialog 渲染 framesAdded / framesRemoved / framesModified", () => {
  assert.match(DIALOG_SRC, /diff\.framesAdded\.length > 0/);
  assert.match(DIALOG_SRC, /diff\.framesRemoved\.length > 0/);
  assert.match(DIALOG_SRC, /diff\.framesModified\.length > 0/);
  assert.match(DIALOG_SRC, /m\.fields\.some\(\(f\) => f\.locked \|\| f\.userEdited\)/);
});

test("DynamicGridDiffDialog 三个按钮：取消 / 接受服务端版本 / 保留我的版本", () => {
  assert.match(DIALOG_SRC, /onClick=\{onCancel\}[\s\S]*?>\s*取消\s*<\/button>/);
  assert.match(DIALOG_SRC, /onClick=\{onAcceptServer\}[\s\S]*?>\s*接受服务端版本\s*<\/button>/);
  assert.match(DIALOG_SRC, /onClick=\{onKeepMine\}[\s\S]*?>\s*保留我的版本\s*<\/button>/);
});

test("DynamicGridDiffDialog 无差异时显示 'no changes' 提示", () => {
  assert.match(DIALOG_SRC, /diff\.summary === "no changes"/);
});

// ============================================================
// 4. ProductionWorkbench 接入契约
// ============================================================

test("UnifiedStoryboardStage 引入 DynamicGridEditor（grid 从独立 Tab 迁入分镜阶段）", () => {
  assert.match(STORYBOARD_STAGE_SRC, /import \{ DynamicGridEditor \} from "\.\/DynamicGridEditor"/);
});

test("分镜阶段子视图含 'grids'（宫格）", () => {
  assert.match(STORYBOARD_STAGE_SRC, /type StoryboardSubview = "shot_table" \| "grids" \| "motion" \| "prompts"/);
  assert.match(STORYBOARD_STAGE_SRC, /\{ id: "grids", label: "宫格" \}/);
});

test("ProductionWorkbench 从 URL 读取 handoffId 参数并传给分镜阶段", () => {
  assert.match(WORKBENCH_SRC, /searchParams\.get\("handoffId"\)/);
  assert.match(WORKBENCH_SRC, /const \[handoffId, setHandoffId\] = useState/);
  assert.match(WORKBENCH_SRC, /handoffId=\{handoffId \|\| null\}/);
});

test("分镜阶段在 handoffId 存在时渲染 DynamicGridEditor 并传入 handoffId", () => {
  assert.match(STORYBOARD_STAGE_SRC, /const fallbackMotion = handoffId \? \(/);
  assert.match(STORYBOARD_STAGE_SRC, /<DynamicGridEditor handoffId=\{handoffId\} \/>/);
});

test("缺少 handoffId 时显示提示 (不渲染编辑器)", () => {
  assert.match(STORYBOARD_STAGE_SRC, /请先在剧本阶段确认可用版本，再生成分镜运动预览。/);
});

test("ProductionWorkbench 接入不破坏统一四阶段（script/art/storyboard/video 仍可切换）", () => {
  assert.match(WORKBENCH_SRC, /<UnifiedStoryboardStage/);
  assert.match(WORKBENCH_SRC, /"script" \| "art" \| "storyboard" \| "video"|parseUnifiedWorkbenchQuery/);
});

test("DynamicGridEditor.module.css 包含 4/6/9/12 宫格布局样式", () => {
  const css = fs.readFileSync(path.join(PROD_DIR, "DynamicGridEditor.module.css"), "utf-8");
  for (const cls of ["grid4", "grid6", "grid9", "grid12"]) {
    assert.ok(new RegExp(`\\.${cls}\\b`).test(css), `CSS 缺少 .${cls} 类`);
  }
  assert.match(css, /\.frameCard/);
  assert.match(css, /\.frameCardLocked/);
  assert.match(css, /\.diffOverlay/);
  assert.match(css, /\.diffDialog/);
});
