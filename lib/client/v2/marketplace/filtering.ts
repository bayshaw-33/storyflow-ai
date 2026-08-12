/**
 * K2-T-09 市场纯函数：搜索、筛选、排序、授权分类、权利校验。
 *
 * 全部为纯函数，不依赖 DOM / fetch / JSON import，便于 Node 测试直接导入。
 *
 * 核心原则（PRD §9）：
 * - 推荐可解释：recommended=true 必须有 recommendationReason，不以付费排序伪装自然结果
 * - 真人肖像权利：portraitBased=true 且 rightsStatus !== "confirmed" 时不得公开发布或商业授权
 * - 免费与付费明确区分
 */
import type {
  CommercialScope,
  LicenseOffer,
  LicenseType,
  MarketplaceAsset,
  MarketplaceAssetType,
  MarketplaceFilter,
  ModificationScope,
} from "./types.ts";

// ============================================================
// 授权方式分类
// ============================================================

/** 判断授权是否为免费（type=free 或 price 为 null/0） */
export function isLicenseFree(license: LicenseOffer): boolean {
  if (license.type === "free") return true;
  if (license.price === null || license.price === 0) return true;
  return false;
}

/** 判断授权是否为付费（价格 > 0） */
export function isLicensePaid(license: LicenseOffer): boolean {
  return !isLicenseFree(license);
}

/**
 * 判断授权是否为商业授权。
 * commercialScope 为 single_project / team_internal / custom 视为商业；
 * platform_free / non_commercial 视为非商业。
 */
export function isLicenseCommercial(license: LicenseOffer): boolean {
  return (
    license.commercialScope === "single_project" ||
    license.commercialScope === "team_internal" ||
    license.commercialScope === "custom"
  );
}

/** LicenseType 到 CommercialScope 的映射（用于发布流程） */
export const LICENSE_TYPE_TO_COMMERCIAL_SCOPE: Record<LicenseType, CommercialScope> = {
  free: "platform_free",
  non_commercial: "non_commercial",
  single_project_commercial: "single_project",
  time_limited: "custom",
  team_internal: "team_internal",
  custom: "custom",
};

/** 获取授权方式的商业范围 */
export function commercialScopeOf(license: LicenseOffer): CommercialScope {
  return license.commercialScope;
}

/** 获取授权方式的修改范围 */
export function modificationScopeOf(license: LicenseOffer): ModificationScope {
  return license.modificationScope;
}

// ============================================================
// 真人肖像权利校验（PRD §9.2 强制）
// ============================================================

/**
 * 判断资产是否可公开发布。
 * 真人肖像（portraitBased=true）且权利未确认（rightsStatus !== "confirmed"）时不得公开发布。
 */
export function canPublishPublicly(asset: MarketplaceAsset): boolean {
  if (!asset.portraitBased) return true;
  return asset.rightsStatus === "confirmed";
}

/**
 * 判断资产是否可商业授权。
 * 真人肖像且权利未确认时不得商业授权。
 */
export function canGrantCommercial(asset: MarketplaceAsset): boolean {
  if (!asset.portraitBased) return true;
  return asset.rightsStatus === "confirmed";
}

/**
 * 判断资产是否处于可调用状态。
 * suspended / archived 状态停止新调用（PRD §9.5：资产撤销后停止新调用）。
 */
export function isAssetUsable(asset: MarketplaceAsset): boolean {
  return asset.status === "published" || asset.status === "ready";
}

// ============================================================
// 搜索
// ============================================================

/**
 * 按关键词搜索资产。
 * 匹配字段：名称、标签、类型、允许用途。
 * 大小写不敏感，空 query 返回全部。
 */
export function searchAssets(
  assets: readonly MarketplaceAsset[],
  query: string,
): MarketplaceAsset[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...assets];
  return assets.filter((asset) => {
    if (asset.name.toLowerCase().includes(q)) return true;
    if (asset.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
    if (asset.type.toLowerCase().includes(q)) return true;
    if (asset.allowedUses.some((use) => use.toLowerCase().includes(q))) return true;
    return false;
  });
}

// ============================================================
// 筛选
// ============================================================

/** 应用单个筛选条件到资产列表 */
export function filterAssets(
  assets: readonly MarketplaceAsset[],
  filter: MarketplaceFilter,
): MarketplaceAsset[] {
  return assets.filter((asset) => {
    // 关键词搜索
    if (filter.query.trim()) {
      const searched = searchAssets([asset], filter.query);
      if (searched.length === 0) return false;
    }
    // 类型
    if (filter.types.length > 0 && !filter.types.includes(asset.type)) return false;
    // 授权方式
    if (filter.licenseTypes.length > 0 && !filter.licenseTypes.includes(asset.licenseOffer.type)) {
      return false;
    }
    // 商业范围
    if (
      filter.commercialScopes.length > 0 &&
      !filter.commercialScopes.includes(asset.licenseOffer.commercialScope)
    ) {
      return false;
    }
    // 修改范围
    if (
      filter.modificationScopes.length > 0 &&
      !filter.modificationScopes.includes(asset.licenseOffer.modificationScope)
    ) {
      return false;
    }
    // 地域
    if (filter.territories.length > 0) {
      const assetTerritories = asset.licenseOffer.territory;
      // 资产地域为空表示全球，匹配任意地域筛选
      if (assetTerritories.length > 0) {
        const matched = filter.territories.some((t) => assetTerritories.includes(t));
        if (!matched) return false;
      }
    }
    // 状态
    if (filter.statuses.length > 0 && !filter.statuses.includes(asset.status)) return false;
    // 免费/付费
    if (filter.freeOnly && !isLicenseFree(asset.licenseOffer)) return false;
    if (filter.paidOnly && !isLicensePaid(asset.licenseOffer)) return false;
    return true;
  });
}

