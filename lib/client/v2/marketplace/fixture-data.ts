/**
 * K2-T-09 演员与资产市场 fixture 数据（内联 TS 模块）。
 *
 * 重要教训：不要用 dynamic import 加载 tests/ 目录的 JSON。
 * 这里把 fixture 数据内联为 TS export，供 fixtures.ts 与组件直接使用。
 * 同步副本写入 tests/fixtures/kiikis-v2/marketplace.json，由测试防漂移断言保证一致。
 *
 * 数据约束（PRD §9.4）：
 * - 绝不包含 prompt / storagePath / internalId 等敏感字段
 * - 真人肖像 portraitBased=true 时 rightsStatus 必须明确
 * - 推荐资产必须有可解释理由（不基于付费排名）
 */
import type {
  Creator,
  LicenseOffer,
  MarketplaceAsset,
  MarketplaceDataset,
  MarketplaceStats,
  PublishFlowOptions,
  UsageGrant,
} from "./types.ts";

// ============================================================
// 创建者（4 个，含作品履历）
// ============================================================

export const FIXTURE_CREATORS: readonly Creator[] = [
  {
    id: "c-001",
    name: "星河工作室",
    worksCount: 24,
    usageCount: 312,
    bio: "专注 AI 演员与角色形象，长期输出高质量数字人物。",
  },
  {
    id: "c-002",
    name: "夜行人影像",
    worksCount: 18,
    usageCount: 156,
    bio: "悬疑/暗黑风格场景与道具创作者。",
  },
  {
    id: "c-003",
    name: "玻璃海创作组",
    worksCount: 42,
    usageCount: 489,
    bio: "奇幻世界观与视觉风格包工作室。",
  },
  {
    id: "c-004",
    name: "独立作者 Lin",
    worksCount: 7,
    usageCount: 43,
    bio: "独立短剧作者，偶尔发布道具与设定包。",
  },
];

// ============================================================
// 授权方式模板（6 个，对应 6 种授权模板）
// ============================================================

export const FIXTURE_LICENSE_OFFERS: readonly LicenseOffer[] = [
  {
    id: "lo-free",
    type: "free",
    commercialScope: "platform_free",
    modificationScope: "allowed",
    territory: [],
    durationDays: null,
    price: null,
    currency: null,
  },
  {
    id: "lo-noncomm",
    type: "non_commercial",
    commercialScope: "non_commercial",
    modificationScope: "not_allowed",
    territory: ["CN", "JP"],
    durationDays: null,
    price: null,
    currency: null,
  },
  {
    id: "lo-single",
    type: "single_project_commercial",
    commercialScope: "single_project",
    modificationScope: "with_attribution",
    territory: [],
    durationDays: null,
    price: 9900,
    currency: "CNY",
  },
  {
    id: "lo-time",
    type: "time_limited",
    commercialScope: "custom",
    modificationScope: "allowed",
    territory: ["CN"],
    durationDays: 90,
    price: 19900,
    currency: "CNY",
  },
  {
    id: "lo-team",
    type: "team_internal",
    commercialScope: "team_internal",
    modificationScope: "allowed",
    territory: [],
    durationDays: null,
    price: null,
    currency: null,
  },
  {
    id: "lo-custom",
    type: "custom",
    commercialScope: "custom",
    modificationScope: "with_attribution",
    territory: [],
    durationDays: null,
    price: 49900,
    currency: "CNY",
  },
];

// ============================================================
// 资产（13 个，覆盖全部类型/状态/授权方式/肖像场景）
// ============================================================

