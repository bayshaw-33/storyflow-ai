/**
 * K2-I-04 市场 API 适配器测试
 *
 * 覆盖：
 * - fixture 路径（USE_FIXTURE=true）
 * - 真实 API 路径（mock fetch，验证请求路径 / headers / HTTP 方法）
 * - DTO 映射正确性（Codex 字段 → TRAE 字段）
 * - 错误状态（401 / 403 / 404 / 409 / 422 / 503）正确抛错
 * - 完整链路：publishAsset → createLicenseOffer → createUsageGrant → invokeUsageGrant → revokeUsageGrant
 * - 肖像保护：rightsState=portrait_pending 时 createLicenseOffer 抛 forbidden 错误
 *
 * 运行：node --test tests/ui-v2/marketplace/*.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

// P1-04：fixture 改为显式开启（生产默认真实 API）。fixture 路径测试
// 在此显式设 true；默认值断言见 tests/contracts-v22/p0p1-real-feeds.test.mjs。
process.env.NEXT_PUBLIC_USE_MARKETPLACE_FIXTURE = "true";

const {
  fetchMarketplace,
  fetchMarketplaceFromApi,
  fetchAssetById,
  fetchAssetByIdFromApi,
  fetchUsageGrants,
  fetchUsageGrantsFromApi,
  publishAsset,
  publishAssetFromApi,
  createLicenseOffer,
  createLicenseOfferFromApi,
  createUsageGrant,
  createUsageGrantFromApi,
  invokeUsageGrant,
  invokeUsageGrantFromApi,
  revokeUsageGrant,
  revokeUsageGrantFromApi,
  mapCodexAssetToMarketplaceAsset,
  mapCodexOfferToLicenseOffer,
  mapCodexGrantToUsageGrant,
  MarketplaceApiError,
  MARKETPLACE_API_ERROR_CODES,
  isUnauthenticatedError,
  USE_FIXTURE,
} = await import("../../../lib/client/v2/marketplace/api.ts");

const TOKEN = "test-token";

// ============================================================
// mock fetch 工具
// ============================================================

/** 构造 JSON Response */
function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 构造 mock fetch：按 pathname + method 路由到不同 Response */
function makeFetch(routes) {
  return async (url, init) => {
    const u = typeof url === "string" ? new URL(url, "http://localhost") : url;
    const method = (init?.method || "GET").toUpperCase();
    const key = `${method} ${u.pathname}`;
    const handler = routes[key];
    if (!handler) {
      return jsonRes({ success: false, error: "no mock", code: "not_found" }, 404);
    }
    return handler(init, u);
  };
}

/** 从 fetch init.headers 读取头（兼容普通对象 / Headers / 数组） */
function header(init, name) {
  return new Headers(init?.headers).get(name);
}

// ============================================================
// Codex mock 数据工厂
// ============================================================

function makeCodexAsset(overrides = {}) {
  return {
    id: "ast-001",
    kind: "character",
    name: "Mara",
    status: "published",
    currentVersionId: "ver-001",
    createdAt: "2026-08-01T00:00:00+08:00",
    actorId: null,
    rightsState: "ai_generated",
    projectId: null,
    metadata: {},
    ...overrides,
  };
}

function makeCodexVersion(overrides = {}) {
  return {
    id: "ver-001",
    assetId: "ast-001",
    parentVersionId: null,
    sourceProjectId: "proj-001",
    previewUrl: "assets/preview/mara.png",
    createdAt: "2026-08-01T00:00:00+08:00",
    sourceAssetId: null,
    sourceStep: "initial",
    modelKey: null,
    generationJobId: null,
    selectedByUserId: null,
    changeDescription: "initial version",
    storageBucket: "assets",
    storagePath: "assets/mara.bin",
    previewStorageBucket: "assets",
    previewStoragePath: "preview/mara.png",
    metadata: {},
    createdBy: "user-001",
    ...overrides,
  };
}

function makeCodexOffer(overrides = {}) {
  return {
    id: "ofr-001",
    assetId: "ast-001",
    assetVersionId: "ver-001",
    terms: {
      commercial: false,
      scope: "platform_free",
      territory: [],
      durationDays: null,
      modificationAllowed: false,
    },
    priceCents: 0,
    currency: "USD",
    template: "platform_free",
    status: "active",
    createdAt: "2026-08-01T00:00:00+08:00",
    ...overrides,
  };
}

function makeCodexGrant(overrides = {}) {
  return {
    id: "grt-001",
    offerId: "ofr-001",
    assetVersionId: "ver-001",
    projectId: "proj-target",
    status: "pending",
    expiresAt: null,
    assetId: "ast-001",
    licensorId: "user-001",
    licenseeId: "user-002",
    targetProjectId: "proj-target",
    createdAt: "2026-08-01T00:00:00+08:00",
    ...overrides,
  };
}

// ============================================================
// 1. fixture 路径
// ============================================================

