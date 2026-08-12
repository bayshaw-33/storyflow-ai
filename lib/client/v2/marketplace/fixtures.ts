/**
 * K2-T-09 市场 fixture 加载器。
 *
 * 从内联 TS 模块（fixture-data.ts）读取演示数据，
 * 不用 dynamic import 加载 tests/ 目录 JSON，避免打包与类型问题。
 * 真实数据走 api.ts 的 API 适配器。
 *
 * 返回浅拷贝，避免调用方误改原 fixture 数据。
 */
import {
  FIXTURE_ASSETS,
  FIXTURE_CREATORS,
  FIXTURE_DATASET,
  FIXTURE_LICENSE_OFFERS,
  FIXTURE_PUBLISH_FLOW,
  FIXTURE_STATS,
  FIXTURE_USAGE_GRANTS,
} from "./fixture-data.ts";
import {
  CONTRACT_VERSION,
  type MarketplaceAsset,
  type MarketplaceDataset,
  type Creator,
  type LicenseOffer,
  type PublishFlowOptions,
  type MarketplaceStats,
  type UsageGrant,
} from "./types.ts";

/** 深拷贝单个资产（含嵌套 creator / licenseOffer / mainVersion） */
function cloneAsset(asset: MarketplaceAsset): MarketplaceAsset {
  return {
    ...asset,
    creator: { ...asset.creator },
    tags: [...asset.tags],
    allowedUses: [...asset.allowedUses],
    forbiddenUses: [...asset.forbiddenUses],
    licenseOffer: { ...asset.licenseOffer, territory: [...asset.licenseOffer.territory] },
    sourceEvidence: { ...asset.sourceEvidence },
    mainVersion: { ...asset.mainVersion },
  };
}

/** 加载全部 fixture 资产（返回深拷贝，避免调用方误改原数据） */
export function loadFixtureAssets(): MarketplaceAsset[] {
  return FIXTURE_ASSETS.map(cloneAsset);
}

/** 加载 fixture 授权方式模板 */
export function loadFixtureLicenseOffers(): LicenseOffer[] {
  return FIXTURE_LICENSE_OFFERS.map((o) => ({ ...o, territory: [...o.territory] }));
}

/** 加载 fixture 使用授权记录 */
export function loadFixtureUsageGrants(): UsageGrant[] {
  return FIXTURE_USAGE_GRANTS.map((g) => ({ ...g }));
}

/** 加载 fixture 创建者 */
export function loadFixtureCreators(): Creator[] {
  return FIXTURE_CREATORS.map((c) => ({ ...c }));
}

/** 加载 fixture 发布流程选项 */
export function loadFixturePublishFlow(): PublishFlowOptions {
  return {
    assetTypes: FIXTURE_PUBLISH_FLOW.assetTypes.map((o) => ({ ...o })),
    licenseTypes: FIXTURE_PUBLISH_FLOW.licenseTypes.map((o) => ({ ...o })),
    visibilities: FIXTURE_PUBLISH_FLOW.visibilities.map((o) => ({ ...o })),
  };
}

/** 加载 fixture 预计算统计 */
export function loadFixtureStats(): MarketplaceStats {
  return {
    totalAssets: FIXTURE_STATS.totalAssets,
    byType: { ...FIXTURE_STATS.byType },
    byStatus: { ...FIXTURE_STATS.byStatus },
    byLicenseType: { ...FIXTURE_STATS.byLicenseType },
  };
}

/** 加载完整 fixture 数据集 */
export function loadFixtureDataset(): MarketplaceDataset {
  return {
    contractVersion: FIXTURE_DATASET.contractVersion || CONTRACT_VERSION,
    assets: loadFixtureAssets(),
    licenseOffers: loadFixtureLicenseOffers(),
    usageGrants: loadFixtureUsageGrants(),
    creators: loadFixtureCreators(),
    publishFlow: loadFixturePublishFlow(),
    stats: loadFixtureStats(),
  };
}

/** fixture 契约版本（用于运行时校验） */
export function fixtureContractVersion(): string {
  return FIXTURE_DATASET.contractVersion || CONTRACT_VERSION;
}

/** 按 ID 加载单个 fixture 资产 */
export function loadFixtureAssetById(id: string): MarketplaceAsset | null {
  const asset = FIXTURE_ASSETS.find((a) => a.id === id);
  return asset ? cloneAsset(asset) : null;
}
