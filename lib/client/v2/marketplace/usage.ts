/**
 * K2-T-09 调用入口纯函数：创建项目级副本，不修改原资产。
 *
 * PRD §9.5 强制要求：
 * - 使用动作创建项目级副本或 Portrayal，不修改原资产
 * - 保留原创建者和来源关系
 * - 资产撤销后停止新调用，但保留已有合法作品
 *
 * 全部为纯函数，便于 Node 测试直接导入验证不变性。
 */
import type {
  MarketplaceAsset,
  ProjectAssetCopy,
  UsageEntryRequest,
  UsageGrant,
} from "./types.ts";
import { canGrantCommercial, canPublishPublicly, isAssetUsable } from "./filtering.ts";

/**
 * 校验调用入口请求是否合法。
 *
 * 规则：
 * - 资产必须处于可调用状态（published / ready），suspended/archived 停止新调用
 * - 真人肖像未确认授权时不得商业用途
 * - 必须填写项目与角色
 */
export function validateUsageEntry(
  asset: MarketplaceAsset,
  request: UsageEntryRequest,
): { valid: boolean; error?: string } {
  // 资产可调用性
  if (!isAssetUsable(asset)) {
    return {
      valid: false,
      error: `资产当前状态为 ${asset.status}，已停止新调用。已有合法作品不受影响。`,
    };
  }
  // 必填项
  if (!request.projectId.trim()) {
    return { valid: false, error: "请选择目标项目。" };
  }
  if (!request.roleName.trim()) {
    return { valid: false, error: "请填写角色/用途名称。" };
  }
  // 真人肖像商业用途限制
  if (asset.portraitBased && asset.rightsStatus !== "confirmed") {
    if (isCommercialPurpose(request.usagePurpose)) {
      return {
        valid: false,
        error:
          "该资产基于真人肖像且权利未确认，不得用于商业用途。请先确认肖像授权状态。",
      };
    }
    // 未确认授权的真人肖像不得公开发布
    if (!canPublishPublicly(asset)) {
      return {
        valid: false,
        error: "该资产基于真人肖像且权利未确认，不得公开发布。",
      };
    }
  }
  // 商业授权校验
  if (isCommercialPurpose(request.usagePurpose) && !canGrantCommercial(asset)) {
    return {
      valid: false,
      error: "该资产授权方式不支持商业用途。",
    };
  }
  return { valid: true };
}

/** 判断用途是否为商业用途 */
function isCommercialPurpose(purpose: string): boolean {
  const commercialKeywords = ["商业", "commercial", "付费", "paid", "盈利", "revenue"];
  const p = purpose.toLowerCase();
  return commercialKeywords.some((kw) => p.includes(kw.toLowerCase()));
}

/**
 * 创建项目级副本（PRD §9.5 核心）。
 *
 * 关键约束：
 * - 不修改原资产：通过深拷贝验证原资产对象不变
 * - 副本是独立实体，有独立 ID
 * - 保留原创建者和来源关系（lineage）
 * - 原资产撤销后，副本仍保留（已有合法作品不受影响）
 *
 * @param asset 原资产（不会被修改）
 * @param request 调用请求
 * @param grantId 关联的使用授权 ID
 * @returns 项目级副本
 */
export function createProjectCopy(
  asset: MarketplaceAsset,
  request: UsageEntryRequest,
  grantId: string,
): ProjectAssetCopy {
  const copy: ProjectAssetCopy = {
    id: `copy-${asset.id}-${request.projectId}-${Date.now()}`,
    sourceAssetId: asset.id,
    sourceAssetName: asset.name,
    sourceCreatorId: asset.creator.id,
    sourceCreatorName: asset.creator.name,
    projectId: request.projectId,
    projectName: request.projectName,
    roleName: request.roleName,
    usagePurpose: request.usagePurpose,
    grantId,
    createdAt: new Date().toISOString(),
    lineage: {
      sourceAssetId: asset.id,
      sourceCreatorId: asset.creator.id,
      sourceCreatorName: asset.creator.name,
    },
  };
  return copy;
}

/**
 * 验证原资产未被修改（用于测试与运行时不变性断言）。
 *
 * 通过深拷贝前后对比，确保 createProjectCopy 不修改原资产。
 */
export function assertAssetUnmodified(
  before: MarketplaceAsset,
  after: MarketplaceAsset,
): void {
  const beforeJson = JSON.stringify(before);
  const afterJson = JSON.stringify(after);
  if (beforeJson !== afterJson) {
    throw new Error(
      `原资产被修改了！调用入口不得修改原资产（PRD §9.5）。`,
    );
  }
}

/**
 * 判断资产撤销后，已有副本是否仍可继续使用。
 *
 * PRD §9.5：资产撤销后停止新调用，但保留已有合法作品。
 * - 新调用：资产 suspended/archived 时 validateUsageEntry 返回 invalid
 * - 已有副本：基于 grant 状态判断，grant 为 active 时副本仍可用
 */
export function canExistingCopyContinue(
  grant: UsageGrant,
  asset: MarketplaceAsset,
): boolean {
  // 已有合法授权（active）的副本，即使资产撤销也可继续使用
  if (grant.status === "active") return true;
  // pending 状态的授权在资产撤销后转为不可用
  if (grant.status === "pending") {
    return asset.status === "published" || asset.status === "ready";
  }
  // expired / revoked_for_new_use / cancelled / disputed 的副本不可继续使用
  return false;
}

/** 生成使用授权摘要（用于授权确认界面） */
export function buildGrantSummary(
  asset: MarketplaceAsset,
  request: UsageEntryRequest,
): {
  assetName: string;
  creatorName: string;
  licenseType: string;
  commercialScope: string;
  price: string;
  roleName: string;
  usagePurpose: string;
  projectName: string;
  portraitWarning: string | null;
} {
  const license = asset.licenseOffer;
  const price =
    license.price === null || license.price === 0
      ? "免费"
      : `${license.currency || "CNY"} ${(license.price / 100).toFixed(2)}`;
  const portraitWarning =
    asset.portraitBased && asset.rightsStatus !== "confirmed"
      ? "该资产基于真人肖像且权利未确认，不得用于商业或公开发布。"
      : null;
  return {
    assetName: asset.name,
    creatorName: asset.creator.name,
    licenseType: license.type,
    commercialScope: license.commercialScope,
    price,
    roleName: request.roleName,
    usagePurpose: request.usagePurpose,
    projectName: request.projectName,
    portraitWarning,
  };
}
