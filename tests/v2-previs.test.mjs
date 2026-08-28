import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultPrevisScene,
  interpolateTransform,
  parsePrevisScene,
  serializePrevisScene,
  upsertKeyframe,
} from "../lib/director/previs.ts";

test("白模预演默认场景使用 9:16，并包含可编辑摄影机与基础空间", () => {
  const scene = createDefaultPrevisScene();

  assert.equal(scene.aspectRatio, "9:16");
  assert.equal(scene.durationSeconds, 5);
  assert.ok(scene.camera);
  assert.ok(scene.objects.some((object) => object.kind === "room"));
  assert.ok(scene.objects.some((object) => object.kind === "actor_proxy"));
});

test("白模预演关键帧按时间替换同一对象的同一时刻", () => {
  const scene = createDefaultPrevisScene();
  const actor = scene.objects.find((object) => object.kind === "actor_proxy");
  assert.ok(actor);

  const next = upsertKeyframe(scene, actor.id, {
    timeSeconds: 5,
    transform: { position: [2, 0, -4], rotation: [0, 1, 0], scale: [1, 1, 1] },
  });
  const replaced = upsertKeyframe(next, actor.id, {
    timeSeconds: 5,
    transform: { position: [3, 0, -4], rotation: [0, 1, 0], scale: [1, 1, 1] },
  });

  assert.equal(replaced.objects.find((object) => object.id === actor.id)?.keyframes.length, 1);
  assert.deepEqual(replaced.objects.find((object) => object.id === actor.id)?.keyframes[0].transform.position, [3, 0, -4]);
});

test("白模预演在两个关键帧之间插值位置和旋转", () => {
  const transform = interpolateTransform(
    { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    { position: [4, 2, -6], rotation: [0, 1, 0], scale: [2, 2, 2] },
    0.5,
  );

  assert.deepEqual(transform.position, [2, 1, -3]);
  assert.deepEqual(transform.rotation, [0, 0.5, 0]);
  assert.deepEqual(transform.scale, [1.5, 1.5, 1.5]);
});

test("白模预演导出的 JSON 可校验恢复，且拒绝错误画幅", () => {
  const scene = createDefaultPrevisScene();
  const restored = parsePrevisScene(serializePrevisScene(scene));

  assert.deepEqual(restored, scene);
  assert.throws(
    () => parsePrevisScene(JSON.stringify({ ...scene, aspectRatio: "16:9" })),
    /aspectRatio/,
  );
});