// ============================================================
// 排序（推荐可解释，不以付费排序伪装自然结果）
// ============================================================

/**
 * 排序资产列表。
 *
 * 排序规则（透明、可解释）：
 * 1. 推荐资产优先（recommended=true），但推荐理由必须基于内容/用途匹配，而非付费排名
 * 2. 同推荐级别内，按评分降序
 * 3. 同评分内，按使用次数降序
 *
 * 关键：付费资产不会因为"付费"而排在免费资产前面。推荐标记独立于价格。
 */
export function sortAssets(assets: readonly MarketplaceAsset[]): MarketplaceAsset[] {
  return [...assets].sort((a, b) => {
    // 推荐优先
    const aRec = a.recommended === true ? 1 : 0;
    const bRec = b.recommended === true ? 1 : 0;
    if (aRec !== bRec) return bRec - aRec;
    // 评分降序
    if (b.rating !== a.rating) return b.rating - a.rating;
    // 使用次数降序
    return b.usageCount - a.usageCount;
  });
}

/** 完整的搜索 + 筛选 + 排序流水线 */
export function queryAssets(
  assets: readonly MarketplaceAsset[],
  filter: MarketplaceFilter,
): MarketplaceAsset[] {
  const filtered = filterAssets(assets, filter);
  return sortAssets(filtered);
}

// ============================================================
// 推荐可解释校验
// ============================================================

/**
 * 校验推荐可解释性：
 * - recommended=true 时必须有 recommendationReason
 * - 推荐理由不能是单纯的"付费高"类语义
 */
export function validateRecommendation(asset: MarketplaceAsset): {
  valid: boolean;
  reason?: string;
} {
  if (!asset.recommended) return { valid: true };
  if (!asset.recommendationReason || asset.recommendationReason.trim().length === 0) {
    return { valid: false, reason: "推荐资产缺少可解释理由" };
  }
  // 推荐理由不应是付费排名语义
  const paidKeywords = ["付费最高", "收益最高", "价格最高", "最贵"];
  const r = asset.recommendationReason.toLowerCase();
  for (const kw of paidKeywords) {
    if (r.includes(kw.toLowerCase())) {
      return { valid: false, reason: `推荐理由不应基于付费排名: ${kw}` };
    }
  }
  return { valid: true };
}

// ============================================================
// 标签与本地化
// ============================================================

/** 资产类型中文标签 */
export const ASSET_TYPE_LABELS_ZH: Record<MarketplaceAssetType, string> = {
  ai_actor: "AI演员",
  character: "角色形象",
  scene: "场景",
  prop: "道具",
  style_pack: "视觉风格包",
  universe_setting: "Universe设定包",
};

/** 资产类型英文标签 */
export const ASSET_TYPE_LABELS_EN: Record<MarketplaceAssetType, string> = {
  ai_actor: "AI Actor",
  character: "Character",
  scene: "Scene",
  prop: "Prop",
  style_pack: "Style Pack",
  universe_setting: "Universe Setting",
};

export function assetTypeLabel(type: MarketplaceAssetType, locale: string): string {
  return locale === "zh-CN" ? ASSET_TYPE_LABELS_ZH[type] : ASSET_TYPE_LABELS_EN[type];
}

/** 授权方式中文标签 */
export const LICENSE_TYPE_LABELS_ZH: Record<LicenseType, string> = {
  free: "平台内免费",
  non_commercial: "非商业",
  single_project_commercial: "单项目商业",
  time_limited: "指定期限",
  team_internal: "团队内部",
  custom: "定制申请",
};

/** 授权方式英文标签 */
export const LICENSE_TYPE_LABELS_EN: Record<LicenseType, string> = {
  free: "Platform Free",
  non_commercial: "Non-Commercial",
  single_project_commercial: "Single-Project Commercial",
  time_limited: "Time-Limited",
  team_internal: "Team Internal",
  custom: "Custom",
};

export function licenseTypeLabel(type: LicenseType, locale: string): string {
  return locale === "zh-CN" ? LICENSE_TYPE_LABELS_ZH[type] : LICENSE_TYPE_LABELS_EN[type];
}

/** 格式化价格（分 → 元，免费显示"免费"） */
export function formatPrice(license: LicenseOffer, locale: string): string {
  if (isLicenseFree(license)) {
    return locale === "zh-CN" ? "免费" : "Free";
  }
  const amount = (license.price ?? 0) / 100;
  const currency = license.currency || "CNY";
  if (currency === "CNY") {
    return locale === "zh-CN" ? `¥${amount.toFixed(2)}` : `CNY ${amount.toFixed(2)}`;
  }
  return `${currency} ${amount.toFixed(2)}`;
}