test("USE_FIXTURE 随显式 env 开启（P1-04 opt-in 契约）", () => {
  assert.equal(USE_FIXTURE, true, "本文件显式设置 NEXT_PUBLIC_USE_MARKETPLACE_FIXTURE=true");
});

test("fixture 模式 fetchMarketplace 返回 fixture 数据集", async () => {
  const result = await fetchMarketplace(null);
  assert.equal(result.source, "fixture");
  assert.ok(result.dataset.assets.length > 0);
  assert.ok(result.dataset.stats.totalAssets > 0);
  assert.ok(result.dataset.publishFlow);
  assert.ok(result.contractVersion);
});

test("fixture 模式 fetchAssetById 返回 fixture 资产", async () => {
  // 使用 fixture 中存在的 ID（从 dataset 获取）
  const ds = (await fetchMarketplace(null)).dataset;
  const firstId = ds.assets[0].id;
  const result = await fetchAssetById(firstId, null);
  assert.equal(result.source, "fixture");
  assert.equal(result.asset.id, firstId);
});

test("fixture 模式 fetchAssetById 不存在的 ID 抛 NOT_FOUND", async () => {
  await assert.rejects(
    () => fetchAssetById("nonexistent-id", null),
    (err) => {
      assert.ok(err instanceof MarketplaceApiError);
      assert.equal(err.code, MARKETPLACE_API_ERROR_CODES.NOT_FOUND);
      return true;
    },
  );
});

test("fixture 模式 fetchUsageGrants 返回 fixture 授权", async () => {
  const result = await fetchUsageGrants(null);
  assert.equal(result.source, "fixture");
  assert.ok(Array.isArray(result.grants));
});

test("fixture 模式 publishAsset 返回模拟资产", async () => {
  const result = await publishAsset(null, {
    kind: "character",
    name: "测试角色",
  });
  assert.equal(result.source, "fixture");
  assert.equal(result.asset.name, "测试角色");
  assert.equal(result.asset.status, "draft");
});

test("fixture 模式 createLicenseOffer 返回模拟要约", async () => {
  const result = await createLicenseOffer(null, "ast-001", {
    assetVersionId: "ver-001",
    template: "platform_free",
    terms: { commercial: false, scope: "platform_free" },
  });
  assert.equal(result.source, "fixture");
  assert.equal(result.offer.type, "free");
});

test("fixture 模式完整链路：publish → offer → grant → invoke → revoke", async () => {
  const pub = await publishAsset(TOKEN, { kind: "scene", name: "测试场景" });
  assert.ok(pub.asset.id);

  const offer = await createLicenseOffer(TOKEN, pub.asset.id, {
    assetVersionId: "ver-001",
    template: "platform_free",
    terms: { commercial: false, scope: "platform_free" },
  });
  assert.ok(offer.offer.id);

  const grant = await createUsageGrant(TOKEN, offer.offer.id, "proj-target");
  assert.ok(grant.grant.id);
  assert.equal(grant.grant.status, "pending");

  const invoked = await invokeUsageGrant(TOKEN, grant.grant.id);
  assert.ok(invoked.copy.id);
  assert.equal(invoked.grant.status, "active");

  const revoked = await revokeUsageGrant(TOKEN, grant.grant.id, "测试撤销");
  assert.equal(revoked.grant.status, "revoked_for_new_use");
  assert.equal(typeof revoked.preservedCopyCount, "number");
});

// ============================================================
// 2. 真实 API 路径（mock fetch）
// ============================================================

test("fetchMarketplaceFromApi 发送 GET /api/v2/assets?status=published", async () => {
  let capturedUrl = null;
  let capturedMethod = null;
  const fetchImpl = async (url, init) => {
    const u = new URL(url, "http://localhost");
    capturedUrl = u.pathname + u.search;
    capturedMethod = init?.method;
    return jsonRes({
      success: true,
      contractVersion: "2.0.0-alpha.1",
      items: [makeCodexAsset()],
    });
  };
  const result = await fetchMarketplaceFromApi(TOKEN, { fetchImpl });
  assert.equal(capturedMethod, "GET");
  assert.equal(capturedUrl, "/api/v2/assets?status=published");
  assert.equal(result.source, "api");
  assert.equal(result.dataset.assets.length, 1);
});

test("fetchMarketplaceFromApi 携带 Authorization Bearer 头", async () => {
  let capturedAuth = null;
  const fetchImpl = async (url, init) => {
    capturedAuth = header(init, "Authorization");
    return jsonRes({
      success: true,
      contractVersion: "2.0.0-alpha.1",
      items: [],
    });
  };
  await fetchMarketplaceFromApi(TOKEN, { fetchImpl });
  assert.equal(capturedAuth, `Bearer ${TOKEN}`);
});

