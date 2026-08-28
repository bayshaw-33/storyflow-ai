// K2-I-01 Universe API 适配器测试
// 覆盖：fixture 路径、真实 API 路径（mock fetch）、DTO 映射、错误状态（401/403/404/500）、
// Authorization Bearer 头、契约版本校验、Inbox/Canon 操作端点。

import assert from "node:assert/strict";
import test from "node:test";

// P1-04 同款契约：fixture 为显式开启（fail-closed，production 恒关）。
// 本文件覆盖 fixture 路径：development 模式 + 显式变量才能开启；
// 默认关闭契约见 runtime-mode 审计。
process.env.NODE_ENV = "development";
process.env.NEXT_PUBLIC_USE_UNIVERSE_FIXTURE = "true";

const {
  fetchUniverseBundle,
  fetchUniverseBundleFromApi,
  fetchUniverseProposals,
  runCanonCheck,
  fetchImpactAnalysis,
  applyInboxAction,
  toggleCanonFactLock,
  UniverseApiError,
  isUnauthenticatedError,
  USE_FIXTURE,
} = await import("../../../lib/client/v2/universe/api.ts");

const TOKEN = "test-token";

// 构造 mock fetch：按 pathname 路由到不同 Response。
function makeFetch(routes) {
  return async (url, init) => {
    const u = typeof url === "string" ? new URL(url, "http://localhost") : url;
    const handler = routes[u.pathname];
    if (!handler) {
      return jsonRes({ success: false, error: "no mock", code: "not_found" }, 404);
    }
    return handler(init);
  };
}

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// 从 fetch init.headers 读取头（兼容普通对象 / Headers / 数组）。
function header(init, name) {
  return new Headers(init?.headers).get(name);
}

// 成功端点 mock 工厂。
function detailRes() {
  return jsonRes({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    universe: {
      id: "uni-1",
      name: "Test Universe",
      summary: "测试宇宙摘要",
      status: "draft",
      visibility: "team",
      currentVersion: "legacy",
      updatedAt: "2026-08-12T00:00:00+08:00",
    },
    bible: { summary: "核心前提", genre: "奇幻", tags: ["契约", "家族"] },
  });
}

function entitiesRes() {
  return jsonRes({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    items: [
      { id: "char-1", universeId: "uni-1", kind: "character", name: "Isadora", summary: "主角", status: "canon", updatedAt: "2026-08-12T00:00:00+08:00" },
      { id: "loc-1", universeId: "uni-1", kind: "location", name: "宅邸", summary: "主舞台", status: "canon", updatedAt: "2026-08-12T00:00:00+08:00" },
      { id: "org-1", universeId: "uni-1", kind: "organization", name: "守护者", summary: "中立组织", status: "draft", updatedAt: "2026-08-12T00:00:00+08:00" },
      { id: "obj-1", universeId: "uni-1", kind: "object", name: "契约之刃", summary: "仪式匕首", status: "canon", updatedAt: "2026-08-12T00:00:00+08:00" },
      { id: "con-1", universeId: "uni-1", kind: "concept", name: "影子契约", summary: "魔法体系", status: "canon", updatedAt: "2026-08-12T00:00:00+08:00" },
      { id: "rule-1", universeId: "uni-1", kind: "rule", name: "契约绑定", summary: "不可逆", status: "canon", updatedAt: "2026-08-12T00:00:00+08:00" },
    ],
  });
}

function worksRes() {
  return jsonRes({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    items: [
      { id: "proj-1", name: "EP06", contentType: "novel", productionStage: "script", universeId: "uni-1", updatedAt: "2026-08-12T00:00:00+08:00" },
    ],
  });
}

function healthRes() {
  return jsonRes({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    dimensions: [
      { key: "canon_completeness", label: "Canon 完整性", todos: [] },
      { key: "character_completeness", label: "角色完整度", todos: ["补充角色"] },
      { key: "relationship_timeline_completeness", label: "关系时间线", todos: [] },
      { key: "asset_coverage", label: "资产覆盖", todos: [] },
      { key: "pending_proposals", label: "待处理候选", todos: ["处理 4 条候选变更"] },
      { key: "conflicts_and_stale_snapshots", label: "冲突", todos: ["将 Universe 绑定到项目"] },
    ],
  });
}

