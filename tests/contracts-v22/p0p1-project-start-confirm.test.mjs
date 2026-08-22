/**
 * P0-06 — 确认式项目创建（模块点击零副作用）。
 *
 * 撰写时 RED：模块卡 onClick 直接调用 startProject（默认标题"未命名X"，
 * 每次点击新幂等键），取消/关闭/返回都会留下已提交的 Project/Work 行。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../../components/v2/project-start/ProjectStartFlow.tsx", import.meta.url),
  "utf8",
);

test("module card click only opens a confirmation step, never the create API", () => {
  assert.doesNotMatch(source, /onClick=\{\(\) => handleStart\(/, "clicking a card must not call startProject");
  assert.match(source, /setPendingModule\(/, "clicking a card opens the pending-module confirmation state");
});

test("confirmation panel collects title, fixed module, and an optional Universe", () => {
  assert.match(source, /data-testid="project-title-input"/, "explicit project-name input (placeholder = default title, user must confirm)");
  assert.match(source, /data-testid="project-universe-select"/, "optional Universe binding select");
  assert.match(source, /data-testid="project-create-cancel"/, "cancel action must exist");
  assert.match(source, /data-testid="project-create-confirm"/, "explicit confirm action must exist");
});

test("cancel clears local state only — no API call, no navigation", () => {
  const cancelIdx = source.indexOf("cancelPendingModule");
  assert.ok(cancelIdx !== -1, "dedicated cancel handler");
  const handler = source.slice(source.indexOf("const cancelPendingModule"), source.indexOf("const cancelPendingModule") + 400);
  assert.match(handler, /setPendingModule\(null\)/);
  assert.doesNotMatch(handler, /startProject|router\.push|router\.replace/, "cancel must be side-effect free");
  // overlay click / cancel button both cancel without side effects
  assert.match(source, /onClick=\{cancelPendingModule\}/);
});

test("idempotency key is minted once per submission and reused across retries", () => {
  assert.match(source, /idempotencyKeyRef/, "key lives in a ref, not regenerated per attempt");
  const handler = source.slice(
    source.indexOf("const handleStart"),
    source.indexOf("const handleStart") + 2200,
  );
  assert.match(handler, /idempotencyKeyRef\.current \?\?=/, "reuse the existing key when retrying after a failure");
});

test("startProject is only reachable from the confirm handler", () => {
  const confirmBlock = source.slice(
    source.indexOf("data-testid=\"project-create-confirm\""),
    source.indexOf("data-testid=\"project-create-confirm\"") + 900,
  );
  assert.match(confirmBlock, /handleStart\(/, "confirm button triggers the create flow");
});