test("fetchAssetByIdFromApi 发送 GET /api/v2/assets/[assetId]", async () => {
  let capturedUrl = null;
  const fetchImpl = async (url) => {
    const u = new URL(url, "http://localhost");
    capturedUrl = u.pathname;
    return jsonRes({
      success: true,
      contractVersion: "2.0.0-alpha.1",
      asset: { ...makeCodexAsset(), versions: [makeCodexVersion()] },
    });
  };
  const result = await fetchAssetByIdFromApi("ast-001", TOKEN, { fetchImpl });
  assert.equal(capturedUrl, "/api/v2/assets/ast-001");
  assert.equal(result.asset.id, "ast-001");
  assert.equal(result.source, "api");
});

test("fetchUsageGrantsFromApi 发送 GET /api/v2/marketplace/grants", async () => {
  let capturedUrl = null;
  const fetchImpl = async (url) => {
    const u = new URL(url, "http://localhost");
    capturedUrl = u.pathname;
    return jsonRes({
      success: true,
      contractVersion: "2.0.0-alpha.1",
      items: [makeCodexGrant()],
    });
  };
  const result = await fetchUsageGrantsFromApi(TOKEN, { fetchImpl });
  assert.equal(capturedUrl, "/api/v2/marketplace/grants");
  assert.equal(result.grants.length, 1);
  assert.equal(result.source, "api");
});

test("fetchMarketplaceFromApi 无 token 抛 UNAUTHENTICATED", async () => {
  await assert.rejects(
    () => fetchMarketplaceFromApi(null, { fetchImpl: async () => jsonRes({}) }),
    (err) => {
      assert.ok(err instanceof MarketplaceApiError);
      assert.equal(err.code, MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED);
      return true;
    },
  );
});

// ============================================================
// 3. 写操作 API 路径验证
// ============================================================

test("publishAsset 发送 POST /api/v2/assets", async () => {
  let capturedMethod = null;
  let capturedUrl = null;
  let capturedBody = null;
  const fetchImpl = async (url, init) => {
    const u = new URL(url, "http://localhost");
    capturedUrl = u.pathname;
    capturedMethod = init?.method;
    capturedBody = JSON.parse(init?.body || "{}");
    return jsonRes({
      success: true,
      contractVersion: "2.0.0-alpha.1",
      asset: makeCodexAsset({ status: "draft" }),
    }, 201);
  };
  const result = await publishAssetFromApi(TOKEN, {
    kind: "character",
    name: "新角色",
    rightsState: "ai_generated",
  }, { fetchImpl });
  assert.equal(capturedMethod, "POST");
  assert.equal(capturedUrl, "/api/v2/assets");
  assert.equal(capturedBody.kind, "character");
  assert.equal(capturedBody.name, "新角色");
  assert.equal(result.asset.name, "Mara"); // mock 返回
  assert.equal(result.source, "api");
});

test("createLicenseOffer 发送 POST /api/v2/assets/[assetId]/license-offers", async () => {
  let capturedMethod = null;
  let capturedUrl = null;
  let capturedBody = null;
  const fetchImpl = async (url, init) => {
    const u = new URL(url, "http://localhost");
    capturedUrl = u.pathname;
    capturedMethod = init?.method;
    capturedBody = JSON.parse(init?.body || "{}");
    return jsonRes({
      success: true,
      contractVersion: "2.0.0-alpha.1",
      offer: makeCodexOffer(),
    }, 201);
  };
  const result = await createLicenseOfferFromApi(TOKEN, "ast-001", {
    assetVersionId: "ver-001",
    template: "platform_free",
    terms: { commercial: false, scope: "platform_free" },
  }, { fetchImpl });
  assert.equal(capturedMethod, "POST");
  assert.equal(capturedUrl, "/api/v2/assets/ast-001/license-offers");
  assert.equal(capturedBody.assetVersionId, "ver-001");
  assert.equal(result.offer.type, "free");
});

test("createUsageGrant 发送 POST /api/v2/marketplace/grants", async () => {
  let capturedMethod = null;
  let capturedUrl = null;
  let capturedBody = null;
  const fetchImpl = async (url, init) => {
    const u = new URL(url, "http://localhost");
    capturedUrl = u.pathname;
    capturedMethod = init?.method;
    capturedBody = JSON.parse(init?.body || "{}");
    return jsonRes({
      success: true,
      contractVersion: "2.0.0-alpha.1",
      grant: makeCodexGrant(),
    }, 201);
  };
  const result = await createUsageGrantFromApi(TOKEN, "ofr-001", "proj-target", null, { fetchImpl });
  assert.equal(capturedMethod, "POST");
  assert.equal(capturedUrl, "/api/v2/marketplace/grants");
  assert.equal(capturedBody.offerId, "ofr-001");
  assert.equal(capturedBody.targetProjectId, "proj-target");
  assert.equal(result.grant.id, "grt-001");
});

