/**
 * K2-T-09 演员与资产市场 - 领域类型契约
 *
 * 基于 PRD §9 资产市场与 Codex v2 契约（lib/contracts/v2/index.ts）。
 *
 * 核心约束（PRD §9.4 / §9.5 / §9.2 强制）：
 * - 不暴露内部 Prompt、存储路径、敏感元数据（MarketplaceAsset 不含这些字段）
 * - 使用动作创建项目级副本，不修改原资产
 * - 真人肖像未确认授权时不得公开发布或商业授权
 *
 * contract_version 与 Codex v2 契约对齐。
 */

export const CONTRACT_VERSION = "2.0.0-alpha.1";

// ============================================================
// 资产类型（市场面向，对齐 PRD §9.1）
// ============================================================

/** 资产类型：AI演员 / 角色形象 / 场景 / 道具 / 视觉风格包 / Universe设定包 */
export type MarketplaceAssetType =
  | "ai_actor" // AI演员
  | "character" // 角色形象
  | "scene" // 场景
  | "prop" // 道具
  | "style_pack" // 视觉风格包
  | "universe_setting"; // Universe设定包

/** 全部资产类型，用于遍历 */
export const ALL_ASSET_TYPES: readonly MarketplaceAssetType[] = [
  "ai_actor",
  "character",
  "scene",
  "prop",
  "style_pack",
  "universe_setting",
];

// ============================================================
// 授权方式（市场面向，对应 6 种授权模板）
// ============================================================

/**
 * 授权方式类型：
 * - free: 平台内免费
 * - non_commercial: 非商业
 * - single_project_commercial: 单项目商业
 * - time_limited: 指定期限
 * - team_internal: 团队内部
 * - custom: 定制申请
 */
export type LicenseType =
  | "free"
  | "non_commercial"
  | "single_project_commercial"
  | "time_limited"
  | "team_internal"
  | "custom";

/** 全部授权方式，用于遍历 */
export const ALL_LICENSE_TYPES: readonly LicenseType[] = [
  "free",
  "non_commercial",
  "single_project_commercial",
  "time_limited",
  "team_internal",
  "custom",
];

/** 商业范围，对齐 Codex LicenseOfferTerms.scope */
export type CommercialScope =
  | "platform_free"
  | "non_commercial"
  | "single_project"
  | "team_internal"
  | "custom";

/** 修改范围 */
export type ModificationScope = "allowed" | "not_allowed" | "with_attribution";

/** 可见范围 */
export type Visibility = "public" | "private" | "team";

/** 真人肖像权利状态（PRD §9.2 强制） */
export type RightsStatus = "confirmed" | "unconfirmed" | "not_applicable";

/** 来源证据状态 */
export type EvidenceStatus = "verified" | "pending" | "missing";

/** 资产状态，沿用契约 ASSET_STATUSES */
export type AssetStatus = "draft" | "ready" | "published" | "suspended" | "archived";

/** 全部资产状态 */
export const ALL_ASSET_STATUSES: readonly AssetStatus[] = [
  "draft",
  "ready",
  "published",
  "suspended",
  "archived",
];

/** 使用授权状态，沿用契约 USAGE_GRANT_STATUSES */
export type UsageGrantStatus =
  | "pending"
  | "active"
  | "expired"
  | "revoked_for_new_use"
  | "cancelled"
  | "disputed";

/** 全部使用授权状态 */
export const ALL_USAGE_GRANT_STATUSES: readonly UsageGrantStatus[] = [
  "pending",
  "active",
  "expired",
  "revoked_for_new_use",
  "cancelled",
  "disputed",
];

// ============================================================
// 实体类型
// ============================================================

/** 创建者信息（含作品履历与使用次数） */
export interface Creator {
  id: string;
  name: string;
  worksCount: number;
  usageCount: number;
  bio?: string;
}

/** 主版本预览 */
export interface AssetMainVersion {
  id: string;
  /** 预览 URL（图片/视频/音频），不含内部存储路径 */
  preview: string;
  createdAt: string;
}

/**
 * 授权方式摘要（License Offer）
 * 不含内部 offerId 之外的技术细节，只暴露市场需要的条款。
 */
export interface LicenseOffer {
  id: string;
  type: LicenseType;
  commercialScope: CommercialScope;
  modificationScope: ModificationScope;
  /** 地域限制，空数组表示全球 */
  territory: string[];
  /** 期限（天），null 表示永久 */
  durationDays: number | null;
  /** 价格（分），null 表示免费 */
  price: number | null;
  /** 货币，null 表示免费 */
  currency: string | null;
}

