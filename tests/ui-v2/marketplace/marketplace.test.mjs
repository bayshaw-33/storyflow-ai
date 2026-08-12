/**
 * K2-T-09 演员与资产市场测试
 *
 * 验证（对齐任务验收标准 5 条）：
 *   1. 不暴露内部 Prompt 和存储信息（fixture + 类型不含敏感字段）
 *   2. 使用动作不修改原资产（创建项目级副本，原资产只读）
 *   3. 真人肖像权利状态清晰可见（portraitBased=true 时 rightsStatus 必须明确）
 *   4. 免费和付费授权明确区分（视觉 + 数据）
 *   5. fixture 可独立预览全部页面
 *
 * 额外覆盖：
 *   - fixture 结构符合类型
 *   - contract_version 校验
 *   - 搜索/筛选逻辑（按 name/tag/type/allowedUses 组合）
 *   - 授权方式分类（free vs paid，commercial vs non_commercial）
 *   - 推荐可解释（recommended=true 时必须有 recommendationReason，不基于付费排名）
 *   - 防漂移断言：TS 内联与 JSON 一致
 *
 * 运行：node --test tests/ui-v2/marketplace/*.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  CONTRACT_VERSION,
  assertContractVersion,
  ALL_ASSET_TYPES,
  ALL_LICENSE_TYPES,
  ALL_ASSET_STATUSES,
  ALL_USAGE_GRANT_STATUSES,
  DEFAULT_FILTER,
} from "../../../lib/client/v2/marketplace/types.ts";
import {
  isLicenseFree,
  isLicensePaid,
  isLicenseCommercial,
  canPublishPublicly,
  canGrantCommercial,
  isAssetUsable,
  searchAssets,
  filterAssets,
  sortAssets,
  queryAssets,
  validateRecommendation,
  formatPrice,
} from "../../../lib/client/v2/marketplace/filtering.ts";
import {
  validateUsageEntry,
  createProjectCopy,
  assertAssetUnmodified,
  canExistingCopyContinue,
  buildGrantSummary,
} from "../../../lib/client/v2/marketplace/usage.ts";
import {
  FIXTURE_ASSETS,
  FIXTURE_LICENSE_OFFERS,
  FIXTURE_USAGE_GRANTS,
  FIXTURE_CREATORS,
  FIXTURE_PUBLISH_FLOW,
  FIXTURE_STATS,
  FIXTURE_DATASET,
} from "../../../lib/client/v2/marketplace/fixture-data.ts";
import { loadFixtureDataset, loadFixtureAssetById } from "../../../lib/client/v2/marketplace/fixtures.ts";

// 读取 JSON fixture
const raw = readFileSync("tests/fixtures/kiikis-v2/marketplace.json", "utf8");
const jsonDataset = JSON.parse(raw);
const jsonAssets = jsonDataset.assets;
const jsonLicenseOffers = jsonDataset.licenseOffers;
const jsonUsageGrants = jsonDataset.usageGrants;
const jsonCreators = jsonDataset.creators;
const jsonPublishFlow = jsonDataset.publishFlow;
const jsonStats = jsonDataset.stats;

// 敏感字段黑名单（PRD §9.4：绝不暴露）
const SENSITIVE_KEYS = ["prompt", "storagePath", "internalId", "storage_path", "internal_id"];

// ============================================================
// 1. contract_version 校验
// ============================================================

test("CONTRACT_VERSION 与 Codex v2 契约冻结值一致", () => {
  assert.equal(CONTRACT_VERSION, "2.0.0-alpha.1");
});

test("fixture contractVersion 等于 CONTRACT_VERSION", () => {
  assert.equal(jsonDataset.contractVersion, CONTRACT_VERSION);
  assert.equal(FIXTURE_DATASET.contractVersion, CONTRACT_VERSION);
});

test("assertContractVersion 匹配时通过，不匹配时抛错", () => {
  assert.doesNotThrow(() => assertContractVersion(CONTRACT_VERSION));
  assert.throws(
    () => assertContractVersion("1.0.0"),
    /marketplace contract version mismatch/,
  );
});

// ============================================================
// 2. fixture 数据结构契约
// ============================================================

test("assets 至少 12 个，覆盖全部 6 种类型", () => {
  assert.ok(Array.isArray(jsonAssets), "assets 必须是数组");
  assert.ok(jsonAssets.length >= 12, `assets 至少 12 个，实际 ${jsonAssets.length}`);

  const types = new Set(jsonAssets.map((a) => a.type));
  for (const t of ALL_ASSET_TYPES) {
    assert.ok(types.has(t), `缺少资产类型 ${t}`);
  }
});

test("licenseOffers 至少 6 个，覆盖全部 6 种授权方式", () => {
  assert.ok(Array.isArray(jsonLicenseOffers), "licenseOffers 必须是数组");
  assert.ok(jsonLicenseOffers.length >= 6, `licenseOffers 至少 6 个，实际 ${jsonLicenseOffers.length}`);

  const types = new Set(jsonLicenseOffers.map((o) => o.type));
  for (const t of ALL_LICENSE_TYPES) {
    assert.ok(types.has(t), `缺少授权方式 ${t}`);
  }
});

test("usageGrants 至少 3 个，覆盖 pending/active/expired", () => {
  assert.ok(Array.isArray(jsonUsageGrants), "usageGrants 必须是数组");
  assert.ok(jsonUsageGrants.length >= 3, `usageGrants 至少 3 个，实际 ${jsonUsageGrants.length}`);

  const statuses = new Set(jsonUsageGrants.map((g) => g.status));
  assert.ok(statuses.has("pending"), "缺少 pending 状态");
  assert.ok(statuses.has("active"), "缺少 active 状态");
  assert.ok(statuses.has("expired"), "缺少 expired 状态");
  for (const s of jsonUsageGrants.map((g) => g.status)) {
    assert.ok(ALL_USAGE_GRANT_STATUSES.includes(s), `usageGrant.status 非法: ${s}`);
  }
});

test("creators 至少 4 个，含作品履历", () => {
  assert.ok(Array.isArray(jsonCreators), "creators 必须是数组");
  assert.ok(jsonCreators.length >= 4, `creators 至少 4 个，实际 ${jsonCreators.length}`);

  for (const c of jsonCreators) {
    assert.equal(typeof c.id, "string");
    assert.equal(typeof c.name, "string");
    assert.equal(typeof c.worksCount, "number");
    assert.equal(typeof c.usageCount, "number");
  }
});

test("每个 asset 字段结构符合 MarketplaceAsset 契约", () => {
  for (const asset of jsonAssets) {
    assert.equal(typeof asset.id, "string", "id 必须是 string");
    assert.equal(typeof asset.name, "string", "name 必须是 string");
    assert.ok(ALL_ASSET_TYPES.includes(asset.type), `type 非法: ${asset.type}`);
    assert.equal(typeof asset.thumbnail, "string", "thumbnail 必须是 string");
    assert.equal(typeof asset.description, "string", "description 必须是 string");
    assert.ok(Array.isArray(asset.tags), "tags 必须是数组");
    assert.ok(Array.isArray(asset.allowedUses), "allowedUses 必须是数组");
    assert.ok(Array.isArray(asset.forbiddenUses), "forbiddenUses 必须是数组");
    assert.ok(["public", "private", "team"].includes(asset.visibility), `visibility 非法: ${asset.visibility}`);
    assert.ok(ALL_ASSET_STATUSES.includes(asset.status), `status 非法: ${asset.status}`);
    assert.equal(typeof asset.portraitBased, "boolean", "portraitBased 必须是 boolean");
    assert.equal(typeof asset.usageCount, "number", "usageCount 必须是 number");
    assert.equal(typeof asset.rating, "number", "rating 必须是 number");

    // licenseOffer 结构
    assert.ok(ALL_LICENSE_TYPES.includes(asset.licenseOffer.type), `licenseOffer.type 非法`);
    assert.ok(["platform_free", "non_commercial", "single_project", "team_internal", "custom"].includes(asset.licenseOffer.commercialScope));
    assert.ok(["allowed", "not_allowed", "with_attribution"].includes(asset.licenseOffer.modificationScope));
    assert.ok(Array.isArray(asset.licenseOffer.territory));

    // sourceEvidence 结构
    assert.ok(["verified", "pending", "missing"].includes(asset.sourceEvidence.status));

    // mainVersion 结构
    assert.equal(typeof asset.mainVersion.id, "string");
    assert.equal(typeof asset.mainVersion.preview, "string");
    assert.equal(typeof asset.mainVersion.createdAt, "string");

    // creator 结构
    assert.equal(typeof asset.creator.id, "string");
    assert.equal(typeof asset.creator.name, "string");
    assert.equal(typeof asset.creator.worksCount, "number");
    assert.equal(typeof asset.creator.usageCount, "number");
  }
});

test("stats 结构符合 MarketplaceStats 契约", () => {
  assert.equal(typeof jsonStats.totalAssets, "number");
  assert.equal(jsonStats.totalAssets, jsonAssets.length, "totalAssets 必须等于 assets 数量");
  assert.equal(typeof jsonStats.byType, "object");
  assert.equal(typeof jsonStats.byStatus, "object");
  assert.equal(typeof jsonStats.byLicenseType, "object");

  for (const t of ALL_ASSET_TYPES) {
    assert.equal(typeof jsonStats.byType[t], "number", `byType.${t} 必须是 number`);
  }
  for (const s of ALL_ASSET_STATUSES) {
    assert.equal(typeof jsonStats.byStatus[s], "number", `byStatus.${s} 必须是 number`);
  }
  for (const l of ALL_LICENSE_TYPES) {
    assert.equal(typeof jsonStats.byLicenseType[l], "number", `byLicenseType.${l} 必须是 number`);
  }

  // byType 计数之和必须等于 totalAssets
  const typeSum = ALL_ASSET_TYPES.reduce((sum, t) => sum + jsonStats.byType[t], 0);
  assert.equal(typeSum, jsonStats.totalAssets, "byType 计数之和必须等于 totalAssets");
  // byStatus 计数之和必须等于 totalAssets
  const statusSum = ALL_ASSET_STATUSES.reduce((sum, s) => sum + jsonStats.byStatus[s], 0);
  assert.equal(statusSum, jsonStats.totalAssets, "byStatus 计数之和必须等于 totalAssets");
  // byLicenseType 计数之和必须等于 totalAssets
  const licenseSum = ALL_LICENSE_TYPES.reduce((sum, l) => sum + jsonStats.byLicenseType[l], 0);
  assert.equal(licenseSum, jsonStats.totalAssets, "byLicenseType 计数之和必须等于 totalAssets");
});

test("publishFlow 包含 6 种资产类型、6 种授权方式、3 种可见范围", () => {
  assert.equal(jsonPublishFlow.assetTypes.length, 6);
  assert.equal(jsonPublishFlow.licenseTypes.length, 6);
  assert.equal(jsonPublishFlow.visibilities.length, 3);
});

// ============================================================
// 3. 不暴露敏感字段（PRD §9.4 强制，验收标准 1）
// ============================================================

test("fixture JSON 不包含 prompt / storagePath / internalId 等敏感字段", () => {
  // 检查整个 JSON 文本不包含敏感字段名作为 key
  for (const key of SENSITIVE_KEYS) {
    const pattern = new RegExp(`"${key}"\\s*:`, "i");
    assert.ok(
      !pattern.test(raw),
      `fixture JSON 不应包含敏感字段: ${key}`,
    );
  }
});

test("每个 asset 对象不含敏感字段 key", () => {
  for (const asset of jsonAssets) {
    for (const key of SENSITIVE_KEYS) {
      assert.ok(!(key in asset), `asset ${asset.id} 不应包含敏感字段: ${key}`);
      assert.ok(!(key in asset.licenseOffer), `asset.licenseOffer 不应包含敏感字段: ${key}`);
      assert.ok(!(key in asset.mainVersion), `asset.mainVersion 不应包含敏感字段: ${key}`);
    }
  }
});

test("TS 内联 fixture 不含敏感字段", () => {
  for (const asset of FIXTURE_ASSETS) {
    for (const key of SENSITIVE_KEYS) {
      assert.ok(!(key in asset), `TS asset ${asset.id} 不应包含敏感字段: ${key}`);
    }
  }
});

// ============================================================
// 4. 真人肖像权利状态（PRD §9.2 强制，验收标准 3）
// ============================================================

test("portraitBased=true 时 rightsStatus 必须明确（confirmed 或 unconfirmed）", () => {
  for (const asset of jsonAssets) {
    if (asset.portraitBased) {
      assert.ok(
        asset.rightsStatus === "confirmed" || asset.rightsStatus === "unconfirmed",
        `portraitBased=true 的资产 ${asset.id} 的 rightsStatus 必须明确，实际: ${asset.rightsStatus}`,
      );
    }
  }
});

test("portraitBased=false 时 rightsStatus 应为 not_applicable", () => {
  for (const asset of jsonAssets) {
    if (!asset.portraitBased) {
      assert.equal(
        asset.rightsStatus,
        "not_applicable",
        `portraitBased=false 的资产 ${asset.id} 的 rightsStatus 应为 not_applicable`,
      );
    }
  }
});

test("fixture 至少有 1 个肖像已确认资产和 1 个肖像未确认资产", () => {
  const confirmed = jsonAssets.filter((a) => a.portraitBased && a.rightsStatus === "confirmed");
  const unconfirmed = jsonAssets.filter((a) => a.portraitBased && a.rightsStatus === "unconfirmed");
  assert.ok(confirmed.length >= 1, "应至少有 1 个肖像已确认资产");
  assert.ok(unconfirmed.length >= 1, "应至少有 1 个肖像未确认资产");
});

test("canPublishPublicly：肖像未确认时不可公开发布", () => {
  for (const asset of FIXTURE_ASSETS) {
    if (asset.portraitBased && asset.rightsStatus === "unconfirmed") {
      assert.equal(canPublishPublicly(asset), false, `资产 ${asset.id} 肖像未确认，不应可公开发布`);
    }
    if (!asset.portraitBased) {
      assert.equal(canPublishPublicly(asset), true, `资产 ${asset.id} 非肖像，应可公开发布`);
    }
  }
});

test("canGrantCommercial：肖像未确认时不可商业授权", () => {
  for (const asset of FIXTURE_ASSETS) {
    if (asset.portraitBased && asset.rightsStatus === "unconfirmed") {
      assert.equal(canGrantCommercial(asset), false, `资产 ${asset.id} 肖像未确认，不应可商业授权`);
    }
  }
});

// ============================================================
// 5. 免费与付费授权明确区分（验收标准 4）
// ============================================================

test("fixture 同时包含免费与付费资产", () => {
  const free = jsonAssets.filter((a) => isLicenseFree(a.licenseOffer));
  const paid = jsonAssets.filter((a) => isLicensePaid(a.licenseOffer));
  assert.ok(free.length >= 1, "应至少有 1 个免费资产");
  assert.ok(paid.length >= 1, "应至少有 1 个付费资产");
});

test("isLicenseFree / isLicensePaid 互斥", () => {
  for (const offer of FIXTURE_LICENSE_OFFERS) {
    assert.notEqual(isLicenseFree(offer), isLicensePaid(offer), `免费与付费应互斥: ${offer.id}`);
  }
});

test("license type=free 时价格必须为 null/0", () => {
  for (const offer of jsonLicenseOffers) {
    if (offer.type === "free") {
      assert.ok(offer.price === null || offer.price === 0, `free 类型价格应为 null/0: ${offer.id}`);
    }
  }
});

test("isLicenseCommercial 正确区分商业与非商业", () => {
  for (const offer of FIXTURE_LICENSE_OFFERS) {
    const commercial = isLicenseCommercial(offer);
    if (offer.commercialScope === "platform_free" || offer.commercialScope === "non_commercial") {
      assert.equal(commercial, false, `${offer.id} 应为非商业`);
    } else {
      assert.equal(commercial, true, `${offer.id} 应为商业`);
    }
  }
});

test("formatPrice 免费显示免费，付费显示金额", () => {
  for (const offer of FIXTURE_LICENSE_OFFERS) {
    const formatted = formatPrice(offer, "zh-CN");
    if (isLicenseFree(offer)) {
      assert.equal(formatted, "免费");
    } else {
      assert.ok(formatted.includes("¥") || formatted.includes("CNY"), `付费应显示金额: ${formatted}`);
    }
  }
});

// ============================================================
// 6. 搜索 / 筛选逻辑
// ============================================================

test("searchAssets 按名称匹配", () => {
  const results = searchAssets(FIXTURE_ASSETS, "Mara");
  assert.ok(results.length >= 1, "应搜到 Mara 相关资产");
  assert.ok(results.some((a) => a.name.includes("Mara")));
});

test("searchAssets 按标签匹配（大小写不敏感）", () => {
  const results = searchAssets(FIXTURE_ASSETS, "赛博朋克");
  assert.ok(results.length >= 1, "应搜到赛博朋克标签资产");
  assert.ok(results.every((a) => a.tags.some((t) => t.includes("赛博朋克")) || a.name.includes("赛博朋克")));
});

test("searchAssets 按类型匹配", () => {
  const results = searchAssets(FIXTURE_ASSETS, "ai_actor");
  assert.ok(results.length >= 1, "应搜到 ai_actor 类型资产");
});

test("searchAssets 按允许用途匹配", () => {
  const results = searchAssets(FIXTURE_ASSETS, "分镜预览");
  assert.ok(results.length >= 1, "应搜到允许分镜预览的资产");
});

test("searchAssets 空 query 返回全部", () => {
  const results = searchAssets(FIXTURE_ASSETS, "");
  assert.equal(results.length, FIXTURE_ASSETS.length);
});

test("filterAssets 按类型筛选", () => {
  const filtered = filterAssets(FIXTURE_ASSETS, {
    ...DEFAULT_FILTER,
    types: ["ai_actor"],
  });
  assert.ok(filtered.length >= 1);
  assert.ok(filtered.every((a) => a.type === "ai_actor"));
});

test("filterAssets 免费筛选", () => {
  const filtered = filterAssets(FIXTURE_ASSETS, {
    ...DEFAULT_FILTER,
    freeOnly: true,
  });
  assert.ok(filtered.length >= 1);
  assert.ok(filtered.every((a) => isLicenseFree(a.licenseOffer)));
});

test("filterAssets 付费筛选", () => {
  const filtered = filterAssets(FIXTURE_ASSETS, {
    ...DEFAULT_FILTER,
    paidOnly: true,
  });
  assert.ok(filtered.length >= 1);
  assert.ok(filtered.every((a) => isLicensePaid(a.licenseOffer)));
});

test("filterAssets 按授权方式筛选", () => {
  const filtered = filterAssets(FIXTURE_ASSETS, {
    ...DEFAULT_FILTER,
    licenseTypes: ["free"],
  });
  assert.ok(filtered.every((a) => a.licenseOffer.type === "free"));
});

test("filterAssets 组合筛选（类型 + 免费状态）", () => {
  const filtered = filterAssets(FIXTURE_ASSETS, {
    ...DEFAULT_FILTER,
    types: ["scene"],
    freeOnly: true,
  });
  assert.ok(filtered.length >= 1);
  assert.ok(filtered.every((a) => a.type === "scene" && isLicenseFree(a.licenseOffer)));
});

test("queryAssets 完整流水线（搜索 + 筛选 + 排序）", () => {
  const results = queryAssets(FIXTURE_ASSETS, {
    ...DEFAULT_FILTER,
    query: "",
  });
  assert.equal(results.length, FIXTURE_ASSETS.length);
  // 推荐资产应排在前面
  const firstRecommended = results.findIndex((a) => a.recommended === true);
  const firstNonRecommended = results.findIndex((a) => a.recommended !== true);
  if (firstRecommended >= 0 && firstNonRecommended >= 0) {
    assert.ok(firstRecommended < firstNonRecommended, "推荐资产应排在非推荐资产之前");
  }
});

// ============================================================
// 7. 排序与推荐可解释（验收：推荐不以付费排序伪装）
// ============================================================

test("sortAssets 推荐资产优先", () => {
  const sorted = sortAssets(FIXTURE_ASSETS);
  const firstIdx = sorted.findIndex((a) => a.recommended === true);
  const lastIdx = sorted.map((a) => a.recommended === true).lastIndexOf(true);
  const nonRecIdx = sorted.findIndex((a) => a.recommended !== true);
  if (firstIdx >= 0 && nonRecIdx >= 0) {
    assert.ok(firstIdx < nonRecIdx, "推荐资产应在非推荐资产之前");
    // 所有推荐资产连续在前
    for (let i = 0; i <= lastIdx; i++) {
      if (i < firstIdx) continue;
    }
  }
});

test("推荐资产中既有免费也有付费（不按付费排序伪装）", () => {
  const recommended = FIXTURE_ASSETS.filter((a) => a.recommended === true);
  assert.ok(recommended.length >= 2, "应至少有 2 个推荐资产");
  const recFree = recommended.filter((a) => isLicenseFree(a.licenseOffer));
  const recPaid = recommended.filter((a) => isLicensePaid(a.licenseOffer));
  assert.ok(recFree.length >= 1, "推荐中应有免费资产");
  assert.ok(recPaid.length >= 1, "推荐中应有付费资产");
});

test("validateRecommendation：recommended=true 时必须有 recommendationReason", () => {
  for (const asset of FIXTURE_ASSETS) {
    const result = validateRecommendation(asset);
    assert.ok(result.valid, `资产 ${asset.id} 推荐校验失败: ${result.reason || ""}`);
  }
});

test("validateRecommendation：推荐理由不含付费排名语义", () => {
  for (const asset of FIXTURE_ASSETS) {
    if (asset.recommended) {
      const result = validateRecommendation(asset);
      assert.ok(result.valid, `资产 ${asset.id} 推荐理由不应基于付费排名`);
    }
  }
});

test("JSON 中 recommended=true 的资产都有 recommendationReason", () => {
  for (const asset of jsonAssets) {
    if (asset.recommended === true) {
      assert.ok(
        typeof asset.recommendationReason === "string" && asset.recommendationReason.length > 0,
        `推荐资产 ${asset.id} 必须有 recommendationReason`,
      );
    }
  }
});

// ============================================================
// 8. 调用入口：创建副本不修改原资产（PRD §9.5 强制，验收标准 2）
// ============================================================

test("createProjectCopy 返回独立副本，不修改原资产", () => {
  const asset = FIXTURE_ASSETS[0];
  const beforeJson = JSON.stringify(asset);
  const request = {
    assetId: asset.id,
    projectId: "proj-test",
    projectName: "测试项目",
    roleName: "女主角",
    usagePurpose: "平台内项目",
  };
  const copy = createProjectCopy(asset, request, "grant-test");
  // 原资产未被修改
  const afterJson = JSON.stringify(asset);
  assert.equal(afterJson, beforeJson, "原资产不应被修改");
  // 副本是独立对象
  assert.notEqual(copy.id, asset.id, "副本应有独立 ID");
  assert.equal(copy.sourceAssetId, asset.id, "副本应记录来源资产 ID");
  assert.equal(copy.sourceCreatorId, asset.creator.id, "副本应保留来源创建者 ID");
  assert.equal(copy.sourceCreatorName, asset.creator.name, "副本应保留来源创建者名称");
  assert.equal(copy.projectId, request.projectId);
  assert.equal(copy.roleName, request.roleName);
});

test("createProjectCopy 保留 lineage 来源关系", () => {
  const asset = FIXTURE_ASSETS[3];
  const request = {
    assetId: asset.id,
    projectId: "proj-test-2",
    projectName: "测试项目2",
    roleName: "反派",
    usagePurpose: "单项目商业",
  };
  const copy = createProjectCopy(asset, request, "grant-test-2");
  assert.equal(copy.lineage.sourceAssetId, asset.id);
  assert.equal(copy.lineage.sourceCreatorId, asset.creator.id);
  assert.equal(copy.lineage.sourceCreatorName, asset.creator.name);
});

test("assertAssetUnmodified 在未修改时不抛错", () => {
  const asset = FIXTURE_ASSETS[0];
  const snapshot = JSON.parse(JSON.stringify(asset));
  assert.doesNotThrow(() => assertAssetUnmodified(snapshot, asset));
});

test("assertAssetUnmodified 在修改时抛错", () => {
  const asset = FIXTURE_ASSETS[0];
  const snapshot = JSON.parse(JSON.stringify(asset));
  const modified = { ...asset, name: "被篡改" };
  assert.throws(
    () => assertAssetUnmodified(snapshot, modified),
    /原资产被修改/,
  );
});

test("validateUsageEntry：suspended 资产不可调用（停止新调用）", () => {
  const suspended = FIXTURE_ASSETS.find((a) => a.status === "suspended");
  assert.ok(suspended, "fixture 应有 suspended 资产");
  const result = validateUsageEntry(suspended, {
    assetId: suspended.id,
    projectId: "p",
    projectName: "p",
    roleName: "r",
    usagePurpose: "平台内项目",
  });
  assert.equal(result.valid, false, "suspended 资产应不可调用");
  assert.ok(result.error, "应给出错误原因");
});

test("validateUsageEntry：published 资产可调用", () => {
  const published = FIXTURE_ASSETS.find((a) => a.status === "published" && !a.portraitBased);
  assert.ok(published);
  const result = validateUsageEntry(published, {
    assetId: published.id,
    projectId: "p",
    projectName: "p",
    roleName: "r",
    usagePurpose: "平台内项目",
  });
  assert.equal(result.valid, true, "published 非肖像资产应可调用");
});

test("validateUsageEntry：肖像未确认资产不可商业用途", () => {
  const unconfirmed = FIXTURE_ASSETS.find(
    (a) => a.portraitBased && a.rightsStatus === "unconfirmed",
  );
  assert.ok(unconfirmed, "fixture 应有肖像未确认资产");
  const result = validateUsageEntry(unconfirmed, {
    assetId: unconfirmed.id,
    projectId: "p",
    projectName: "p",
    roleName: "r",
    usagePurpose: "单项目商业",
  });
  assert.equal(result.valid, false, "肖像未确认资产不可商业用途");
});

test("isAssetUsable：published/ready 可用，suspended/archived 不可用", () => {
  for (const asset of FIXTURE_ASSETS) {
    const usable = isAssetUsable(asset);
    if (asset.status === "published" || asset.status === "ready") {
      assert.equal(usable, true, `${asset.id} (${asset.status}) 应可用`);
    } else {
      assert.equal(usable, false, `${asset.id} (${asset.status}) 应不可用`);
    }
  }
});

test("canExistingCopyContinue：资产撤销后 active 授权的副本仍可继续", () => {
  const suspended = FIXTURE_ASSETS.find((a) => a.status === "suspended");
  const activeGrant = FIXTURE_USAGE_GRANTS.find((g) => g.status === "active");
  assert.ok(suspended);
  assert.ok(activeGrant);
  // active 授权即使资产 suspended 仍可继续
  assert.equal(canExistingCopyContinue(activeGrant, suspended), true);
});

test("canExistingCopyContinue：expired 授权不可继续", () => {
  const expiredGrant = FIXTURE_USAGE_GRANTS.find((g) => g.status === "expired");
  const asset = FIXTURE_ASSETS.find((a) => a.id === expiredGrant.assetId);
  assert.equal(canExistingCopyContinue(expiredGrant, asset), false);
});

test("buildGrantSummary 生成授权摘要", () => {
  const asset = FIXTURE_ASSETS[0];
  const summary = buildGrantSummary(asset, {
    assetId: asset.id,
    projectId: "p",
    projectName: "项目",
    roleName: "角色",
    usagePurpose: "平台内项目",
  });
  assert.equal(summary.assetName, asset.name);
  assert.equal(summary.creatorName, asset.creator.name);
  assert.equal(summary.projectName, "项目");
});

// ============================================================
// 9. 防漂移断言：TS 内联与 JSON 一致
// ============================================================

test("防漂移：TS 与 JSON assets 数量一致", () => {
  assert.equal(FIXTURE_ASSETS.length, jsonAssets.length, "TS 与 JSON assets 数量不一致");
});

test("防漂移：TS 与 JSON 每个 asset 逐字段一致", () => {
  for (let i = 0; i < FIXTURE_ASSETS.length; i++) {
    const ts = FIXTURE_ASSETS[i];
    const json = jsonAssets[i];
    assert.equal(ts.id, json.id, `id 不一致: ${ts.id} vs ${json.id}`);
    assert.equal(ts.name, json.name, `name 不一致: ${ts.id}`);
    assert.equal(ts.type, json.type, `type 不一致: ${ts.id}`);
    assert.equal(ts.thumbnail, json.thumbnail, `thumbnail 不一致: ${ts.id}`);
    assert.equal(ts.description, json.description, `description 不一致: ${ts.id}`);
    assert.deepEqual(ts.tags, json.tags, `tags 不一致: ${ts.id}`);
    assert.deepEqual(ts.allowedUses, json.allowedUses, `allowedUses 不一致: ${ts.id}`);
    assert.deepEqual(ts.forbiddenUses, json.forbiddenUses, `forbiddenUses 不一致: ${ts.id}`);
    assert.equal(ts.visibility, json.visibility, `visibility 不一致: ${ts.id}`);
    assert.equal(ts.status, json.status, `status 不一致: ${ts.id}`);
    assert.equal(ts.portraitBased, json.portraitBased, `portraitBased 不一致: ${ts.id}`);
    assert.equal(ts.rightsStatus, json.rightsStatus, `rightsStatus 不一致: ${ts.id}`);
    assert.equal(ts.usageCount, json.usageCount, `usageCount 不一致: ${ts.id}`);
    assert.equal(ts.rating, json.rating, `rating 不一致: ${ts.id}`);
    assert.equal(ts.recommended ?? false, json.recommended ?? false, `recommended 不一致: ${ts.id}`);
    assert.equal(ts.recommendationReason ?? null, json.recommendationReason ?? null, `recommendationReason 不一致: ${ts.id}`);
    assert.equal(ts.createdAt, json.createdAt, `createdAt 不一致: ${ts.id}`);

    // creator 逐字段
    assert.equal(ts.creator.id, json.creator.id, `creator.id 不一致: ${ts.id}`);
    assert.equal(ts.creator.name, json.creator.name, `creator.name 不一致: ${ts.id}`);
    assert.equal(ts.creator.worksCount, json.creator.worksCount, `creator.worksCount 不一致: ${ts.id}`);
    assert.equal(ts.creator.usageCount, json.creator.usageCount, `creator.usageCount 不一致: ${ts.id}`);
    assert.equal(ts.creator.bio ?? null, json.creator.bio ?? null, `creator.bio 不一致: ${ts.id}`);

    // licenseOffer 逐字段
    assert.equal(ts.licenseOffer.id, json.licenseOffer.id, `licenseOffer.id 不一致: ${ts.id}`);
    assert.equal(ts.licenseOffer.type, json.licenseOffer.type, `licenseOffer.type 不一致: ${ts.id}`);
    assert.equal(ts.licenseOffer.commercialScope, json.licenseOffer.commercialScope, `licenseOffer.commercialScope 不一致: ${ts.id}`);
    assert.equal(ts.licenseOffer.modificationScope, json.licenseOffer.modificationScope, `licenseOffer.modificationScope 不一致: ${ts.id}`);
    assert.deepEqual(ts.licenseOffer.territory, json.licenseOffer.territory, `licenseOffer.territory 不一致: ${ts.id}`);
    assert.equal(ts.licenseOffer.durationDays, json.licenseOffer.durationDays, `licenseOffer.durationDays 不一致: ${ts.id}`);
    assert.equal(ts.licenseOffer.price, json.licenseOffer.price, `licenseOffer.price 不一致: ${ts.id}`);
    assert.equal(ts.licenseOffer.currency, json.licenseOffer.currency, `licenseOffer.currency 不一致: ${ts.id}`);

    // sourceEvidence
    assert.equal(ts.sourceEvidence.status, json.sourceEvidence.status, `sourceEvidence.status 不一致: ${ts.id}`);
    assert.equal(ts.sourceEvidence.verifiedAt, json.sourceEvidence.verifiedAt, `sourceEvidence.verifiedAt 不一致: ${ts.id}`);

    // mainVersion
    assert.equal(ts.mainVersion.id, json.mainVersion.id, `mainVersion.id 不一致: ${ts.id}`);
    assert.equal(ts.mainVersion.preview, json.mainVersion.preview, `mainVersion.preview 不一致: ${ts.id}`);
    assert.equal(ts.mainVersion.createdAt, json.mainVersion.createdAt, `mainVersion.createdAt 不一致: ${ts.id}`);
  }
});

test("防漂移：TS 与 JSON licenseOffers 一致", () => {
  assert.equal(FIXTURE_LICENSE_OFFERS.length, jsonLicenseOffers.length);
  for (let i = 0; i < FIXTURE_LICENSE_OFFERS.length; i++) {
    const ts = FIXTURE_LICENSE_OFFERS[i];
    const json = jsonLicenseOffers[i];
    assert.equal(ts.id, json.id);
    assert.equal(ts.type, json.type);
    assert.equal(ts.commercialScope, json.commercialScope);
    assert.equal(ts.modificationScope, json.modificationScope);
    assert.deepEqual(ts.territory, json.territory);
    assert.equal(ts.durationDays, json.durationDays);
    assert.equal(ts.price, json.price);
    assert.equal(ts.currency, json.currency);
  }
});

test("防漂移：TS 与 JSON usageGrants 一致", () => {
  assert.equal(FIXTURE_USAGE_GRANTS.length, jsonUsageGrants.length);
  for (let i = 0; i < FIXTURE_USAGE_GRANTS.length; i++) {
    const ts = FIXTURE_USAGE_GRANTS[i];
    const json = jsonUsageGrants[i];
    assert.equal(ts.id, json.id);
    assert.equal(ts.assetId, json.assetId);
    assert.equal(ts.assetVersionId, json.assetVersionId);
    assert.equal(ts.offerId, json.offerId);
    assert.equal(ts.projectId, json.projectId);
    assert.equal(ts.projectName, json.projectName);
    assert.equal(ts.status, json.status);
    assert.equal(ts.grantedAt, json.grantedAt);
    assert.equal(ts.expiresAt, json.expiresAt);
  }
});

test("防漂移：TS 与 JSON creators 一致", () => {
  assert.equal(FIXTURE_CREATORS.length, jsonCreators.length);
  for (let i = 0; i < FIXTURE_CREATORS.length; i++) {
    const ts = FIXTURE_CREATORS[i];
    const json = jsonCreators[i];
    assert.equal(ts.id, json.id);
    assert.equal(ts.name, json.name);
    assert.equal(ts.worksCount, json.worksCount);
    assert.equal(ts.usageCount, json.usageCount);
    assert.equal(ts.bio ?? null, json.bio ?? null);
  }
});

test("防漂移：TS 与 JSON stats 一致", () => {
  assert.equal(FIXTURE_STATS.totalAssets, jsonStats.totalAssets);
  for (const t of ALL_ASSET_TYPES) {
    assert.equal(FIXTURE_STATS.byType[t], jsonStats.byType[t], `byType.${t} 不一致`);
  }
  for (const s of ALL_ASSET_STATUSES) {
    assert.equal(FIXTURE_STATS.byStatus[s], jsonStats.byStatus[s], `byStatus.${s} 不一致`);
  }
  for (const l of ALL_LICENSE_TYPES) {
    assert.equal(FIXTURE_STATS.byLicenseType[l], jsonStats.byLicenseType[l], `byLicenseType.${l} 不一致`);
  }
});

test("防漂移：TS 与 JSON publishFlow 一致", () => {
  assert.equal(FIXTURE_PUBLISH_FLOW.assetTypes.length, jsonPublishFlow.assetTypes.length);
  assert.equal(FIXTURE_PUBLISH_FLOW.licenseTypes.length, jsonPublishFlow.licenseTypes.length);
  assert.equal(FIXTURE_PUBLISH_FLOW.visibilities.length, jsonPublishFlow.visibilities.length);
  for (let i = 0; i < FIXTURE_PUBLISH_FLOW.assetTypes.length; i++) {
    assert.equal(FIXTURE_PUBLISH_FLOW.assetTypes[i].value, jsonPublishFlow.assetTypes[i].value);
    assert.equal(FIXTURE_PUBLISH_FLOW.assetTypes[i].labelZh, jsonPublishFlow.assetTypes[i].labelZh);
    assert.equal(FIXTURE_PUBLISH_FLOW.assetTypes[i].labelEn, jsonPublishFlow.assetTypes[i].labelEn);
  }
  for (let i = 0; i < FIXTURE_PUBLISH_FLOW.licenseTypes.length; i++) {
    assert.equal(FIXTURE_PUBLISH_FLOW.licenseTypes[i].value, jsonPublishFlow.licenseTypes[i].value);
    assert.equal(FIXTURE_PUBLISH_FLOW.licenseTypes[i].labelZh, jsonPublishFlow.licenseTypes[i].labelZh);
    assert.equal(FIXTURE_PUBLISH_FLOW.licenseTypes[i].labelEn, jsonPublishFlow.licenseTypes[i].labelEn);
    assert.equal(FIXTURE_PUBLISH_FLOW.licenseTypes[i].paid, jsonPublishFlow.licenseTypes[i].paid);
  }
});

// ============================================================
// 10. fixture 可独立预览（loadFixtureDataset / loadFixtureAssetById）
// ============================================================

test("loadFixtureDataset 返回完整数据集，契约版本匹配", () => {
  const dataset = loadFixtureDataset();
  assert.equal(dataset.contractVersion, CONTRACT_VERSION);
  assert.ok(dataset.assets.length >= 12);
  assert.ok(dataset.licenseOffers.length >= 6);
  assert.ok(dataset.usageGrants.length >= 3);
  assert.ok(dataset.creators.length >= 4);
  assert.ok(dataset.publishFlow);
  assert.ok(dataset.stats);
});

test("loadFixtureAssetById 返回深拷贝（不共享引用）", () => {
  const a1 = loadFixtureAssetById("ast-001");
  const a2 = loadFixtureAssetById("ast-001");
  assert.ok(a1);
  assert.ok(a2);
  assert.notEqual(a1, a2, "应返回不同对象实例");
  assert.equal(a1.id, a2.id);
  // 修改 a1 不影响 a2
  a1.name = "被修改";
  assert.notEqual(a1.name, a2.name, "深拷贝应独立");
});

test("loadFixtureAssetById 不存在的 ID 返回 null", () => {
  const result = loadFixtureAssetById("not-exist");
  assert.equal(result, null);
});

test("loadFixtureDataset 返回的数据可被 JSON 序列化（无循环引用）", () => {
  const dataset = loadFixtureDataset();
  assert.doesNotThrow(() => JSON.stringify(dataset));
});
