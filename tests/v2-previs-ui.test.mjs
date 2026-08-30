import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const stage = readFileSync(new URL("../components/production/UnifiedStoryboardStage.tsx", import.meta.url), "utf8");
const workbench = readFileSync(new URL("../components/production/ProductionWorkbench.tsx", import.meta.url), "utf8");

test("白模预演作为运动预览内的按需内容，不新增顶层制作阶段", () => {
  assert.match(stage, /WhiteModelPrevis/);
  assert.match(stage, /白模预演/);
  assert.doesNotMatch(workbench, /UnifiedProductionStage.*previs/);
});

test("白模预演提供可见的播放、时间轴、截图与 JSON 导出操作", () => {
  const source = readFileSync(new URL("../components/production/WhiteModelPrevis.tsx", import.meta.url), "utf8");
  const integration = readFileSync(new URL("../lib/director/previs-integration.ts", import.meta.url), "utf8");
  assert.match(source, /播放|暂停/);
  assert.match(source, /type="range"/);
  assert.match(source, /截图/);
  assert.match(source, /导出场景 JSON/);
  assert.match(source, /localStorage/);
  assert.match(source, /记录摄影机关键帧/);
  assert.match(source, /载入当前镜头/);
  assert.match(source, /保存并送视频/);
  assert.match(source, /复制视频提示词/);
  assert.match(integration, /manualConfirmationRequired/);
});

test("白模预演为空分镜项目提供安全空态，不初始化不存在的镜头", () => {
  const source = readFileSync(new URL("../components/production/WhiteModelPrevis.tsx", import.meta.url), "utf8");
  assert.match(source, /shotOptions\.length === 0/);
  assert.match(source, /尚无分镜镜头/);
  assert.match(source, /当前项目还没有可载入的分镜镜头/);
});

test("白模预演从统一分镜工作台接收镜头和资产上下文", () => {
  assert.match(stage, /previsShots/);
  assert.match(stage, /previsAssets/);
  assert.match(stage, /shotOptions=\{previsShots\}/);
  assert.match(workbench, /buildPrevisShotOptions/);
});
