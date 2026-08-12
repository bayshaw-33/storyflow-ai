// K2-T-03 渐进式项目创建 · 单元测试
// 参考 tests/creation-state.test.mjs 写法，使用 node:test + node:assert/strict

import assert from "node:assert/strict";
import test from "node:test";

import {
  loadProjectStartFixture,
  filterUniverseOptions,
  validateContractVersion,
  buildProjectStartRequest,
  resolveWorkbenchRoute,
} from "../../../lib/client/v2/project-start/fixtures.ts";
import { CONTRACT_VERSION } from "../../../lib/client/v2/project-start/types.ts";

// ===== 1. Fixture 数据结构 =====

test("fixture 文件可加载且包含必需字段", () => {
  const fixture = loadProjectStartFixture();
  assert.ok(fixture, "fixture 不应为空");
  assert.equal(typeof fixture.contractVersion, "string");
  assert.ok(Array.isArray(fixture.contentTypeOptions));
  assert.ok(Array.isArray(fixture.startModes));
  assert.ok(Array.isArray(fixture.universeOptions));
});

test("fixture contractVersion 等于 2.0.0-alpha.1", () => {
  const fixture = loadProjectStartFixture();
  assert.equal(fixture.contractVersion, "2.0.0-alpha.1");
  assert.equal(fixture.contractVersion, CONTRACT_VERSION);
});

test("contentTypeOptions 包含全部 5 种内容类型", () => {
  const fixture = loadProjectStartFixture();
  const expected = ["drama", "novel", "song", "storyboard", "video"];
  assert.deepEqual(fixture.contentTypeOptions.sort(), expected.sort());
});

test("startModes 包含全部 3 种开始方式", () => {
  const fixture = loadProjectStartFixture();
  const expected = ["idea", "script", "material"];
  assert.deepEqual(fixture.startModes.sort(), expected.sort());
});

test("每个 universeOption 含完整字段且类型正确", () => {
  const fixture = loadProjectStartFixture();
  assert.ok(fixture.universeOptions.length >= 3, "至少 3 个 universe 选项用于测试");
  for (const opt of fixture.universeOptions) {
    assert.equal(typeof opt.id, "string", `id 应为 string: ${JSON.stringify(opt)}`);
    assert.equal(typeof opt.name, "string", `name 应为 string`);
    assert.equal(typeof opt.summary, "string", `summary 应为 string`);
    assert.equal(typeof opt.characterCount, "number", `characterCount 应为 number`);
    assert.equal(typeof opt.ruleCount, "number", `ruleCount 应为 number`);
    assert.equal(typeof opt.lastActivityAt, "string", `lastActivityAt 应为 string`);
    assert.equal(typeof opt.healthScore, "number", `healthScore 应为 number`);
    assert.ok(opt.healthScore >= 0 && opt.healthScore <= 100, "healthScore 应在 0-100 之间");
  }
});

test("universeOption 的 lastActivityAt 是合法 ISO 时间", () => {
  const fixture = loadProjectStartFixture();
  for (const opt of fixture.universeOptions) {
    const d = new Date(opt.lastActivityAt);
    assert.ok(!isNaN(d.getTime()), `lastActivityAt 应为合法 ISO: ${opt.lastActivityAt}`);
  }
});

// ===== 2. contract_version 校验 =====

test("validateContractVersion 对当前版本返回 true", () => {
  assert.equal(validateContractVersion(CONTRACT_VERSION), true);
  assert.equal(validateContractVersion("2.0.0-alpha.1"), true);
});

test("validateContractVersion 对错误版本返回 false", () => {
  assert.equal(validateContractVersion("1.0.0"), false);
  assert.equal(validateContractVersion("2.0.0"), false);
  assert.equal(validateContractVersion(""), false);
  assert.equal(validateContractVersion("2.0.0-alpha.2"), false);
});

// ===== 3. Universe 搜索/过滤逻辑 =====

test("空查询返回全部 Universe", () => {
  const fixture = loadProjectStartFixture();
  const result = filterUniverseOptions(fixture.universeOptions, "");
  assert.equal(result.length, fixture.universeOptions.length);
});

test("空白查询返回全部 Universe", () => {
  const fixture = loadProjectStartFixture();
  const result = filterUniverseOptions(fixture.universeOptions, "   ");
  assert.equal(result.length, fixture.universeOptions.length);
});

test("按名称关键词过滤（大小写不敏感）", () => {
  const fixture = loadProjectStartFixture();
  const result = filterUniverseOptions(fixture.universeOptions, "aurora");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "universe-aurora");
});

test("按摘要中文关键词过滤", () => {
  const fixture = loadProjectStartFixture();
  const result = filterUniverseOptions(fixture.universeOptions, "宇宙");
  assert.ok(result.length >= 1, "至少匹配一项含「宇宙」的摘要");
  for (const opt of result) {
    assert.ok(opt.summary.includes("宇宙"), `结果应包含关键词: ${opt.name}`);
  }
});

test("无匹配时返回空数组", () => {
  const fixture = loadProjectStartFixture();
  const result = filterUniverseOptions(fixture.universeOptions, "zzz_no_match_xxx");
  assert.equal(result.length, 0);
});

