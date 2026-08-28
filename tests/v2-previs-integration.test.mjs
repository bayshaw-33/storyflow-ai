import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrevisSceneForShot,
  buildVideoHandoffPackage,
  buildPrevisShotOptions,
} from "../lib/director/previs-integration.ts";
import { createDefaultPrevisScene } from "../lib/director/previs.ts";

const scenes = [{
  id: "scene-1",
  clientId: "scene-client-1",
  idSource: "server",
  order: 1,
  heading: "INT. 工作室 - NIGHT",
  location: "工作室",
  timeOfDay: "夜",
  summary: "两人交换秘密",
  sourceText: "室内，夜。",
  characterAssetIds: ["char-1"],
  propAssetIds: ["prop-1"],
  shots: [{
    id: "shot-1",
    idSource: "server",
    sceneId: "scene-1",
    order: 1,
    sourceText: "艾达推门而入。",
    storyBeat: "进入",
    visualDescription: "艾达推门，镜头跟随她进入工作室。",
    characterAssetIds: ["char-1"],
    sceneAssetId: "location-1",
    propAssetIds: ["prop-1"],
    shotSize: "中景",
    cameraMovement: "跟随推进",
    angle: "平视",
    durationSeconds: 6,
    dialogue: "我知道你在这里。",
    emotion: "警觉",
    continuity: "",
    imagePrompt: "",
    jimengPromptZh: "",
    locked: false,
    userEdited: false,
    confirmed: true,
    revision: 1,
    analysisVersion: 1,
    sourceHash: "hash",
  }],
  locked: false,
  userEdited: false,
  confirmed: true,
  revision: 1,
  analysisVersion: 1,
  sourceHash: "hash",
}];

const assets = {
  characters: [{ assetId: "char-1", kind: "character", name: "艾达", scriptBasis: "主角", description: "短发", visualKeywords: ["短发"], prompt: "", selectedVersionId: "char-v2" }],
  locations: [{ assetId: "location-1", kind: "location", name: "工作室", scriptBasis: "场景", description: "狭窄工作室", visualKeywords: ["夜"], prompt: "", selectedVersionId: "location-v1" }],
  props: [{ assetId: "prop-1", kind: "prop", name: "旧钥匙", scriptBasis: "道具", description: "黄铜钥匙", visualKeywords: ["黄铜"], prompt: "", selectedVersionId: "prop-v3" }],
};

test("分镜上下文按稳定资产身份生成白模镜头选项", () => {
  const options = buildPrevisShotOptions(scenes, assets, { "shot-1": { imageUrl: "https://cdn.test/shot.png" } }, { "shot-1": { jimengVideoPrompt: "跟随推进，夜景" } });

  assert.equal(options.length, 1);
  assert.deepEqual(options[0].characterAssetIds, ["char-1"]);
  assert.equal(options[0].storyboardImageUrl, "https://cdn.test/shot.png");
  assert.equal(options[0].videoPrompt, "跟随推进，夜景");

  const scene = buildPrevisSceneForShot(options[0], assets);
  assert.equal(scene.aspectRatio, "9:16");
  assert.equal(scene.durationSeconds, 5);
  assert.deepEqual(scene.objects.map((object) => object.assetId), ["location-1", "char-1", "prop-1"]);
  assert.equal(scene.objects[1].name, "艾达");
});

test("白模交付包包含轨迹、首帧和人工确认标记", () => {
  const option = buildPrevisShotOptions(scenes, assets, {}, {})[0];
  const scene = createDefaultPrevisScene();
  const packageData = buildVideoHandoffPackage({
    projectId: "project-1",
    workId: "storyboard-work-1",
    unitId: "unit-1",
    shot: option,
    scene,
    firstframeUrl: option.storyboardImageUrl,
    prompt: option.videoPrompt,
    createdAt: "2026-08-28T10:00:00.000Z",
  });

  assert.equal(packageData.kind, "kiikis.previs.video-handoff");
  assert.equal(packageData.aspectRatio, "9:16");
  assert.equal(packageData.firstframeUrl, null);
  assert.equal(packageData.manualConfirmationRequired, true);
  assert.equal(packageData.shotId, "shot-1");
  assert.deepEqual(packageData.previs.camera.position, scene.camera.position);
  assert.equal(packageData.previs.objects[0].assetId, undefined);
  assert.match(packageData.motionSummary, /跟随推进/);
});