test("invokeUsageGrant 发送 POST /api/v2/marketplace/grants/[grantId]/invoke", async () => {
  let capturedMethod = null;
  let capturedUrl = null;
  const fetchImpl = async (url, init) => {
    const u = new URL(url, "http://localhost");
    capturedUrl = u.pathname;
    capturedMethod = init?.method;
    return jsonRes({
      success: true,
      contractVersion: "2.0.0-alpha.1",
      grant: makeCodexGrant({ status: "active" }),
      copy: { id: "cpy-001", copyAssetId: "ast-copy-001", targetProjectId: "proj-target" },
    });
  };
  const result = await invokeUsageGrantFromApi(TOKEN, "grt-001", { fetchImpl });
  assert.equal(capturedMethod, "POST");
  assert.equal(capturedUrl, "/api/v2/marketplace/grants/grt-001/invoke");
  assert.equal(result.copy.id, "cpy-001");
  assert.equal(result.grant.status, "active");
});

test("revokeUsageGrant 发送 PATCH /api/v2/marketplace/grants/[grantId]/revoke", async () => {
  let capturedMethod = null;
  let capturedUrl = null;
  let capturedBody = null;
  const fetchImpl = async (url, init) => {
    const u = new URL(url, "http://localhost");
    capturedUrl = u.pathname;
    capturedMethod = init?.method;
    capturedBody = JSON.parse(init?.body || "{}");
    return jsonRes({
      success: true,
      contractVersion: "2.0.0-alpha.1",
      grant: makeCodexGrant({ status: "revoked_for_new_use" }),
      preservedCopyCount: 2,
    });
  };
  const result = await revokeUsageGrantFromApi(TOKEN, "grt-001", "违规使用", { fetchImpl });
  assert.equal(capturedMethod, "PATCH");
  assert.equal(capturedUrl, "/api/v2/marketplace/grants/grt-001/revoke");
  assert.equal(capturedBody.reason, "违规使用");
  assert.equal(result.grant.status, "revoked_for_new_use");
  assert.equal(result.preservedCopyCount, 2);
});

// ============================================================
// 4. DTO 映射正确性
// ============================================================

test("mapCodexAssetToMarketplaceAsset: kind=character → type=character", () => {
  const asset = mapCodexAssetToMarketplaceAsset(makeCodexAsset({ kind: "character" }));
  assert.equal(asset.type, "character");
});

test("mapCodexAssetToMarketplaceAsset: kind=scene → type=scene", () => {
  const asset = mapCodexAssetToMarketplaceAsset(makeCodexAsset({ kind: "scene" }));
  assert.equal(asset.type, "scene");
});

test("mapCodexAssetToMarketplaceAsset: kind=prop → type=prop", () => {
  const asset = mapCodexAssetToMarketplaceAsset(makeCodexAsset({ kind: "prop" }));
  assert.equal(asset.type, "prop");
});

test("mapCodexAssetToMarketplaceAsset: kind=style → type=style_pack", () => {
  const asset = mapCodexAssetToMarketplaceAsset(makeCodexAsset({ kind: "style" }));
  assert.equal(asset.type, "style_pack");
});

test("mapCodexAssetToMarketplaceAsset: kind=universe_package → type=universe_setting", () => {
  const asset = mapCodexAssetToMarketplaceAsset(makeCodexAsset({ kind: "universe_package" }));
  assert.equal(asset.type, "universe_setting");
});

test("mapCodexAssetToMarketplaceAsset: actorId 非空 → type=ai_actor", () => {
  const asset = mapCodexAssetToMarketplaceAsset(
    makeCodexAsset({ kind: "character", actorId: "actor-001" }),
  );
  assert.equal(asset.type, "ai_actor");
});

test("mapCodexAssetToMarketplaceAsset: rightsState=portrait_confirmed → rightsStatus=confirmed, portraitBased=true", () => {
  const asset = mapCodexAssetToMarketplaceAsset(
    makeCodexAsset({ rightsState: "portrait_confirmed" }),
  );
  assert.equal(asset.rightsStatus, "confirmed");
  assert.equal(asset.portraitBased, true);
});

test("mapCodexAssetToMarketplaceAsset: rightsState=portrait_pending → rightsStatus=unconfirmed, portraitBased=true", () => {
  const asset = mapCodexAssetToMarketplaceAsset(
    makeCodexAsset({ rightsState: "portrait_pending" }),
  );
  assert.equal(asset.rightsStatus, "unconfirmed");
  assert.equal(asset.portraitBased, true);
});

test("mapCodexAssetToMarketplaceAsset: rightsState=ai_generated → rightsStatus=not_applicable, portraitBased=false", () => {
  const asset = mapCodexAssetToMarketplaceAsset(
    makeCodexAsset({ rightsState: "ai_generated" }),
  );
  assert.equal(asset.rightsStatus, "not_applicable");
  assert.equal(asset.portraitBased, false);
});

test("mapCodexAssetToMarketplaceAsset: status 直接映射", () => {
  for (const status of ["draft", "ready", "published", "suspended", "archived"]) {
    const asset = mapCodexAssetToMarketplaceAsset(makeCodexAsset({ status }));
    assert.equal(asset.status, status);
  }
});

