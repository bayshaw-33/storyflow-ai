/**
 * universe-library-ui tests — PRD v3.0 §5 列表页 UI 视图模型
 *
 * 覆盖：
 * - filterAndSortUniverses: 搜索/状态/标签/排序组合
 * - sanitizeCardSummary: Markdown 清除 + 截断
 * - 35,000 字 description 不影响卡片高度（通过 sanitizeCardSummary 截断）
 * - collectUniverseTags 去重
 * - stripMarkdown 清除 #、**、>、- 等标记
 *
 * 运行：node --test tests/universe-library-ui.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_UNIVERSE_FILTER,
  collectUniverseTags,
  filterAndSortUniverses,
  sanitizeCardSummary,
  stripMarkdown,
  truncateForCard,
} from "../components/universe/universe-view-model.ts";

function makeItem(overrides = {}) {
  return {
    id: "u1",
    name: "陨神之墓",
    status: "active",
    cardSummary: "短摘要。",
    coverUrl: null,
    tags: ["奇幻"],
    workCount: 1,
    characterCount: 5,
    locationCount: 3,
    pendingInboxCount: 0,
    updatedAt: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

// 1. 搜索按 name 和 cardSummary（不扫描 description）
test("filterAndSortUniverses 按 name 和 cardSummary 搜索", () => {
  const list = [
    makeItem({ id: "u1", name: "陨神之墓", cardSummary: "考古学家" }),
    makeItem({ id: "u2", name: "星河", cardSummary: "太空歌剧" }),
  ];
  const result = filterAndSortUniverses(list, { ...DEFAULT_UNIVERSE_FILTER, search: "考古" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "u1");
});

// 2. 状态筛选
test("filterAndSortUniverses 按状态筛选", () => {
  const list = [
    makeItem({ id: "u1", status: "active" }),
    makeItem({ id: "u2", status: "archived" }),
  ];
  const result = filterAndSortUniverses(list, { ...DEFAULT_UNIVERSE_FILTER, status: "active" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "u1");
});

// 3. 标签筛选
test("filterAndSortUniverses 按标签筛选", () => {
  const list = [
    makeItem({ id: "u1", tags: ["奇幻", "悬疑"] }),
    makeItem({ id: "u2", tags: ["科幻"] }),
  ];
  const result = filterAndSortUniverses(list, { ...DEFAULT_UNIVERSE_FILTER, tag: "悬疑" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "u1");
});

// 4. 排序：name / works / updated
test("filterAndSortUniverses 排序：name 升序", () => {
  const list = [
    makeItem({ id: "u1", name: "Beta" }),
    makeItem({ id: "u2", name: "Alpha" }),
  ];
  const result = filterAndSortUniverses(list, { ...DEFAULT_UNIVERSE_FILTER, sort: "name" });
  assert.equal(result[0].id, "u2");
  assert.equal(result[1].id, "u1");
});

test("filterAndSortUniverses 排序：works 倒序", () => {
  const list = [
    makeItem({ id: "u1", workCount: 1 }),
    makeItem({ id: "u2", workCount: 5 }),
  ];
  const result = filterAndSortUniverses(list, { ...DEFAULT_UNIVERSE_FILTER, sort: "works" });
  assert.equal(result[0].id, "u2");
});

// 5. sanitizeCardSummary 清除 Markdown
test("sanitizeCardSummary 清除 Markdown 标记", () => {
  assert.equal(sanitizeCardSummary("## 标题\n正文"), "标题\n正文");
  assert.equal(sanitizeCardSummary("**粗体**"), "粗体");
  assert.equal(sanitizeCardSummary("> 引用"), "引用");
  assert.equal(sanitizeCardSummary("- 列表项"), "列表项");
  assert.equal(sanitizeCardSummary("[链接](https://x)"), "链接");
});

// 6. 35,000 字 description 不影响卡片高度（中文截断到 60 字 + 省略号）
test("35,000 字 description 截断到 60 字 + 省略号，不影响卡片高度", () => {
  // 含中文字符触发 CJK 检测，按中文 60 字限制截断
  const huge = "我".repeat(35000);
  const result = sanitizeCardSummary(huge);
  assert.ok(result.length <= 61, `截断后长度 ${result.length} > 61`);
  assert.ok(result.endsWith("…"));
});

// 7. truncateForCard 中文 60 字 / 英文 160 字
test("truncateForCard 中文 60 字 / 英文 160 字", () => {
  const cn = "我".repeat(100);
  const en = "a".repeat(200);
  const cnResult = truncateForCard(cn);
  const enResult = truncateForCard(en);
  assert.ok(cnResult.length <= 61);
  assert.ok(enResult.length <= 161);
});

// 8. collectUniverseTags 去重并排序
test("collectUniverseTags 去重并排序", () => {
  const list = [
    makeItem({ tags: ["奇幻", "悬疑"] }),
    makeItem({ tags: ["奇幻", "科幻"] }),
  ];
  const tags = collectUniverseTags(list);
  assert.deepEqual(tags, ["奇幻", "悬疑", "科幻"].sort());
  assert.equal(new Set(tags).size, tags.length, "tags 不得重复");
});

// 9. stripMarkdown 清除所有原始符号
test("stripMarkdown 不残留 #、**、>、- 等原始符号", () => {
  const result = stripMarkdown("## H\n**b**\n> q\n- item\n[a](http://x)");
  assert.ok(!result.includes("#"), "不得残留 #");
  assert.ok(!result.includes("**"), "不得残留 **");
  assert.ok(!result.includes("> "), "不得残留 > ");
  assert.ok(!result.includes("- "), "不得残留 - ");
  assert.ok(!result.includes("]"), "不得残留 ]");
  assert.ok(!result.includes("http"), "不得残留链接 URL");
});
