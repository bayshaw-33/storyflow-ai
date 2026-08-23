/**
 * 剪辑阶段集成 — /production 五阶段（script|art|storyboard|video|editing）。
 *
 * 背景：剪辑台（/editor + EditorFramework/TimelineEditorV22）已存在，但统一
 * 工作台重构后入口消失。本契约把 editing 作为第五阶段接入：tab 解析、顶栏
 * 按钮、PW 渲染 EditorFramework；editing 阶段不 provision Work（编辑器消费
 * projectId/sourceUnitId，无需 workId）。
 *
 * Run: node --test tests/contracts-v22/editing-stage.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const { UNIFIED_PRODUCTION_STAGES, parseUnifiedWorkbenchQuery, buildUnifiedWorkbenchUrl } =
  await import("../../lib/contracts/v2/unified-workbench.ts");

test("editing is the fifth unified production stage", () => {
  assert.deepEqual([...UNIFIED_PRODUCTION_STAGES], ["script", "art", "storyboard", "video", "editing"]);
});

test("tab=editing parses to the editing stage; edit is an alias", () => {
  assert.equal(parseUnifiedWorkbenchQuery("?projectId=p1&tab=editing").tab, "editing");
  assert.equal(parseUnifiedWorkbenchQuery("?projectId=p1&tab=edit").tab, "editing");
  // 旧别名行为不变
  assert.equal(parseUnifiedWorkbenchQuery("?projectId=p1&tab=editor").tab, "video");
  assert.equal(parseUnifiedWorkbenchQuery("?projectId=p1").tab, "script");
});

test("buildUnifiedWorkbenchUrl emits tab=editing", () => {
  assert.equal(
    buildUnifiedWorkbenchUrl({ projectId: "p1", tab: "editing", unitId: "u1" }),
    "/production?projectId=p1&tab=editing&unitId=u1",
  );
});

test("header stage metadata includes 剪辑 for editing", () => {
  const header = read("../../components/production/UnifiedProductionHeader.tsx");
  assert.match(header, /editing:\s*\{\s*label:\s*"剪辑"/);
});

test("production workbench renders EditorFramework for the editing stage", () => {
  const pw = read("../../components/production/ProductionWorkbench.tsx");
  assert.match(pw, /import \{ EditorFramework \} from "@\/components\/editor\/EditorFramework"/);
  assert.match(pw, /activeStage === "editing"/);
  assert.match(pw, /<EditorFramework\s+projectId=\{projectId\}/);
  assert.match(pw, /sourceUnitId=\{sourceUnitId \|\| "legacy"\}/);
  assert.match(pw, /accessToken=\{session\?\.access_token \?\? null\}/);
  // editing 阶段没有需求墙：不允许 startStage("editing")（无 Work 可补建）
  assert.doesNotMatch(pw, /startStage\("editing"\)/);
});

test("ensureStageWork refuses to provision a Work for the editing stage (editor consumes project/unit, not works)", async () => {
  const { ensureStageWork, UnifiedWorkbenchServiceError } = await import("../../lib/server/v2/unified-workbench/index.ts");
  const calls = [];
  const fetcher = async (path, init) => {
    calls.push({ path, init });
    return { work_id: "w-1", created: true };
  };
  await assert.rejects(
    ensureStageWork({ projectId: "p1", ownerId: "o1", stage: "editing", idempotencyKey: "k1", fetcher }),
    (error) => error instanceof UnifiedWorkbenchServiceError && error.code === "validation_failed",
  );
  assert.equal(calls.length, 0, "must not call the ensure_project_stage_work RPC for editing");
});