// 全部 4 端点都成功的路由表。
function okRoutes() {
  return {
    "/api/v2/universes/uni-1": () => detailRes(),
    "/api/v2/universes/uni-1/entities": () => entitiesRes(),
    "/api/v2/universes/uni-1/works": () => worksRes(),
    "/api/v2/universes/uni-1/health": () => healthRes(),
  };
}

// ============ fixture 路径 ============

test("USE_FIXTURE 在显式 dev+env 下开启（fail-closed 契约）", () => {
  assert.equal(USE_FIXTURE, true);
});

test("USE_FIXTURE=true 时 fetchUniverseBundle 走 fixture 返回内联数据", async () => {
  const bundle = await fetchUniverseBundle("uni-umbral", null, {});
  assert.equal(bundle.universe.id, "uni-umbral");
  assert.equal(bundle.contractVersion, "2.0.0-alpha.1");
});

test("USE_FIXTURE=true 时不调用 fetch", async () => {
  let called = 0;
  const fetchImpl = async () => { called++; return new Response(); };
  await fetchUniverseBundle("uni-umbral", null, { fetchImpl });
  assert.equal(called, 0, "fixture 模式不应调用 fetch");
});

test("applyInboxAction / toggleCanonFactLock 在 fixture 模式返回成功", async () => {
  const r = await applyInboxAction("uni-umbral", "cp-001", "accept");
  assert.equal(r.success, true);
  const l = await toggleCanonFactLock("uni-umbral", "canon-001", true);
  assert.equal(l.success, true);
});

// ============ 真实 API 路径 ============

test("fetchUniverseBundleFromApi 并行请求 4 个端点并带 Authorization Bearer", async () => {
  const seen = [];
  const fetchImpl = makeFetch({
    "/api/v2/universes/uni-1": (init) => { seen.push(["detail", header(init, "Authorization")]); return detailRes(); },
    "/api/v2/universes/uni-1/entities": (init) => { seen.push(["entities", header(init, "Authorization")]); return entitiesRes(); },
    "/api/v2/universes/uni-1/works": (init) => { seen.push(["works", header(init, "Authorization")]); return worksRes(); },
    "/api/v2/universes/uni-1/health": (init) => { seen.push(["health", header(init, "Authorization")]); return healthRes(); },
  });
  const bundle = await fetchUniverseBundleFromApi("uni-1", TOKEN, { fetchImpl });

  // 4 个端点都被调用。
  assert.equal(seen.length, 4, "应并行请求 4 个端点");
  // 都带 Bearer token。
  for (const [, auth] of seen) {
    assert.equal(auth, `Bearer ${TOKEN}`);
  }

  // DTO 映射：universe 详情。
  assert.equal(bundle.universe.id, "uni-1");
  assert.equal(bundle.universe.name, "Test Universe");
  assert.equal(bundle.universe.status, "draft");
  assert.equal(bundle.universe.visibility, "team");
  assert.equal(bundle.universe.currentVersion, "legacy");
  assert.equal(bundle.universe.corePremise, "核心前提", "bible.summary 应映射到 corePremise");
  assert.equal(bundle.contractVersion, "2.0.0-alpha.1");

  // bible 字段保留。
  assert.equal(bundle.bible.genre, "奇幻");
  assert.deepEqual(bundle.bible.tags, ["契约", "家族"]);

  // entities 按 kind 分组（object → props）。
  assert.equal(bundle.characters.length, 1);
  assert.equal(bundle.characters[0].id, "char-1");
  assert.equal(bundle.locations.length, 1);
  assert.equal(bundle.organizations.length, 1);
  assert.equal(bundle.props.length, 1);
  assert.equal(bundle.props[0].id, "obj-1", "kind=object 应映射到 props");
  assert.equal(bundle.concepts.length, 1);
  assert.equal(bundle.rules.length, 1);
  // 资产默认字段。
  assert.equal(bundle.characters[0].source, "");
  assert.deepEqual(bundle.characters[0].usedBy, []);

  // works 映射。
  assert.equal(bundle.works.length, 1);
  assert.equal(bundle.works[0].title, "EP06");
  assert.equal(bundle.works[0].type, "novel");
  assert.equal(bundle.works[0].relationship, "referenced");

  // health 映射。
  assert.equal(bundle.healthSummary.canonCompleteness, 1, "todos 空 → 1.0");
  assert.equal(bundle.healthSummary.characterCompleteness, 0, "todos 非空 → 0.0");
  assert.equal(bundle.healthSummary.relationshipTimeline, 1);
  assert.equal(bundle.healthSummary.assetCoverage, 1);
  assert.equal(bundle.healthSummary.pendingProposals, 4, "从 todos 文本提取数字");
  assert.equal(bundle.healthSummary.conflicts, 1, "todos 长度");

  // 聚合阶段未拉的集合应为空数组。
  assert.deepEqual(bundle.relationships, []);
  assert.deepEqual(bundle.timelineEvents, []);
  assert.deepEqual(bundle.canonFacts, []);
  assert.deepEqual(bundle.proposals, []);
  assert.deepEqual(bundle.recentActivity, []);
});