export const FIXTURE_ASSETS: readonly MarketplaceAsset[] = [
  // 1. AI演员 - 已确认肖像 - 免费 - 推荐
  {
    id: "ast-001",
    name: "星河 Mira",
    type: "ai_actor",
    thumbnail: "/placeholder/marketplace/ast-001.jpg",
    creator: { ...FIXTURE_CREATORS[0] },
    description: "数字女性演员，适合现代都市与轻科幻题材，表情自然、风格百搭。",
    tags: ["女性", "都市", "轻科幻", "数字人"],
    allowedUses: ["平台内项目", "短剧出演", "分镜预览"],
    forbiddenUses: ["真人冒充", "政治敏感", "色情"],
    visibility: "public",
    status: "published",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[0] },
    sourceEvidence: { status: "verified", verifiedAt: "2026-07-20T10:00:00.000Z" },
    portraitBased: true,
    rightsStatus: "confirmed",
    mainVersion: {
      id: "mv-001",
      preview: "/placeholder/marketplace/ast-001-preview.jpg",
      createdAt: "2026-07-15T08:00:00.000Z",
    },
    usageCount: 128,
    rating: 4.8,
    recommended: true,
    recommendationReason: "与你当前项目「夜色法则」风格匹配，且免费可用，适合作为女主角候选。",
    createdAt: "2026-07-15T08:00:00.000Z",
  },
  // 2. AI演员 - 已确认肖像 - 非商业
  {
    id: "ast-002",
    name: "夜行人 Kael",
    type: "ai_actor",
    thumbnail: "/placeholder/marketplace/ast-002.jpg",
    creator: { ...FIXTURE_CREATORS[1] },
    description: "数字男演员，擅长悬疑/暗黑风格，眼神表现力强。",
    tags: ["男性", "悬疑", "暗黑", "数字人"],
    allowedUses: ["平台内项目", "短剧出演", "分镜预览"],
    forbiddenUses: ["商业广告", "真人冒充", "色情"],
    visibility: "public",
    status: "published",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[1] },
    sourceEvidence: { status: "verified", verifiedAt: "2026-07-22T10:00:00.000Z" },
    portraitBased: true,
    rightsStatus: "confirmed",
    mainVersion: {
      id: "mv-002",
      preview: "/placeholder/marketplace/ast-002-preview.jpg",
      createdAt: "2026-07-18T08:00:00.000Z",
    },
    usageCount: 76,
    rating: 4.5,
    createdAt: "2026-07-18T08:00:00.000Z",
  },
  // 3. AI演员 - 未确认肖像 - 已暂停（不得公开发布/商业）
  {
    id: "ast-003",
    name: "试拍演员 X-07",
    type: "ai_actor",
    thumbnail: "/placeholder/marketplace/ast-003.jpg",
    creator: { ...FIXTURE_CREATORS[1] },
    description: "试拍阶段数字演员，肖像授权尚未确认，暂不开放公开调用。",
    tags: ["男性", "试拍", "待授权"],
    allowedUses: ["平台内项目（非公开）"],
    forbiddenUses: ["公开发布", "商业用途", "真人冒充"],
    visibility: "private",
    status: "suspended",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[2] },
    sourceEvidence: { status: "pending", verifiedAt: null },
    portraitBased: true,
    rightsStatus: "unconfirmed",
    mainVersion: {
      id: "mv-003",
      preview: "/placeholder/marketplace/ast-003-preview.jpg",
      createdAt: "2026-08-01T08:00:00.000Z",
    },
    usageCount: 0,
    rating: 0,
    createdAt: "2026-08-01T08:00:00.000Z",
  },
  // 4. 角色形象 - 单项目商业 - 推荐
  {
    id: "ast-004",
    name: "Mara 复仇千金",
    type: "character",
    thumbnail: "/placeholder/marketplace/ast-004.jpg",
    creator: { ...FIXTURE_CREATORS[0] },
    description: "复仇千金角色形象包，含正面/侧面/背面三视图与表情集。",
    tags: ["女性", "复仇", "千金", "三视图"],
    allowedUses: ["单项目商业", "短剧出演", "分镜预览", "衍生开发"],
    forbiddenUses: ["跨项目复用", "转售"],
    visibility: "public",
    status: "published",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[2] },
    sourceEvidence: { status: "verified", verifiedAt: "2026-07-25T10:00:00.000Z" },
    portraitBased: false,
    rightsStatus: "not_applicable",
    mainVersion: {
      id: "mv-004",
      preview: "/placeholder/marketplace/ast-004-preview.jpg",
      createdAt: "2026-07-20T08:00:00.000Z",
    },
    usageCount: 54,
    rating: 4.7,
    recommended: true,
    recommendationReason: "近期高频使用的复仇千金原型，与你「夜色法则」女主角设定高度契合。",
    createdAt: "2026-07-20T08:00:00.000Z",
  },
  // 5. 角色形象 - 指定期限 - 付费
  {
    id: "ast-005",
    name: "Kael 暗夜猎手",
    type: "character",
    thumbnail: "/placeholder/marketplace/ast-005.jpg",
    creator: { ...FIXTURE_CREATORS[1] },
    description: "暗夜猎手角色形象，含战斗姿态与武器配件，90 天授权。",
    tags: ["男性", "猎手", "战斗", "武器"],
    allowedUses: ["单项目商业", "短剧出演", "分镜预览"],
    forbiddenUses: ["转售", "跨项目复用"],
    visibility: "public",
    status: "published",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[3] },
    sourceEvidence: { status: "verified", verifiedAt: "2026-07-26T10:00:00.000Z" },
    portraitBased: false,
    rightsStatus: "not_applicable",
    mainVersion: {
      id: "mv-005",
      preview: "/placeholder/marketplace/ast-005-preview.jpg",
      createdAt: "2026-07-22T08:00:00.000Z",
    },
    usageCount: 31,
    rating: 4.3,
    createdAt: "2026-07-22T08:00:00.000Z",
  },
  // 6. 场景 - 免费 - 推荐
  {
    id: "ast-006",
    name: "霓虹码头",
    type: "scene",
    thumbnail: "/placeholder/marketplace/ast-006.jpg",
    creator: { ...FIXTURE_CREATORS[1] },
    description: "赛博朋克风格码头场景，含日夜两版与雾效图层。",
    tags: ["赛博朋克", "码头", "夜景", "雾效"],
    allowedUses: ["平台内项目", "短剧场景", "分镜预览"],
    forbiddenUses: ["转售", "独立售卖"],
    visibility: "public",
    status: "published",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[0] },
    sourceEvidence: { status: "verified", verifiedAt: "2026-07-28T10:00:00.000Z" },
    portraitBased: false,
    rightsStatus: "not_applicable",
    mainVersion: {
      id: "mv-006",
      preview: "/placeholder/marketplace/ast-006-preview.jpg",
      createdAt: "2026-07-24T08:00:00.000Z",
    },
    usageCount: 89,
    rating: 4.6,
    recommended: true,
    recommendationReason: "近期高频使用场景，与你当前项目的码头戏份需求匹配，免费可用。",
    createdAt: "2026-07-24T08:00:00.000Z",
  },
  // 7. 场景 - 非商业
  {
    id: "ast-007",
    name: "玻璃海宫殿",
    type: "scene",
    thumbnail: "/placeholder/marketplace/ast-007.jpg",
    creator: { ...FIXTURE_CREATORS[2] },
    description: "奇幻风格玻璃海宫殿场景，含内景与外景两版。",
    tags: ["奇幻", "宫殿", "玻璃", "内景外景"],
    allowedUses: ["平台内项目（非商业）", "短剧场景", "分镜预览"],
    forbiddenUses: ["商业广告", "转售"],
    visibility: "public",
    status: "published",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[1] },
    sourceEvidence: { status: "verified", verifiedAt: "2026-07-29T10:00:00.000Z" },
    portraitBased: false,
    rightsStatus: "not_applicable",
    mainVersion: {
      id: "mv-007",
      preview: "/placeholder/marketplace/ast-007-preview.jpg",
      createdAt: "2026-07-26T08:00:00.000Z",
    },
    usageCount: 42,
    rating: 4.4,
    createdAt: "2026-07-26T08:00:00.000Z",
  },
  // 8. 道具 - 团队内部
  {
    id: "ast-008",
    name: "古铜怀表",
    type: "prop",
    thumbnail: "/placeholder/marketplace/ast-008.jpg",
    creator: { ...FIXTURE_CREATORS[1] },
    description: "复古古铜怀表道具，含开合动画与机芯细节。",
    tags: ["复古", "怀表", "动画", "道具"],
    allowedUses: ["团队内部项目", "短剧道具", "分镜预览"],
    forbiddenUses: ["团队外流转", "转售"],
    visibility: "team",
    status: "published",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[4] },
    sourceEvidence: { status: "verified", verifiedAt: "2026-07-30T10:00:00.000Z" },
    portraitBased: false,
    rightsStatus: "not_applicable",
    mainVersion: {
      id: "mv-008",
      preview: "/placeholder/marketplace/ast-008-preview.jpg",
      createdAt: "2026-07-28T08:00:00.000Z",
    },
    usageCount: 23,
    rating: 4.2,
    createdAt: "2026-07-28T08:00:00.000Z",
  },
  // 9. 道具 - 免费 - ready 状态
  {
    id: "ast-009",
    name: "神秘信封",
    type: "prop",
    thumbnail: "/placeholder/marketplace/ast-009.jpg",
    creator: { ...FIXTURE_CREATORS[3] },
    description: "悬疑剧情用神秘信封道具，含蜡封与拆开动画。",
    tags: ["悬疑", "信封", "蜡封", "动画"],
    allowedUses: ["平台内项目", "短剧道具", "分镜预览"],
    forbiddenUses: ["转售"],
    visibility: "public",
    status: "ready",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[0] },
    sourceEvidence: { status: "pending", verifiedAt: null },
    portraitBased: false,
    rightsStatus: "not_applicable",
    mainVersion: {
      id: "mv-009",
      preview: "/placeholder/marketplace/ast-009-preview.jpg",
      createdAt: "2026-08-02T08:00:00.000Z",
    },
    usageCount: 5,
    rating: 3.9,
    createdAt: "2026-08-02T08:00:00.000Z",
  },
  // 10. 视觉风格包 - 定制申请 - 付费 - 推荐
  {
    id: "ast-010",
    name: "赛博朋克霓虹",
    type: "style_pack",
    thumbnail: "/placeholder/marketplace/ast-010.jpg",
    creator: { ...FIXTURE_CREATORS[2] },
    description: "完整赛博朋克霓虹视觉风格包，含色调LUT、字体、UI组件与示例分镜。",
    tags: ["赛博朋克", "霓虹", "LUT", "风格包"],
    allowedUses: ["单项目商业", "衍生开发", "分镜预览"],
    forbiddenUses: ["转售", "独立售卖"],
    visibility: "public",
    status: "published",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[5] },
    sourceEvidence: { status: "verified", verifiedAt: "2026-08-01T10:00:00.000Z" },
    portraitBased: false,
    rightsStatus: "not_applicable",
    mainVersion: {
      id: "mv-010",
      preview: "/placeholder/marketplace/ast-010-preview.jpg",
      createdAt: "2026-07-30T08:00:00.000Z",
    },
    usageCount: 67,
    rating: 4.9,
    recommended: true,
    recommendationReason: "你近期 3 个项目均使用赛博朋克风格，该风格包完整度最高，可统一定调。",
    createdAt: "2026-07-30T08:00:00.000Z",
  },
  // 11. 视觉风格包 - 指定期限 - 付费
  {
    id: "ast-011",
    name: "水彩童话",
    type: "style_pack",
    thumbnail: "/placeholder/marketplace/ast-011.jpg",
    creator: { ...FIXTURE_CREATORS[2] },
    description: "水彩童话视觉风格包，含手绘纹理与柔和色调，90 天授权。",
    tags: ["水彩", "童话", "手绘", "风格包"],
    allowedUses: ["单项目商业", "分镜预览"],
    forbiddenUses: ["转售", "跨项目复用"],
    visibility: "public",
    status: "published",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[3] },
    sourceEvidence: { status: "verified", verifiedAt: "2026-08-03T10:00:00.000Z" },
    portraitBased: false,
    rightsStatus: "not_applicable",
    mainVersion: {
      id: "mv-011",
      preview: "/placeholder/marketplace/ast-011-preview.jpg",
      createdAt: "2026-08-01T08:00:00.000Z",
    },
    usageCount: 18,
    rating: 4.1,
    createdAt: "2026-08-01T08:00:00.000Z",
  },
  // 12. Universe设定包 - 单项目商业 - 推荐
  {
    id: "ast-012",
    name: "夜色法则世界观",
    type: "universe_setting",
    thumbnail: "/placeholder/marketplace/ast-012.jpg",
    creator: { ...FIXTURE_CREATORS[0] },
    description: "完整「夜色法则」世界观设定包，含角色关系、时间线、场景与规则集。",
    tags: ["夜色法则", "世界观", "设定包", "悬疑"],
    allowedUses: ["单项目商业", "衍生开发", "Canon 继承"],
    forbiddenUses: ["转售", "独立售卖"],
    visibility: "public",
    status: "published",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[2] },
    sourceEvidence: { status: "verified", verifiedAt: "2026-08-04T10:00:00.000Z" },
    portraitBased: false,
    rightsStatus: "not_applicable",
    mainVersion: {
      id: "mv-012",
      preview: "/placeholder/marketplace/ast-012-preview.jpg",
      createdAt: "2026-07-29T08:00:00.000Z",
    },
    usageCount: 102,
    rating: 4.8,
    recommended: true,
    recommendationReason: "你正在创作的 Universe，可直接继承 Canon 与角色关系，避免重复设定。",
    createdAt: "2026-07-29T08:00:00.000Z",
  },
  // 13. Universe设定包 - 非商业
  {
    id: "ast-013",
    name: "玻璃海设定",
    type: "universe_setting",
    thumbnail: "/placeholder/marketplace/ast-013.jpg",
    creator: { ...FIXTURE_CREATORS[2] },
    description: "「玻璃海」奇幻世界观设定包，含地理、种族与魔法体系。",
    tags: ["玻璃海", "世界观", "设定包", "奇幻"],
    allowedUses: ["平台内项目（非商业）", "Canon 继承", "分镜预览"],
    forbiddenUses: ["商业广告", "转售"],
    visibility: "public",
    status: "published",
    licenseOffer: { ...FIXTURE_LICENSE_OFFERS[1] },
    sourceEvidence: { status: "verified", verifiedAt: "2026-08-05T10:00:00.000Z" },
    portraitBased: false,
    rightsStatus: "not_applicable",
    mainVersion: {
      id: "mv-013",
      preview: "/placeholder/marketplace/ast-013-preview.jpg",
      createdAt: "2026-08-03T08:00:00.000Z",
    },
    usageCount: 37,
    rating: 4.5,
    createdAt: "2026-08-03T08:00:00.000Z",
  },
];