/** 来源与证据状态 */
export interface SourceEvidence {
  status: EvidenceStatus;
  verifiedAt: string | null;
}

/**
 * 市场资产（核心实体）
 *
 * 强制约束：本类型绝不包含 prompt / storagePath / internalId 等敏感字段。
 * 这些字段属于服务端适配器内部，不跨 v2 API 边界（PRD §9.4）。
 */
export interface MarketplaceAsset {
  id: string;
  name: string;
  type: MarketplaceAssetType;
  thumbnail: string;
  creator: Creator;
  description: string;
  tags: string[];
  /** 允许用途（明确列表） */
  allowedUses: string[];
  /** 禁止用途（明确列表） */
  forbiddenUses: string[];
  visibility: Visibility;
  status: AssetStatus;
  licenseOffer: LicenseOffer;
  sourceEvidence: SourceEvidence;
  /** 是否基于真人肖像（PRD §9.2） */
  portraitBased: boolean;
  /** 真人肖像权利状态 */
  rightsStatus: RightsStatus;
  mainVersion: AssetMainVersion;
  usageCount: number;
  /** 评分 0-5 */
  rating: number;
  /** 是否推荐（推荐必须有可解释理由，不以付费排序伪装） */
  recommended?: boolean;
  recommendationReason?: string;
  createdAt: string;
}

/** 使用授权记录 */
export interface UsageGrant {
  id: string;
  assetId: string;
  assetVersionId: string;
  offerId: string;
  projectId: string;
  projectName: string;
  status: UsageGrantStatus;
  grantedAt: string;
  expiresAt: string | null;
}

/** 发布流程选项 */
export interface PublishFlowOptions {
  assetTypes: { value: MarketplaceAssetType; labelZh: string; labelEn: string }[];
  licenseTypes: {
    value: LicenseType;
    labelZh: string;
    labelEn: string;
    paid: boolean;
  }[];
  visibilities: { value: Visibility; labelZh: string; labelEn: string }[];
}

/** 市场统计 */
export interface MarketplaceStats {
  totalAssets: number;
  byType: Record<MarketplaceAssetType, number>;
  byStatus: Record<AssetStatus, number>;
  byLicenseType: Record<LicenseType, number>;
}

/** 完整 fixture / API 返回的数据集 */
export interface MarketplaceDataset {
  contractVersion: string;
  assets: MarketplaceAsset[];
  licenseOffers: LicenseOffer[];
  usageGrants: UsageGrant[];
  creators: Creator[];
  publishFlow: PublishFlowOptions;
  stats: MarketplaceStats;
}

// ============================================================
// 筛选与调用入口类型
// ============================================================

/** 筛选条件 */
export interface MarketplaceFilter {
  query: string;
  types: MarketplaceAssetType[];
  licenseTypes: LicenseType[];
  commercialScopes: CommercialScope[];
  modificationScopes: ModificationScope[];
  territories: string[];
  statuses: AssetStatus[];
  /** 仅看免费 */
  freeOnly: boolean;
  /** 仅看付费 */
  paidOnly: boolean;
}

/** 默认筛选条件（空筛选） */
export const DEFAULT_FILTER: MarketplaceFilter = {
  query: "",
  types: [],
  licenseTypes: [],
  commercialScopes: [],
  modificationScopes: [],
  territories: [],
  statuses: [],
  freeOnly: false,
  paidOnly: false,
};

/**
 * 项目级副本（调用入口创建，PRD §9.5）
 *
 * 不修改原资产：副本是独立实体，保留原创建者和来源关系。
 * 原资产撤销后停止新调用，但已有副本保留。
 */
export interface ProjectAssetCopy {
  id: string;
  sourceAssetId: string;
  sourceAssetName: string;
  sourceCreatorId: string;
  sourceCreatorName: string;
  projectId: string;
  projectName: string;
  roleName: string;
  usagePurpose: string;
  grantId: string;
  createdAt: string;
  /** 来源关系（保留原创建者和资产关系） */
  lineage: {
    sourceAssetId: string;
    sourceCreatorId: string;
    sourceCreatorName: string;
  };
}