test("fetchUniverseBundleFromApi 为浏览器 fetch 保留正确的 Window receiver", async () => {
  let calls = 0;
  function browserFetch(url, init) {
    assert.equal(this, globalThis, "fetch 必须在 globalThis/Window receiver 上调用");
    calls += 1;
    const u = typeof url === "string" ? new URL(url, "http://localhost") : url;
    if (u.pathname.endsWith("/entities")) return entitiesRes();
    if (u.pathname.endsWith("/works")) return worksRes();
    if (u.pathname.endsWith("/health")) return healthRes();
    return detailRes();
  }

  await fetchUniverseBundleFromApi("uni-1", TOKEN, { fetchImpl: browserFetch });
  assert.equal(calls, 4);
});

test("fetchUniverseBundleFromApi 请求路径包含 encodeURIComponent 编码的 universeId", async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    const u = new URL(url, "http://localhost");
    paths.push(u.pathname);
    // 按 pathname 后缀返回对应结构，避免聚合映射时缺字段。
    if (u.pathname.endsWith("/entities")) return entitiesRes();
    if (u.pathname.endsWith("/works")) return worksRes();
    if (u.pathname.endsWith("/health")) return healthRes();
    return jsonRes({ success: true, contractVersion: "2.0.0-alpha.1", universe: { id: "u 1", name: "n", summary: "", status: "draft", visibility: "private", currentVersion: "1", updatedAt: "" } });
  };
  await fetchUniverseBundleFromApi("u 1/slash", TOKEN, { fetchImpl });
  // "u 1/slash" 编码后为 "u%201%2Fslash"，应作为单段路径。
  assert.ok(paths.every((p) => p.startsWith("/api/v2/universes/u%201%2Fslash")), `路径未正确编码: ${paths}`);
});

// ============ 错误状态 ============

test("未登录（accessToken=null）抛 UNAUTHENTICATED", async () => {
  await assert.rejects(
    () => fetchUniverseBundleFromApi("uni-1", null, { fetchImpl: async () => new Response() }),
    (err) => err instanceof UniverseApiError && err.code === "UNAUTHENTICATED",
  );
});

test("详情端点 401 抛 UNAUTHENTICATED 且 isUnauthenticatedError 为 true", async () => {
  const fetchImpl = makeFetch({
    "/api/v2/universes/uni-1": () => jsonRes({ success: false, error: "Authentication is required.", code: "unauthenticated" }, 401),
    "/api/v2/universes/uni-1/entities": () => entitiesRes(),
    "/api/v2/universes/uni-1/works": () => worksRes(),
    "/api/v2/universes/uni-1/health": () => healthRes(),
  });
  await assert.rejects(
    () => fetchUniverseBundleFromApi("uni-1", TOKEN, { fetchImpl }),
    (err) => isUnauthenticatedError(err),
  );
});