test("同时匹配名称或摘要", () => {
  const fixture = loadProjectStartFixture();
  // "iron" 匹配名称 "Iron Hymn"
  const byName = filterUniverseOptions(fixture.universeOptions, "iron");
  assert.ok(byName.length >= 1);
  assert.ok(byName.some((o) => o.id === "universe-iron-hymn"));
  // "群岛" 匹配摘要
  const bySummary = filterUniverseOptions(fixture.universeOptions, "群岛");
  assert.ok(bySummary.length >= 1);
  assert.ok(bySummary.some((o) => o.id === "universe-tidewatch"));
});

// ===== 4. 项目创建请求组装 =====

test("buildProjectStartRequest 正常组装请求", () => {
  const request = buildProjectStartRequest({
    contentType: "drama",
    startMode: "idea",
    title: "霓虹之夜",
    universeAction: "create_new",
  });
  assert.equal(request.contentType, "drama");
  assert.equal(request.startMode, "idea");
  assert.equal(request.title, "霓虹之夜");
  assert.equal(request.universeAction, "create_new");
  assert.equal(request.universeId, undefined);
  assert.equal(request.contractVersion, CONTRACT_VERSION);
});

test("buildProjectStartRequest 标题会被 trim", () => {
  const request = buildProjectStartRequest({
    contentType: "novel",
    startMode: "script",
    title: "  带空格的标题  ",
    universeAction: "skip",
  });
  assert.equal(request.title, "带空格的标题");
});

test("buildProjectStartRequest 空标题抛错", () => {
  assert.throws(
    () => buildProjectStartRequest({
      contentType: "drama",
      startMode: "idea",
      title: "   ",
      universeAction: "skip",
    }),
    /title is required/i,
  );
});

test("buildProjectStartRequest bind_existing 时必须提供 universeId", () => {
  assert.throws(
    () => buildProjectStartRequest({
      contentType: "drama",
      startMode: "idea",
      title: "测试",
      universeAction: "bind_existing",
    }),
    /universeId is required/i,
  );
});

test("buildProjectStartRequest bind_existing 时带 universeId 正常", () => {
  const request = buildProjectStartRequest({
    contentType: "drama",
    startMode: "idea",
    title: "测试",
    universeAction: "bind_existing",
    universeId: "universe-aurora",
  });
  assert.equal(request.universeAction, "bind_existing");
  assert.equal(request.universeId, "universe-aurora");
});

test("buildProjectStartRequest skip 时 universeId 被忽略", () => {
  const request = buildProjectStartRequest({
    contentType: "video",
    startMode: "material",
    title: "测试",
    universeAction: "skip",
    universeId: "universe-aurora",
  });
  assert.equal(request.universeAction, "skip");
  assert.equal(request.universeId, undefined);
});

test("buildProjectStartRequest create_new 时 universeId 被忽略", () => {
  const request = buildProjectStartRequest({
    contentType: "song",
    startMode: "idea",
    title: "测试",
    universeAction: "create_new",
    universeId: "universe-aurora",
  });
  assert.equal(request.universeAction, "create_new");
  assert.equal(request.universeId, undefined);
});

test("所有 contentType 与 startMode 组合都能组装请求", () => {
  const fixture = loadProjectStartFixture();
  for (const contentType of fixture.contentTypeOptions) {
    for (const startMode of fixture.startModes) {
      const request = buildProjectStartRequest({
        contentType,
        startMode,
        title: `组合测试-${contentType}-${startMode}`,
        universeAction: "skip",
      });
      assert.equal(request.contentType, contentType);
      assert.equal(request.startMode, startMode);
      assert.equal(request.contractVersion, CONTRACT_VERSION);
    }
  }
});

// ===== 5. 工作台路由解析 =====

test("resolveWorkbenchRoute 短剧跳转到 novel-workbench", () => {
  assert.equal(resolveWorkbenchRoute("drama"), "/novel-workbench");
});

test("resolveWorkbenchRoute 小说跳转到 novel-workbench", () => {
  assert.equal(resolveWorkbenchRoute("novel"), "/novel-workbench");
});

test("resolveWorkbenchRoute 歌曲跳转到 song-workbench", () => {
  assert.equal(resolveWorkbenchRoute("song"), "/song-workbench");
});

test("resolveWorkbenchRoute 分镜跳转到 production planning", () => {
  assert.equal(resolveWorkbenchRoute("storyboard"), "/production?mode=planning");
});

test("resolveWorkbenchRoute 视频跳转到 production editor", () => {
  assert.equal(resolveWorkbenchRoute("video"), "/production?mode=editor");
});

test("所有 contentType 都有对应的工作台路由", () => {
  const fixture = loadProjectStartFixture();
  for (const contentType of fixture.contentTypeOptions) {
    const route = resolveWorkbenchRoute(contentType);
    assert.ok(route.startsWith("/"), `路由应以 / 开头: ${route}`);
    assert.ok(route.length > 1, `路由不应为空: ${route}`);
  }
});