test("mapCodexAssetToMarketplaceAsset: metadata 字段派生", () => {
  const asset = mapCodexAssetToMarketplaceAsset(
    makeCodexAsset({
      metadata: {
        description: "测试描述",
        tags: ["赛博朋克", "科幻"],
        allowedUses: ["分镜预览"],
        forbiddenUses: ["商业广告"],
        visibility: "public",
        rating: 4.5,
        usageCount: 10,
        thumbnail: "thumb.png",
      },
    }),
  );
  assert.equal(asset.description, "测试描述");
  assert.deepEqual(asset.tags, ["赛博朋克", "科幻"]);
  assert.deepEqual(asset.allowedUses, ["分镜预览"]);
  assert.deepEqual(asset.forbiddenUses, ["商业广告"]);
  assert.equal(asset.visibility, "public");
  assert.equal(asset.rating, 4.5);
  assert.equal(asset.usageCount, 10);
  assert.equal(asset.thumbnail, "thumb.png");
});

test("mapCodexAssetToMarketplaceAsset: 从 versions 派生 mainVersion", () => {
  const versions = [
    makeCodexVersion({ id: "ver-001", previewUrl: "preview/v1.png", createdAt: "2026-08-01" }),
    makeCodexVersion({ id: "ver-002", previewUrl: "preview/v2.png", createdAt: "2026-08-02" }),
  ];
  const asset = mapCodexAssetToMarketplaceAsset(
    makeCodexAsset({ currentVersionId: "ver-002" }),
    versions,
  );
  assert.equal(asset.mainVersion.id, "ver-002");
  assert.equal(asset.mainVersion.preview, "preview/v2.png");
  assert.equal(asset.mainVersion.createdAt, "2026-08-02");
});

test("mapCodexAssetToMarketplaceAsset: currentVersionId 无匹配时用第一个 version", () => {
  const versions = [makeCodexVersion({ id: "ver-001", previewUrl: "preview/v1.png" })];
  const asset = mapCodexAssetToMarketplaceAsset(
    makeCodexAsset({ currentVersionId: "ver-nonexistent" }),
    versions,
  );
  assert.equal(asset.mainVersion.id, "ver-001");
});

test("mapCodexAssetToMarketplaceAsset: 无 versions 时 mainVersion 用默认值", () => {
  const asset = mapCodexAssetToMarketplaceAsset(
    makeCodexAsset({ currentVersionId: "ver-001" }),
  );
  assert.equal(asset.mainVersion.id, "ver-001");
  assert.equal(asset.mainVersion.preview, "");
});

test("mapCodexAssetToMarketplaceAsset: 默认 creator", () => {
  const asset = mapCodexAssetToMarketplaceAsset(makeCodexAsset());
  assert.equal(asset.creator.name, "未知创建者");
  assert.equal(asset.creator.worksCount, 0);
  assert.equal(asset.creator.usageCount, 0);
});

test("mapCodexAssetToMarketplaceAsset: 从 metadata.creator 派生 creator", () => {
  const asset = mapCodexAssetToMarketplaceAsset(
    makeCodexAsset({
      metadata: {
        creator: { id: "user-001", name: "Alice", worksCount: 5, usageCount: 20 },
      },
    }),
  );
  assert.equal(asset.creator.id, "user-001");
  assert.equal(asset.creator.name, "Alice");
  assert.equal(asset.creator.worksCount, 5);
  assert.equal(asset.creator.usageCount, 20);
});

test("mapCodexAssetToMarketplaceAsset: 默认 licenseOffer 为 free", () => {
  const asset = mapCodexAssetToMarketplaceAsset(makeCodexAsset());
  assert.equal(asset.licenseOffer.type, "free");
  assert.equal(asset.licenseOffer.commercialScope, "platform_free");
  assert.equal(asset.licenseOffer.price, null);
});

test("mapCodexAssetToMarketplaceAsset: recommended 默认 false", () => {
  const asset = mapCodexAssetToMarketplaceAsset(makeCodexAsset());
  assert.equal(asset.recommended, false);
});

test("mapCodexAssetToMarketplaceAsset: 不暴露敏感字段", () => {
  const asset = mapCodexAssetToMarketplaceAsset(makeCodexAsset());
  const sensitiveKeys = ["prompt", "storagePath", "internalId", "storage_path", "internal_id"];
  for (const key of sensitiveKeys) {
    assert.ok(!(key in asset), `MarketplaceAsset 不应包含敏感字段: ${key}`);
  }
});

// ============================================================
// 5. LicenseOffer DTO 映射
// ============================================================

test("mapCodexOfferToLicenseOffer: template=platform_free → type=free", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({ template: "platform_free" }));
  assert.equal(offer.type, "free");
});

test("mapCodexOfferToLicenseOffer: template=non_commercial → type=non_commercial", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({
    template: "non_commercial",
    terms: { commercial: false, scope: "non_commercial" },
  }));
  assert.equal(offer.type, "non_commercial");
});

test("mapCodexOfferToLicenseOffer: template=single_project → type=single_project_commercial", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({
    template: "single_project",
    terms: { commercial: true, scope: "single_project" },
  }));
  assert.equal(offer.type, "single_project_commercial");
});