test("详情端点 403 抛 FORBIDDEN", async () => {
  const fetchImpl = makeFetch({
    "/api/v2/universes/uni-1": () => jsonRes({ success: false, error: "forbidden", code: "forbidden" }, 403),
    "/api/v2/universes/uni-1/entities": () => entitiesRes(),
    "/api/v2/universes/uni-1/works": () => worksRes(),
    "/api/v2/universes/uni-1/health": () => healthRes(),
  });
  await assert.rejects(
    () => fetchUniverseBundleFromApi("uni-1", TOKEN, { fetchImpl }),
    (err) => err instanceof UniverseApiError && err.code === "FORBIDDEN",
  );
});

test("详情端点 404 抛 NOT_FOUND", async () => {
  const fetchImpl = makeFetch({
    "/api/v2/universes/uni-1": () => jsonRes({ success: false, error: "not found", code: "not_found" }, 404),
    "/api/v2/universes/uni-1/entities": () => entitiesRes(),
    "/api/v2/universes/uni-1/works": () => worksRes(),
    "/api/v2/universes/uni-1/health": () => healthRes(),
  });
  await assert.rejects(
    () => fetchUniverseBundleFromApi("uni-1", TOKEN, { fetchImpl }),
    (err) => err instanceof UniverseApiError && err.code === "NOT_FOUND",
  );
});

test("详情端点 500 抛 SERVICE_UNAVAILABLE（映射 Codex code）", async () => {
  const fetchImpl = makeFetch({
    "/api/v2/universes/uni-1": () => jsonRes({ success: false, error: "boom", code: "service_unavailable" }, 500),
    "/api/v2/universes/uni-1/entities": () => entitiesRes(),
    "/api/v2/universes/uni-1/works": () => worksRes(),
    "/api/v2/universes/uni-1/health": () => healthRes(),
  });
  await assert.rejects(
    () => fetchUniverseBundleFromApi("uni-1", TOKEN, { fetchImpl }),
    (err) => err instanceof UniverseApiError && err.code === "SERVICE_UNAVAILABLE",
  );
});

test("entities 端点 500 抛错（任一端点失败即整体失败）", async () => {
  const fetchImpl = makeFetch({
    "/api/v2/universes/uni-1": () => detailRes(),
    "/api/v2/universes/uni-1/entities": () => jsonRes({ success: false, error: "db down", code: "service_unavailable" }, 503),
    "/api/v2/universes/uni-1/works": () => worksRes(),
    "/api/v2/universes/uni-1/health": () => healthRes(),
  });
  await assert.rejects(
    () => fetchUniverseBundleFromApi("uni-1", TOKEN, { fetchImpl }),
    (err) => err instanceof UniverseApiError && err.code === "SERVICE_UNAVAILABLE",
  );
});

test("contractVersion 不匹配抛 UNIVERSE_CONTRACT_MISMATCH", async () => {
  const fetchImpl = makeFetch({
    "/api/v2/universes/uni-1": () => jsonRes({ success: true, contractVersion: "9.9.9", universe: { id: "uni-1", name: "x", summary: "", status: "draft", visibility: "private", currentVersion: "1", updatedAt: "" } }),
    "/api/v2/universes/uni-1/entities": () => entitiesRes(),
    "/api/v2/universes/uni-1/works": () => worksRes(),
    "/api/v2/universes/uni-1/health": () => healthRes(),
  });
  await assert.rejects(
    () => fetchUniverseBundleFromApi("uni-1", TOKEN, { fetchImpl }),
    (err) => err instanceof UniverseApiError && err.code === "UNIVERSE_CONTRACT_MISMATCH",
  );
});

test("success=false 的 200 响应也抛错（按 body.code 映射）", async () => {
  const fetchImpl = makeFetch({
    "/api/v2/universes/uni-1": () => jsonRes({ success: false, error: "校验失败", code: "validation_failed" }, 200),
    "/api/v2/universes/uni-1/entities": () => entitiesRes(),
    "/api/v2/universes/uni-1/works": () => worksRes(),
    "/api/v2/universes/uni-1/health": () => healthRes(),
  });
  await assert.rejects(
    () => fetchUniverseBundleFromApi("uni-1", TOKEN, { fetchImpl }),
    (err) => err instanceof UniverseApiError && err.code === "VALIDATION_FAILED" && err.message.includes("校验失败"),
  );
});