// ============================================================
// 使用授权记录（3 个，覆盖 pending/active/expired）
// ============================================================

export const FIXTURE_USAGE_GRANTS: readonly UsageGrant[] = [
  {
    id: "ug-001",
    assetId: "ast-001",
    assetVersionId: "mv-001",
    offerId: "lo-free",
    projectId: "proj-night-rule",
    projectName: "夜色法则",
    status: "active",
    grantedAt: "2026-08-05T10:00:00.000Z",
    expiresAt: null,
  },
  {
    id: "ug-002",
    assetId: "ast-004",
    assetVersionId: "mv-004",
    offerId: "lo-single",
    projectId: "proj-glass-sea",
    projectName: "玻璃海",
    status: "pending",
    grantedAt: "2026-08-08T10:00:00.000Z",
    expiresAt: null,
  },
  {
    id: "ug-003",
    assetId: "ast-005",
    assetVersionId: "mv-005",
    offerId: "lo-time",
    projectId: "proj-old-case",
    projectName: "旧案",
    status: "expired",
    grantedAt: "2026-05-01T10:00:00.000Z",
    expiresAt: "2026-07-30T10:00:00.000Z",
  },
];

// ============================================================
// 发布流程选项
// ============================================================

export const FIXTURE_PUBLISH_FLOW: PublishFlowOptions = {
  assetTypes: [
    { value: "ai_actor", labelZh: "AI演员", labelEn: "AI Actor" },
    { value: "character", labelZh: "角色形象", labelEn: "Character" },
    { value: "scene", labelZh: "场景", labelEn: "Scene" },
    { value: "prop", labelZh: "道具", labelEn: "Prop" },
    { value: "style_pack", labelZh: "视觉风格包", labelEn: "Style Pack" },
    { value: "universe_setting", labelZh: "Universe设定包", labelEn: "Universe Setting" },
  ],
  licenseTypes: [
    { value: "free", labelZh: "平台内免费", labelEn: "Platform Free", paid: false },
    { value: "non_commercial", labelZh: "非商业", labelEn: "Non-Commercial", paid: false },
    {
      value: "single_project_commercial",
      labelZh: "单项目商业",
      labelEn: "Single-Project Commercial",
      paid: true,
    },
    { value: "time_limited", labelZh: "指定期限", labelEn: "Time-Limited", paid: true },
    { value: "team_internal", labelZh: "团队内部", labelEn: "Team Internal", paid: false },
    { value: "custom", labelZh: "定制申请", labelEn: "Custom", paid: true },
  ],
  visibilities: [
    { value: "public", labelZh: "公开", labelEn: "Public" },
    { value: "private", labelZh: "私有", labelEn: "Private" },
    { value: "team", labelZh: "团队", labelEn: "Team" },
  ],
};

// ============================================================
// 预计算统计
// ============================================================

export const FIXTURE_STATS: MarketplaceStats = {
  totalAssets: 13,
  byType: {
    ai_actor: 3,
    character: 2,
    scene: 2,
    prop: 2,
    style_pack: 2,
    universe_setting: 2,
  },
  byStatus: {
    draft: 0,
    ready: 1,
    published: 11,
    suspended: 1,
    archived: 0,
  },
  byLicenseType: {
    free: 3,
    non_commercial: 3,
    single_project_commercial: 3,
    time_limited: 2,
    team_internal: 1,
    custom: 1,
  },
};

// ============================================================
// 完整数据集
// ============================================================

export const FIXTURE_DATASET: MarketplaceDataset = {
  contractVersion: "2.0.0-alpha.1",
  assets: FIXTURE_ASSETS as MarketplaceAsset[],
  licenseOffers: FIXTURE_LICENSE_OFFERS as LicenseOffer[],
  usageGrants: FIXTURE_USAGE_GRANTS as UsageGrant[],
  creators: FIXTURE_CREATORS as Creator[],
  publishFlow: FIXTURE_PUBLISH_FLOW,
  stats: FIXTURE_STATS,
};