test("mapCodexOfferToLicenseOffer: template=team_internal → type=team_internal", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({
    template: "team_internal",
    terms: { commercial: true, scope: "team_internal" },
  }));
  assert.equal(offer.type, "team_internal");
});

test("mapCodexOfferToLicenseOffer: template=commercial → type=single_project_commercial", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({
    template: "commercial",
    terms: { commercial: true, scope: "custom" },
  }));
  assert.equal(offer.type, "single_project_commercial");
});

test("mapCodexOfferToLicenseOffer: template=custom → type=custom", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({
    template: "custom",
    terms: { commercial: true, scope: "custom" },
  }));
  assert.equal(offer.type, "custom");
});

test("mapCodexOfferToLicenseOffer: terms.scope → commercialScope", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({
    terms: { commercial: true, scope: "single_project" },
  }));
  assert.equal(offer.commercialScope, "single_project");
});

test("mapCodexOfferToLicenseOffer: terms.modificationAllowed=true → modificationScope=allowed", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({
    terms: { commercial: false, scope: "platform_free", modificationAllowed: true },
  }));
  assert.equal(offer.modificationScope, "allowed");
});

test("mapCodexOfferToLicenseOffer: terms.modificationAllowed=false → modificationScope=not_allowed", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({
    terms: { commercial: false, scope: "platform_free", modificationAllowed: false },
  }));
  assert.equal(offer.modificationScope, "not_allowed");
});

test("mapCodexOfferToLicenseOffer: priceCents=0 → price=null", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({ priceCents: 0 }));
  assert.equal(offer.price, null);
});

test("mapCodexOfferToLicenseOffer: priceCents=500 → price=500", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({ priceCents: 500 }));
  assert.equal(offer.price, 500);
});

test("mapCodexOfferToLicenseOffer: territory 映射", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({
    terms: { commercial: true, scope: "single_project", territory: ["CN", "US"] },
  }));
  assert.deepEqual(offer.territory, ["CN", "US"]);
});

test("mapCodexOfferToLicenseOffer: durationDays 映射", () => {
  const offer = mapCodexOfferToLicenseOffer(makeCodexOffer({
    terms: { commercial: true, scope: "single_project", durationDays: 30 },
  }));
  assert.equal(offer.durationDays, 30);
});

// ============================================================
// 6. UsageGrant DTO 映射
// ============================================================

test("mapCodexGrantToUsageGrant: createdAt → grantedAt", () => {
  const grant = mapCodexGrantToUsageGrant(makeCodexGrant({ createdAt: "2026-08-01" }));
  assert.equal(grant.grantedAt, "2026-08-01");
});

test("mapCodexGrantToUsageGrant: targetProjectId → projectId", () => {
  const grant = mapCodexGrantToUsageGrant(makeCodexGrant({ targetProjectId: "proj-xyz" }));
  assert.equal(grant.projectId, "proj-xyz");
});

test("mapCodexGrantToUsageGrant: projectName 留空", () => {
  const grant = mapCodexGrantToUsageGrant(makeCodexGrant());
  assert.equal(grant.projectName, "");
});

test("mapCodexGrantToUsageGrant: status 直接映射", () => {
  for (const status of ["pending", "active", "expired", "revoked_for_new_use", "cancelled", "disputed"]) {
    const grant = mapCodexGrantToUsageGrant(makeCodexGrant({ status }));
    assert.equal(grant.status, status);
  }
});

test("mapCodexGrantToUsageGrant: expiresAt 映射", () => {
  const grant = mapCodexGrantToUsageGrant(makeCodexGrant({ expiresAt: "2026-12-31" }));
  assert.equal(grant.expiresAt, "2026-12-31");
});

// ============================================================
// 7. 错误状态测试（401 / 403 / 404 / 409 / 422 / 503）
// ============================================================

test("401 错误抛 UNAUTHENTICATED", async () => {
  const fetchImpl = async () => jsonRes({ success: false, error: "Authentication required", code: "unauthenticated" }, 401);
  await assert.rejects(
    () => fetchMarketplaceFromApi(TOKEN, { fetchImpl }),
    (err) => {
      assert.ok(err instanceof MarketplaceApiError);
      assert.equal(err.code, MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED);
      assert.ok(isUnauthenticatedError(err));
      return true;
    },
  );
});

test("403 错误抛 FORBIDDEN", async () => {
  const fetchImpl = async () => jsonRes({ success: false, error: "Forbidden", code: "forbidden" }, 403);
  await assert.rejects(
    () => fetchMarketplaceFromApi(TOKEN, { fetchImpl }),
    (err) => {
      assert.ok(err instanceof MarketplaceApiError);
      assert.equal(err.code, MARKETPLACE_API_ERROR_CODES.FORBIDDEN);
      return true;
    },
  );
});