/** 调用入口请求参数 */
export interface UsageEntryRequest {
  assetId: string;
  projectId: string;
  projectName: string;
  roleName: string;
  usagePurpose: string;
}

// ============================================================
// 加载状态
// ============================================================

export type MarketplaceStatus = "loading" | "empty" | "error" | "ready" | "unauthenticated";

/** 校验 contract_version 是否匹配当前契约 */
export function assertContractVersion(version: string): void {
  if (version !== CONTRACT_VERSION) {
    throw new Error(
      `marketplace contract version mismatch: expected ${CONTRACT_VERSION}, got ${version}`,
    );
  }
}

// ============================================================
// Codex API DTO（K2-I-04 适配层内部使用）
//
// 对齐 Codex v2 服务端 toAsset / toAssetVersion / toOffer / toGrant
// 返回的扁平结构，用于 api.ts 的 DTO 映射函数。不对外暴露给 UI 组件。
// ============================================================

/** Codex 资产类型（服务端 AssetKind） */
export type CodexAssetKind =
  | "character"
  | "scene"
  | "prop"
  | "style"
  | "universe_package";

/** Codex 真人肖像权利状态（服务端 rightsState） */
export type CodexRightsState =
  | "ai_generated"
  | "portrait_confirmed"
  | "portrait_pending";

/** Codex 授权模板（服务端 LICENSE_TEMPLATES） */
export type CodexLicenseTemplate =
  | "platform_free"
  | "non_commercial"
  | "single_project"
  | "team_internal"
  | "commercial"
  | "custom";

/** Codex 授权条款（对齐 contracts/v2 LicenseOfferTerms） */
export interface CodexLicenseOfferTerms {
  commercial: boolean;
  scope: "platform_free" | "non_commercial" | "single_project" | "team_internal" | "custom";
  territory?: string[];
  durationDays?: number | null;
  modificationAllowed?: boolean;
}

/** Codex Asset DTO（服务端 toAsset 返回结构） */
export interface CodexAssetDTO {
  id: string;
  kind: CodexAssetKind;
  name: string;
  status: AssetStatus;
  currentVersionId: string | null;
  createdAt: string;
  actorId: string | null;
  rightsState: CodexRightsState | null;
  projectId: string | null;
  metadata: Record<string, unknown>;
}

/** Codex AssetVersion DTO（服务端 toAssetVersion 返回结构） */
export interface CodexAssetVersionDTO {
  id: string;
  assetId: string;
  parentVersionId: string | null;
  sourceProjectId: string;
  previewUrl: string | null;
  createdAt: string;
  sourceAssetId: string | null;
  sourceStep: string;
  modelKey: string | null;
  generationJobId: string | null;
  selectedByUserId: string | null;
  changeDescription: string;
  storageBucket: string;
  storagePath: string;
  previewStorageBucket: string | null;
  previewStoragePath: string | null;
  metadata: Record<string, unknown>;
  createdBy: string;
}

/** Codex LicenseOffer DTO（服务端 toOffer 返回结构） */
export interface CodexLicenseOfferDTO {
  id: string;
  assetId: string;
  assetVersionId: string;
  terms: CodexLicenseOfferTerms;
  priceCents: number;
  currency: string;
  template: CodexLicenseTemplate;
  status: string;
  createdAt: string;
}

/** Codex UsageGrant DTO（服务端 toGrant 返回结构） */
export interface CodexUsageGrantDTO {
  id: string;
  offerId: string;
  assetVersionId: string;
  projectId: string;
  status: string;
  expiresAt: string | null;
  assetId: string;
  licensorId: string;
  licenseeId: string;
  targetProjectId: string;
  createdAt: string;
}

/** Codex 错误响应结构 */
export interface CodexErrorResponse {
  success: false;
  error: string;
  code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "service_unavailable";
}

// ============================================================
// 写操作输入类型（K2-I-04）
// ============================================================

/** 发布资产输入（POST /api/v2/assets body） */
export interface PublishAssetInput {
  kind: CodexAssetKind;
  name: string;
  projectId?: string;
  actorId?: string;
  rightsState?: CodexRightsState;
  metadata?: Record<string, unknown>;
}

/** 创建授权要约输入（POST /api/v2/assets/[assetId]/license-offers body） */
export interface CreateLicenseOfferInput {
  assetVersionId: string;
  template: CodexLicenseTemplate;
  terms: CodexLicenseOfferTerms;
  priceCents?: number;
  currency?: string;
}
