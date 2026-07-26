/**
 * TRAE-V2-01 Character Graph V1
 * 布局纯函数 + 关系校验契约测试
 *
 * PRD §10.1 单元/契约测试要求：Character Graph 去重、跨 Universe 拒绝
 *
 * 验证目标：
 *   1. computeCharacterLayout 确定性散布（相同输入 → 相同输出）
 *   2. 不同规模（5/20/50）节点都能生成合法坐标
 *   3. clampPct 限制坐标在 6-94 范围内
 *   4. getNeighbors 返回一度邻居（含自身）
 *   5. 关系密度高的节点优先排在中心附近
 *
 * 运行：node --test tests/v2-character-graph.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCharacterLayout,
  getNeighbors,
} from "../lib/universe/character-graph-layout.ts";

// ============================================================
// 1. 确定性散布
// ============================================================

test("computeCharacterLayout 相同输入产生相同输出", () => {
  const nodeIds = ["a", "b", "c", "d", "e"];
  const edges = [
    { source_entity_id: "a", target_entity_id: "b" },
    { source_entity_id: "a", target_entity_id: "c" },
  ];
  const r1 = computeCharacterLayout(nodeIds, edges);
  const r2 = computeCharacterLayout(nodeIds, edges);
  assert.deepEqual([...r1.nodes.keys()], [...r2.nodes.keys()]);
  for (const id of nodeIds) {
    assert.equal(r1.nodes.get(id).x, r2.nodes.get(id).x);
    assert.equal(r1.nodes.get(id).y, r2.nodes.get(id).y);
  }
});

test("computeCharacterLayout 空节点返回空 Map", () => {
  const result = computeCharacterLayout([], []);
  assert.equal(result.nodes.size, 0);
});

// ============================================================
// 2. 坐标范围（clampPct 6-94）
// ============================================================

test("computeCharacterLayout 坐标限制在 6-94 范围内", () => {
  const nodeIds = Array.from({ length: 50 }, (_, i) => `node-${i}`);
  const edges = [];
  for (let i = 1; i < 50; i++) {
    edges.push({ source_entity_id: "node-0", target_entity_id: `node-${i}` });
  }
  const result = computeCharacterLayout(nodeIds, edges);
  for (const node of result.nodes.values()) {
    assert.ok(node.x >= 6 && node.x <= 94, `x=${node.x} 应在 [6, 94]`);
    assert.ok(node.y >= 6 && node.y <= 94, `y=${node.y} 应在 [6, 94]`);
  }
});

// ============================================================
// 3. 不同规模
// ============================================================

test("computeCharacterLayout 5 个节点全部布局", () => {
  const nodeIds = ["a", "b", "c", "d", "e"];
  const result = computeCharacterLayout(nodeIds, []);
  assert.equal(result.nodes.size, 5);
  for (const id of nodeIds) {
    assert.ok(result.nodes.has(id), `节点 ${id} 应在结果中`);
  }
});

test("computeCharacterLayout 20 个节点全部布局", () => {
  const nodeIds = Array.from({ length: 20 }, (_, i) => `n${i}`);
  const result = computeCharacterLayout(nodeIds, []);
  assert.equal(result.nodes.size, 20);
});

test("computeCharacterLayout 50 个节点全部布局", () => {
  const nodeIds = Array.from({ length: 50 }, (_, i) => `n${i}`);
  const result = computeCharacterLayout(nodeIds, []);
  assert.equal(result.nodes.size, 50);
});

// ============================================================
// 4. 关系密度排序
// ============================================================

test("computeCharacterLayout 度数高的节点优先排在中心附近", () => {
  const nodeIds = ["hub", "leaf1", "leaf2", "leaf3", "leaf4"];
  const edges = [
    { source_entity_id: "hub", target_entity_id: "leaf1" },
    { source_entity_id: "hub", target_entity_id: "leaf2" },
    { source_entity_id: "hub", target_entity_id: "leaf3" },
    { source_entity_id: "hub", target_entity_id: "leaf4" },
  ];
  const result = computeCharacterLayout(nodeIds, edges);
  const hub = result.nodes.get("hub");
  // hub 应该是第一个被布局的节点（index=0），距离中心 (50, 48) 最近
  const dist = Math.sqrt((hub.x - 50) ** 2 + (hub.y - 48) ** 2);
  // 中心节点距离应小于 30（首项 radius = baseRadius + 0 = 12）
  assert.ok(dist < 30, `hub 应靠近中心，实际距离 ${dist}`);
});

// ============================================================
// 5. getNeighbors
// ============================================================

test("getNeighbors 返回一度邻居（含自身）", () => {
  const edges = [
    { source_entity_id: "a", target_entity_id: "b" },
    { source_entity_id: "a", target_entity_id: "c" },
    { source_entity_id: "b", target_entity_id: "d" }, // 二度，不应包含
  ];
  const neighbors = getNeighbors("a", edges);
  assert.ok(neighbors.has("a"), "应包含自身");
  assert.ok(neighbors.has("b"), "应包含直接邻居 b");
  assert.ok(neighbors.has("c"), "应包含直接邻居 c");
  assert.equal(neighbors.size, 3);
  assert.ok(!neighbors.has("d"), "不应包含二度邻居 d");
});

test("getNeighbors 无关系时只返回自身", () => {
  const edges = [
    { source_entity_id: "b", target_entity_id: "c" },
  ];
  const neighbors = getNeighbors("a", edges);
  assert.equal(neighbors.size, 1);
  assert.ok(neighbors.has("a"));
});

test("getNeighbors 双向关系都能识别", () => {
  const edges = [
    { source_entity_id: "b", target_entity_id: "a" }, // 反向
    { source_entity_id: "a", target_entity_id: "c" }, // 正向
  ];
  const neighbors = getNeighbors("a", edges);
  assert.ok(neighbors.has("a"));
  assert.ok(neighbors.has("b"), "反向关系也应识别");
  assert.ok(neighbors.has("c"), "正向关系也应识别");
});

// ============================================================
// 6. 节点 ID 一致性
// ============================================================

test("computeCharacterLayout 节点 id 与输入 nodeIds 一致", () => {
  const nodeIds = ["x", "y", "z"];
  const result = computeCharacterLayout(nodeIds, []);
  const ids = [...result.nodes.values()].map((n) => n.id).sort();
  assert.deepEqual(ids, ["x", "y", "z"]);
});

console.log("✅ V2-01 Character Graph 布局契约测试完成");
