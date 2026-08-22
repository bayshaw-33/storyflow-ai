/**
 * P1-01 — 真实项目进度与状态整理。
 *
 * 撰写时 RED：
 *   - 进度只认 legacy 向导文本字段，V2 剧本项目（storyflow_screenplay_units
 *     为事实源）恒为 null/0%；"暂无可计算进度" 与 ready="已完成" 徽标并存。
 *   - archived 状态被 normalize 成 draft；art 行归档信息丢失。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const { getProjectProgress } = await import("../../lib/client/v2/project-library/helpers.ts");

function project(overrides = {}) {
  return {
    id: "p-1",
    title: "婚姻契约",
    workflowType: "creation",
    status: "draft",
    universeId: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    ...overrides,
  };
}

test("progress is computed from real screenplay unit readiness when present", () => {
  assert.equal(
    getProjectProgress(project({ screenplayUnits: { total: 4, usable: 1 } })),
    25,
    "usable(checkpoint|finalized)/total —— 规则可审计",
  );
  assert.equal(getProjectProgress(project({ screenplayUnits: { total: 5, usable: 5 } })), 100);
  // 无任何节点 = 缺少可计算事实，不是 0%
  assert.equal(getProjectProgress(project({ screenplayUnits: { total: 0, usable: 0 } })), null);
});

test("legacy wizard fields remain the fallback for old projects", () => {
  assert.equal(
    getProjectProgress(project({ idea: "x", brief: "y", characters: "", outline: "", episodes: "", finalScript: "" })),
    33,
  );
  assert.equal(getProjectProgress(project({ idea: "", brief: "", characters: "", outline: "", episodes: "", finalScript: "" })), 0);
});

test("non-creation workflows without computable facts report null", () => {
  assert.equal(getProjectProgress(project({ workflowType: "song" })), null);
  assert.equal(getProjectProgress(project({ workflowType: "art" })), null);
});

test("server listProjectLibrary aggregates screenplay units and flags empty shells", async () => {
  const source = read("../../lib/server/v2/project-library/index.ts");
  assert.match(source, /storyflow_screenplay_units/, "unit readiness is the progress fact source");
  assert.match(source, /screenplayUnits/, "records carry screenplayUnits {total, usable}");
  assert.match(source, /possiblyEmpty/, "projects with no works are flagged as cleanup candidates (mark-only, no delete)");
});

test("status labels no longer fuse 'ready' with '已完成' and preserve archived", () => {
  const source = read("../../components/v2/dashboard/ProjectManagement.tsx");
  assert.doesNotMatch(source, /ready:\s*"已完成"/, "'ready' means workbench-ready, not completed — the collision with '暂无可计算进度' destroyed trust");
  assert.match(source, /archived:\s*"已归档"|已归档/, "archived status must be visible");
  // 0% 有事实时显示“尚未开始”，而不是“0% 已完成”
  assert.match(source, /progress === 0 \? "尚未开始"/, "progress 0 must render as 尚未开始, not '0% 已完成'");
});

test("normalizeStatus keeps archived distinct from draft", () => {
  const source = read("../../lib/server/v2/project-library/index.ts");
  const normalize = /function normalizeStatus\(value: unknown\) \{[\s\S]*?\n\}/.exec(source)?.[0] ?? "";
  assert.match(normalize, /"archived"/, "archived passes through normalization");
});
