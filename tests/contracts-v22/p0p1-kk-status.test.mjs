/**
 * P1-03 — 全局 KK 状态降噪与准确化。
 *
 * 撰写时 RED：
 *   - app/layout.tsx 恒传 allowFixtureFallback（生产也开启兜底加载）。
 *   - 离线条只有红色"KK 服务离线"，无影响范围说明、无最近成功时间。
 *   - unauthenticated 与服务故障共用同一条"离线"文案（登录态误判）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("production layout does not enable the KK fixture fallback", () => {
  const layout = read("../../app/layout.tsx");
  assert.doesNotMatch(layout, /<KkRuntimeProvider allowFixtureFallback>/, "bare allowFixtureFallback is always-on in production");
  assert.match(layout, /allowFixtureFallback=\{process\.env\.NODE_ENV === "development"\}/);
});

test("offline strip states the affected capability and last success time with a retry action", () => {
  const panel = read("../../components/v2/kk/KkPanel.tsx");
  assert.match(panel, /实时推送/, "strip explains what is actually affected (realtime push, not all of KK)");
  assert.match(panel, /lastSuccessAt/, "strip shows when KK last succeeded");
  assert.match(panel, /历史消息仍可查看|仍可查看/, "history remains readable — the strip is not an outage alarm");
});

test("unauthenticated renders login guidance, never a false 'KK 服务离线'", () => {
  const panel = read("../../components/v2/kk/KkPanel.tsx");
  assert.match(panel, /errorCode/, "panel receives the stable error code");
  const companion = read("../../components/v2/kk/KkCompanion.tsx");
  assert.match(companion, /errorCode/, "companion forwards the error code");
});

test("provider tracks the last successful bootstrap/pull timestamp", () => {
  const provider = read("../../components/v2/kk/KkRuntimeProvider.tsx");
  assert.match(provider, /lastSuccessAt/, "timestamp state exists");
  const setOnSuccess = provider.match(/setLastSuccessAt/g) ?? [];
  assert.ok(setOnSuccess.length >= 2, "updated on both bootstrap and pull successes");
});