test("404 错误抛 NOT_FOUND", async () => {
  const fetchImpl = async () => jsonRes({ success: false, error: "Not found", code: "not_found" }, 404);
  await assert.rejects(
    () => fetchAssetByIdFromApi("nonexistent", TOKEN, { fetchImpl }),
    (err) => {
      assert.ok(err instanceof MarketplaceApiError);
      assert.equal(err.code, MARKETPLACE_API_ERROR_CODES.NOT_FOUND);
      return true;
    },
  );
});

test("409 错误抛 CONFLICT", async () => {
  const fetchImpl = async () => jsonRes({ success: false, error: "Conflict", code: "conflict" }, 409);
  await assert.rejects(
    () => fetchMarketplaceFromApi(TOKEN, { fetchImpl }),
    (err) => {
      assert.ok(err instanceof MarketplaceApiError);
      assert.equal(err.code, MARKETPLACE_API_ERROR_CODES.CONFLICT);
      return true;
    },
  );
});

test("422 错误抛 VALIDATION_FAILED", async () => {
  const fetchImpl = async () => jsonRes({ success: false, error: "Validation failed", code: "validation_failed" }, 422);
  await assert.rejects(
    () => fetchMarketplaceFromApi(TOKEN, { fetchImpl }),
    (err) => {
      assert.ok(err instanceof MarketplaceApiError);
      assert.equal(err.code, MARKETPLACE_API_ERROR_CODES.VALIDATION_FAILED);
      return true;
    },
  );
});

test("503 错误抛 SERVICE_UNAVAILABLE", async () => {
  const fetchImpl = async () => jsonRes({ success: false, error: "Service unavailable", code: "service_unavailable" }, 503);
  await assert.rejects(
    () => fetchMarketplaceFromApi(TOKEN, { fetchImpl }),
    (err) => {
      assert.ok(err instanceof MarketplaceApiError);
      assert.equal(err.code, MARKETPLACE_API_ERROR_CODES.SERVICE_UNAVAILABLE);
      return true;
    },
  );
});

test("契约版本不匹配抛 CONTRACT_MISMATCH", async () => {
  const fetchImpl = async () => jsonRes({
    success: true,
    contractVersion: "1.0.0-wrong",
    items: [],
  });
  await assert.rejects(
    () => fetchMarketplaceFromApi(TOKEN, { fetchImpl }),
    (err) => {
      assert.ok(err instanceof MarketplaceApiError);
      assert.equal(err.code, MARKETPLACE_API_ERROR_CODES.CONTRACT_MISMATCH);
      return true;
    },
  );
});

// ============================================================
// 8. 完整链路（真实 API mock）
// ============================================================

test("完整链路（真实 API mock）：publish → offer → grant → invoke → revoke", async () => {
  let callCount = 0;
  const capturedCalls = [];

  const fetchImpl = async (url, init) => {
    const u = new URL(url, "http://localhost");
    const method = (init?.method || "GET").toUpperCase();
    const path = `${method} ${u.pathname}`;
    capturedCalls.push(path);
    callCount++;

    // POST /api/v2/assets — publishAsset
    if (path === "POST /api/v2/assets") {
      return jsonRes({
        success: true,
        contractVersion: "2.0.0-alpha.1",
        asset: makeCodexAsset({ id: "ast-new", status: "draft" }),
      }, 201);
    }
    // POST /api/v2/assets/[assetId]/license-offers — createLicenseOffer
    if (path === "POST /api/v2/assets/ast-new/license-offers") {
      return jsonRes({
        success: true,
        contractVersion: "2.0.0-alpha.1",
        offer: makeCodexOffer({ id: "ofr-new", assetId: "ast-new" }),
      }, 201);
    }
    // POST /api/v2/marketplace/grants — createUsageGrant
    if (path === "POST /api/v2/marketplace/grants") {
      return jsonRes({
        success: true,
        contractVersion: "2.0.0-alpha.1",
        grant: makeCodexGrant({ id: "grt-new", offerId: "ofr-new", status: "pending" }),
      }, 201);
    }
    // POST /api/v2/marketplace/grants/[grantId]/invoke — invokeUsageGrant
    if (path === "POST /api/v2/marketplace/grants/grt-new/invoke") {
      return jsonRes({
        success: true,
        contractVersion: "2.0.0-alpha.1",
        grant: makeCodexGrant({ id: "grt-new", status: "active" }),
        copy: { id: "cpy-new", copyAssetId: "ast-copy-new", targetProjectId: "proj-target" },
      });
    }
    // PATCH /api/v2/marketplace/grants/[grantId]/revoke — revokeUsageGrant
    if (path === "PATCH /api/v2/marketplace/grants/grt-new/revoke") {
      return jsonRes({
        success: true,
        contractVersion: "2.0.0-alpha.1",
        grant: makeCodexGrant({ id: "grt-new", status: "revoked_for_new_use" }),
        preservedCopyCount: 1,
      });
    }
    return jsonRes({ success: false, error: "no mock", code: "not_found" }, 404);
  };

  // 1. publishAsset
  const pub = await publishAssetFromApi(TOKEN, { kind: "character", name: "链路测试" }, { fetchImpl });
  assert.equal(pub.asset.id, "ast-new");
  assert.equal(pub.source, "api");

  // 2. createLicenseOffer
  const offer = await createLicenseOfferFromApi(TOKEN, pub.asset.id, {
    assetVersionId: "ver-001",
    template: "platform_free",
    terms: { commercial: false, scope: "platform_free" },
  }, { fetchImpl });
  assert.equal(offer.offer.id, "ofr-new");
  assert.equal(offer.offer.type, "free");

  // 3. createUsageGrant
  const grant = await createUsageGrantFromApi(TOKEN, offer.offer.id, "proj-target", null, { fetchImpl });
  assert.equal(grant.grant.id, "grt-new");
  assert.equal(grant.grant.status, "pending");

  // 4. invokeUsageGrant
  const invoked = await invokeUsageGrantFromApi(TOKEN, grant.grant.id, { fetchImpl });
  assert.equal(invoked.grant.status, "active");
  assert.equal(invoked.copy.id, "cpy-new");

  // 5. revokeUsageGrant
  const revoked = await revokeUsageGrantFromApi(TOKEN, grant.grant.id, "测试撤销", { fetchImpl });
  assert.equal(revoked.grant.status, "revoked_for_new_use");
  assert.equal(revoked.preservedCopyCount, 1);

  // 验证调用链路顺序正确
  assert.equal(callCount, 5);
  assert.deepEqual(capturedCalls, [
    "POST /api/v2/assets",
    "POST /api/v2/assets/ast-new/license-offers",
    "POST /api/v2/marketplace/grants",
    "POST /api/v2/marketplace/grants/grt-new/invoke",
    "PATCH /api/v2/marketplace/grants/grt-new/revoke",
  ]);
});