// ============ Inbox / Canon 端点 ============

test("fetchUniverseProposals 拉取并映射 Inbox 列表", async () => {
  const fetchImpl = makeFetch({
    "/api/v2/universes/uni-1/proposals": (init) => {
      assert.equal(header(init, "Authorization"), `Bearer ${TOKEN}`);
      return jsonRes({
        success: true,
        contractVersion: "2.0.0-alpha.1",
        items: [
          { id: "cp-1", sourceProjectId: "proj-1", sourceStep: "EP06", status: "pending_review", confidence: 0.8, fieldDiffs: [{ path: "a", before: 1, after: 2 }], sourceReference: { kind: "text", label: "标题" }, createdAt: "2026-08-12T00:00:00+08:00" },
        ],
      });
    },
  });
  const proposals = await fetchUniverseProposals(TOKEN, "uni-1", { fetchImpl });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].id, "cp-1");
  assert.equal(proposals[0].title, "标题");
  assert.equal(proposals[0].sourceProject, "proj-1");
  assert.equal(proposals[0].status, "pending_review");
  assert.equal(proposals[0].fieldDiff.length, 1);
  assert.equal(proposals[0].confidence, 0.8);
});

test("fetchUniverseProposals 未登录抛 UNAUTHENTICATED", async () => {
  await assert.rejects(
    () => fetchUniverseProposals(null, "uni-1", { fetchImpl: async () => new Response() }),
    (err) => err instanceof UniverseApiError && err.code === "UNAUTHENTICATED",
  );
});

test("runCanonCheck 发送 POST、带 body 与 Bearer，返回去掉 envelope 的业务结果", async () => {
  let capturedMethod = null;
  let capturedBody = null;
  let capturedAuth = null;
  const fetchImpl = async (url, init) => {
    capturedMethod = init.method;
    capturedBody = JSON.parse(init.body);
    capturedAuth = header(init, "Authorization");
    return jsonRes({ success: true, contractVersion: "2.0.0-alpha.1", conflicts: [], checkedAt: "2026-08-12" });
  };
  const result = await runCanonCheck(TOKEN, "uni-1", { fetchImpl, input: { scope: "all" } });
  assert.equal(capturedMethod, "POST");
  assert.equal(capturedAuth, `Bearer ${TOKEN}`);
  assert.deepEqual(capturedBody, { scope: "all" });
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.checkedAt, "2026-08-12");
  assert.ok(!("success" in result), "应去掉 success envelope");
  assert.ok(!("contractVersion" in result), "应去掉 contractVersion envelope");
});

test("fetchImpactAnalysis 发送 GET 并带 entity query 参数", async () => {
  let capturedUrl = null;
  let capturedMethod = null;
  const fetchImpl = async (url, init) => {
    capturedUrl = typeof url === "string" ? url : url.toString();
    capturedMethod = init.method;
    return jsonRes({ success: true, contractVersion: "2.0.0-alpha.1", affectedWorks: ["proj-1"] });
  };
  const result = await fetchImpactAnalysis(TOKEN, "uni-1", "canon-001", { fetchImpl });
  assert.ok(capturedUrl.includes("entity=canon-001"), `URL 应含 entity query: ${capturedUrl}`);
  assert.ok(capturedUrl.includes("/canon/impact"), "路径应为 canon/impact");
  assert.ok(capturedMethod === "GET" || capturedMethod === undefined, `method 应为 GET（或缺省）: ${capturedMethod}`);
  assert.deepEqual(result.affectedWorks, ["proj-1"]);
  assert.ok(!("success" in result), "应去掉 success envelope");
});

test("runCanonCheck / fetchImpactAnalysis 未登录抛 UNAUTHENTICATED", async () => {
  await assert.rejects(
    () => runCanonCheck(null, "uni-1", { fetchImpl: async () => new Response() }),
    (err) => err instanceof UniverseApiError && err.code === "UNAUTHENTICATED",
  );
  await assert.rejects(
    () => fetchImpactAnalysis(null, "uni-1", "canon-001", { fetchImpl: async () => new Response() }),
    (err) => err instanceof UniverseApiError && err.code === "UNAUTHENTICATED",
  );
});