// ============================================================
// 9. 肖像保护测试
// ============================================================

test("肖像保护：rightsState=portrait_pending 时 createLicenseOffer 抛 FORBIDDEN", async () => {
  // Codex 服务端在 assertRights 中检查：
  // if (asset.actor_id && asset.rights_state !== "portrait_confirmed")
  //   throw new LicensingError("forbidden", "Confirmed portrait rights are required...")
  const fetchImpl = async () => jsonRes({
    success: false,
    error: "Confirmed portrait rights are required before marketplace licensing.",
    code: "forbidden",
  }, 403);

  await assert.rejects(
    () => createLicenseOfferFromApi(TOKEN, "ast-portrait-pending", {
      assetVersionId: "ver-001",
      template: "platform_free",
      terms: { commercial: false, scope: "platform_free" },
    }, { fetchImpl }),
    (err) => {
      assert.ok(err instanceof MarketplaceApiError);
      assert.equal(err.code, MARKETPLACE_API_ERROR_CODES.FORBIDDEN);
      assert.ok(err.message.includes("portrait") || err.message.includes("权限") || err.message.includes("Forbidden"));
      return true;
    },
  );
});

test("肖像保护：rightsState=portrait_confirmed 时 createLicenseOffer 成功", async () => {
  const fetchImpl = async () => jsonRes({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    offer: makeCodexOffer(),
  }, 201);

  const result = await createLicenseOfferFromApi(TOKEN, "ast-portrait-confirmed", {
    assetVersionId: "ver-001",
    template: "platform_free",
    terms: { commercial: false, scope: "platform_free" },
  }, { fetchImpl });
  assert.ok(result.offer.id);
  assert.equal(result.source, "api");
});

test("肖像保护：mapCodexAssetToMarketplaceAsset 正确映射 portrait_pending 状态", () => {
  // 验证客户端 DTO 映射能正确识别肖像未确认状态
  const asset = mapCodexAssetToMarketplaceAsset(
    makeCodexAsset({ actorId: "actor-001", rightsState: "portrait_pending" }),
  );
  assert.equal(asset.type, "ai_actor"); // actorId 非空 → ai_actor
  assert.equal(asset.portraitBased, true);
  assert.equal(asset.rightsStatus, "unconfirmed");
  // UI 可据此判断 canGrantCommercial(asset) === false
});

test("isUnauthenticatedError 识别 401 错误", async () => {
  const fetchImpl = async () => jsonRes({ success: false, code: "unauthenticated" }, 401);
  try {
    await fetchMarketplaceFromApi(TOKEN, { fetchImpl });
    assert.fail("应抛错");
  } catch (err) {
    assert.ok(isUnauthenticatedError(err), "isUnauthenticatedError 应返回 true");
  }
});

test("isUnauthenticatedError 不误判非 401 错误", async () => {
  const fetchImpl = async () => jsonRes({ success: false, code: "forbidden" }, 403);
  try {
    await fetchMarketplaceFromApi(TOKEN, { fetchImpl });
    assert.fail("应抛错");
  } catch (err) {
    assert.ok(!isUnauthenticatedError(err), "isUnauthenticatedError 应返回 false");
  }
});
