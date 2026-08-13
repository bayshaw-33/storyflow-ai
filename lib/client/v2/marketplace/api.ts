/**
 * K2-I-04 市场 API 适配器（真实授权接线）。
 *
 * 默认 USE_FIXTURE=true 使用内联 fixture 演示数据；后端就绪后通过
 * NEXT_PUBLIC_USE_MARKETPLACE_FIXTURE=false 切换到真实 API。
 *
 * 资产 API 路径：/api/v2/assets（Codex 端，列表 + 详情 + 创建）
 * 授权要约路径：/api/v2/assets/[assetId]/license-offers
 * 授权 API 路径：/api/v2/marketplace/grants（Codex 端，授权 + 调用 + 撤销）
 *
 * 提供：
 * - 读：fetchMarketplace / fetchAssetById / fetchUsageGrants
 * - 写：publishAsset / createLicenseOffer / createUsageGrant / invokeUsageGrant / revokeUsageGrant
 * - DTO 映射：mapCodexAssetToMarketplaceAsset / mapCodexOfferToLicenseOffer / mapCodexGrantToUsageGrant
 *
 * 肖像保护（PRD §9.2）：rightsState 非 portrait_confirmed 时 Codex 服务端
 * 拒绝创建 license offer，客户端通过错误处理层透传 forbidden 错误。
 */
import {
  fixtureContractVersion,
  loadFixtureAssetById,
  loadFixtureDataset,
} from "./fixtures.ts";
import {
  ASSET_TYPE_LABELS_ZH,
  ASSET_TYPE_LABELS_EN,
  LICENSE_TYPE_LABELS_ZH,
  LICENSE_TYPE_LABELS_EN,
} from "./filtering.ts";
import {
  CONTRACT_VERSION,
  ALL_ASSET_TYPES,
  ALL_LICENSE_TYPES,
  type MarketplaceAsset,
  type MarketplaceAssetType,
  type MarketplaceDataset,
  type MarketplaceStats,
  type PublishFlowOptions,
  type LicenseOffer,
  type LicenseType,
  type CommercialScope,
  type ModificationScope,
  type UsageGrant,
  type RightsStatus,
  type Creator,
  type AssetMainVersion,
  type SourceEvidence,
  type Visibility,
  type CodexAssetDTO,
  type CodexAssetVersionDTO,
  type CodexLicenseOfferDTO,
  type CodexUsageGrantDTO,
  type CodexAssetKind,
  type CodexRightsState,
  type CodexLicenseTemplate,
  type PublishAssetInput,
  type CreateLicenseOfferInput,
} from "./types.ts";

// ============================================================
// 开关与常量
// ============================================================

/** 是否使用 fixture 演示数据（默认开启） */
export const USE_FIXTURE =
  process.env.NEXT_PUBLIC_USE_MARKETPLACE_FIXTURE !== "false";

/** 资产 API 基础路径（Codex 端，注意不是 /api/v2/marketplace） */
const ASSETS_API_BASE = "/api/v2/assets";

/** 授权 API 基础路径 */
const GRANTS_API_BASE = "/api/v2/marketplace/grants";

/** 自定义 fetch 注入选项（测试用） */
export interface MarketplaceFetchOptions {
  fetchImpl?: typeof fetch;
}

// ============================================================
// 错误类型
// ============================================================

/** 市场 API 错误码（对齐 Codex code 并保留 UI 依赖的 UNAUTHENTICATED） */
export const MARKETPLACE_API_ERROR_CODES = {
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  VALIDATION_FAILED: "validation_failed",
  SERVICE_UNAVAILABLE: "service_unavailable",
  MARKETPLACE_FETCH_FAILED: "marketplace_fetch_failed",
  CONTRACT_MISMATCH: "contract_mismatch",
} as const;

export type MarketplaceErrorCode =
  (typeof MARKETPLACE_API_ERROR_CODES)[keyof typeof MARKETPLACE_API_ERROR_CODES];

/** 市场 API 错误（带 code，UI 可据此切换提示态） */
export class MarketplaceApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MarketplaceApiError";
    this.code = code;
  }
}

/** 把 Codex 错误 code 映射到 TRAE 侧错误码 */
function mapCodexCode(codexCode: string | undefined, fallback: string): string {
  switch (codexCode) {
    case "unauthenticated":
      return MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED;
    case "forbidden":
      return MARKETPLACE_API_ERROR_CODES.FORBIDDEN;
    case "not_found":
      return MARKETPLACE_API_ERROR_CODES.NOT_FOUND;
    case "conflict":
      return MARKETPLACE_API_ERROR_CODES.CONFLICT;
    case "validation_failed":
      return MARKETPLACE_API_ERROR_CODES.VALIDATION_FAILED;
    case "service_unavailable":
      return MARKETPLACE_API_ERROR_CODES.SERVICE_UNAVAILABLE;
    default:
      return fallback;
  }
}

// ============================================================
// 返回类型
// ============================================================

export interface MarketplaceResult {
  dataset: MarketplaceDataset;
  contractVersion: string;
  source: "fixture" | "api";
}

// ============================================================
// HTTP 工具
// ============================================================

/** 构造请求 headers（带 Authorization Bearer） */
function buildHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** 安全解析 JSON 响应体 */
async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 统一解析 Codex 响应：处理 HTTP 状态码与 { success, error, code } 错误体，
 * 成功时返回原始 body（含 contractVersion 校验）。
 */
async function parseCodexResponse<T>(
  response: Response,
  fallbackCode: string,
  fallbackMsg: string,
): Promise<T> {
  // 401/403/404 直接按 HTTP 状态码抛错（UI 依赖 UNAUTHENTICATED/NOT_FOUND 分支）
  if (response.status === 401) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问市场。",
    );
  }
  if (response.status === 403) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.FORBIDDEN,
      "无访问权限。",
    );
  }
  if (response.status === 404) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.NOT_FOUND,
      "未找到该资源。",
    );
  }

  const body = (await parseJsonSafely(response)) as
    | (T & { success?: boolean; contractVersion?: string; error?: string; code?: string })
    | null;

  if (!response.ok) {
    const code = mapCodexCode(body?.code, fallbackCode);
    const msg = body?.error || fallbackMsg;
    throw new MarketplaceApiError(code, `${msg}（${response.status}）`);
  }
  if (!body || body.success === false) {
    const code = mapCodexCode(body?.code, fallbackCode);
    const msg = body?.error || fallbackMsg;
    throw new MarketplaceApiError(code, msg);
  }
  if (body.contractVersion && body.contractVersion !== CONTRACT_VERSION) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.CONTRACT_MISMATCH,
      `市场契约版本不匹配：${body.contractVersion}`,
    );
  }
  return body as T;
}

// ============================================================
// DTO 映射函数
// ============================================================

/** 默认授权要约（Codex 列表未返回 offer 时使用） */
const DEFAULT_LICENSE_OFFER: LicenseOffer = {
  id: "",
  type: "free",
  commercialScope: "platform_free",
  modificationScope: "not_allowed",
  territory: [],
  durationDays: null,
  price: null,
  currency: null,
};

/** 默认创建者（Codex Asset 未暴露 ownerId 时使用） */
function defaultCreator(asset: CodexAssetDTO): Creator {
  const fromMeta = asset.metadata?.creator as Partial<Creator> | undefined;
  if (fromMeta && typeof fromMeta.id === "string" && typeof fromMeta.name === "string") {
    return {
      id: fromMeta.id,
      name: fromMeta.name,
      worksCount: typeof fromMeta.worksCount === "number" ? fromMeta.worksCount : 0,
      usageCount: typeof fromMeta.usageCount === "number" ? fromMeta.usageCount : 0,
      bio: fromMeta.bio,
    };
  }
  return {
    id: asset.actorId || asset.projectId || "",
    name: "未知创建者",
    worksCount: 0,
    usageCount: 0,
  };
}

/** Codex kind → TRAE type 映射（actorId 非空时推断为 ai_actor） */
function mapCodexKindToType(kind: CodexAssetKind, actorId: string | null): MarketplaceAssetType {
  if (actorId) return "ai_actor";
  switch (kind) {
    case "character":
      return "character";
    case "scene":
      return "scene";
    case "prop":
      return "prop";
    case "style":
      return "style_pack";
    case "universe_package":
      return "universe_setting";
    default:
      return "character";
  }
}

/** Codex rightsState → TRAE rightsStatus 映射 */
function mapRightsStateToStatus(rightsState: CodexRightsState | null): RightsStatus {
  switch (rightsState) {
    case "portrait_confirmed":
      return "confirmed";
    case "portrait_pending":
      return "unconfirmed";
    case "ai_generated":
    default:
      return "not_applicable";
  }
}

/** Codex rightsState → TRAE portraitBased 映射（包含 "portrait" → true） */
function mapRightsStateToPortraitBased(rightsState: CodexRightsState | null): boolean {
  if (!rightsState) return false;
  return rightsState.includes("portrait");
}

/** Codex license template → TRAE LicenseType 映射 */
function mapTemplateToLicenseType(template: CodexLicenseTemplate): LicenseType {
  switch (template) {
    case "platform_free":
      return "free";
    case "non_commercial":
      return "non_commercial";
    case "single_project":
      return "single_project_commercial";
    case "team_internal":
      return "team_internal";
    case "commercial":
      return "single_project_commercial";
    case "custom":
      return "custom";
    default:
      return "custom";
  }
}

/** Codex terms.modificationAllowed → TRAE ModificationScope 映射 */
function mapModificationAllowed(modificationAllowed?: boolean): ModificationScope {
  if (modificationAllowed === true) return "allowed";
  return "not_allowed";
}

/**
 * Codex Asset → MarketplaceAsset 映射。
 *
 * Codex 返回扁平结构，TRAE 期望市场面向结构。
 * 缺失字段从 metadata 派生或填默认值。versions 可选（fetchAssetById 时传入）。
 */
export function mapCodexAssetToMarketplaceAsset(
  asset: CodexAssetDTO,
  versions?: CodexAssetVersionDTO[],
): MarketplaceAsset {
  const meta = asset.metadata || {};
  const rightsStatus = mapRightsStateToStatus(asset.rightsState);
  const portraitBased = mapRightsStateToPortraitBased(asset.rightsState);

  // 主版本：优先从 currentVersionId + versions 派生
  const mainVersion = deriveMainVersion(asset, versions || []);

  // 授权要约：从 metadata.licenseOffer 派生，否则用默认 free
  const licenseOffer = deriveLicenseOffer(meta);

  // 来源证据：从 metadata.evidence 派生，否则默认 pending
  const sourceEvidence = deriveSourceEvidence(meta);

  return {
    id: asset.id,
    name: asset.name,
    type: mapCodexKindToType(asset.kind, asset.actorId),
    thumbnail: typeof meta.thumbnail === "string" ? meta.thumbnail : (mainVersion.preview || ""),
    creator: defaultCreator(asset),
    description: typeof meta.description === "string" ? meta.description : "",
    tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
    allowedUses: Array.isArray(meta.allowedUses) ? (meta.allowedUses as string[]) : [],
    forbiddenUses: Array.isArray(meta.forbiddenUses) ? (meta.forbiddenUses as string[]) : [],
    visibility: (typeof meta.visibility === "string" ? meta.visibility : "private") as Visibility,
    status: asset.status,
    licenseOffer,
    sourceEvidence,
    portraitBased,
    rightsStatus,
    mainVersion,
    usageCount: typeof meta.usageCount === "number" ? meta.usageCount : 0,
    rating: typeof meta.rating === "number" ? meta.rating : 0,
    recommended: false,
    createdAt: asset.createdAt,
  };
}

/** 从 currentVersionId + versions 派生主版本预览 */
function deriveMainVersion(
  asset: CodexAssetDTO,
  versions: CodexAssetVersionDTO[],
): AssetMainVersion {
  if (versions.length > 0) {
    const current =
      asset.currentVersionId
        ? versions.find((v) => v.id === asset.currentVersionId)
        : null;
    const target = current || versions[0];
    return {
      id: target.id,
      preview: target.previewUrl || "",
      createdAt: target.createdAt,
    };
  }
  return {
    id: asset.currentVersionId || "",
    preview: "",
    createdAt: asset.createdAt,
  };
}

/** 从 metadata.licenseOffer 派生授权要约，否则返回默认 free */
function deriveLicenseOffer(meta: Record<string, unknown>): LicenseOffer {
  const fromMeta = meta.licenseOffer as Partial<LicenseOffer> | undefined;
  if (fromMeta && typeof fromMeta.id === "string" && typeof fromMeta.type === "string") {
    return {
      id: fromMeta.id,
      type: fromMeta.type as LicenseType,
      commercialScope: fromMeta.commercialScope || "platform_free",
      modificationScope: fromMeta.modificationScope || "not_allowed",
      territory: Array.isArray(fromMeta.territory) ? fromMeta.territory : [],
      durationDays: fromMeta.durationDays ?? null,
      price: fromMeta.price ?? null,
      currency: fromMeta.currency ?? null,
    };
  }
  return { ...DEFAULT_LICENSE_OFFER };
}

/** 从 metadata.evidence 派生来源证据，否则默认 pending */
function deriveSourceEvidence(meta: Record<string, unknown>): SourceEvidence {
  const fromMeta = meta.evidence as Partial<SourceEvidence> | undefined;
  if (fromMeta && typeof fromMeta.status === "string") {
    return {
      status: fromMeta.status as SourceEvidence["status"],
      verifiedAt: fromMeta.verifiedAt ?? null,
    };
  }
  return { status: "pending", verifiedAt: null };
}

/**
 * Codex LicenseOffer → TRAE LicenseOffer 映射。
 *
 * template → type，terms.scope → commercialScope，
 * terms.modificationAllowed → modificationScope，
 * priceCents → price，currency → currency。
 */
export function mapCodexOfferToLicenseOffer(offer: CodexLicenseOfferDTO): LicenseOffer {
  const terms = offer.terms;
  return {
    id: offer.id,
    type: mapTemplateToLicenseType(offer.template),
    commercialScope: (terms.scope || "platform_free") as CommercialScope,
    modificationScope: mapModificationAllowed(terms.modificationAllowed),
    territory: Array.isArray(terms.territory) ? terms.territory : [],
    durationDays: terms.durationDays ?? null,
    price: offer.priceCents || null,
    currency: offer.currency || null,
  };
}

/**
 * Codex UsageGrant → TRAE UsageGrant 映射。
 *
 * createdAt → grantedAt，targetProjectId → projectId，
 * projectName 留空（Codex 不返回，UI 层显示 ID 或额外查询）。
 */
export function mapCodexGrantToUsageGrant(grant: CodexUsageGrantDTO): UsageGrant {
  return {
    id: grant.id,
    assetId: grant.assetId,
    assetVersionId: grant.assetVersionId,
    offerId: grant.offerId,
    projectId: grant.targetProjectId || grant.projectId,
    projectName: "",
    status: grant.status as UsageGrant["status"],
    grantedAt: grant.createdAt,
    expiresAt: grant.expiresAt,
  };
}

// ============================================================
// 统计与发布流程选项构造
// ============================================================

/** 从资产列表计算市场统计 */
function computeStats(assets: MarketplaceAsset[]): MarketplaceStats {
  const stats: MarketplaceStats = {
    totalAssets: assets.length,
    byType: {
      ai_actor: 0,
      character: 0,
      scene: 0,
      prop: 0,
      style_pack: 0,
      universe_setting: 0,
    },
    byStatus: {
      draft: 0,
      ready: 0,
      published: 0,
      suspended: 0,
      archived: 0,
    },
    byLicenseType: {
      free: 0,
      non_commercial: 0,
      single_project_commercial: 0,
      time_limited: 0,
      team_internal: 0,
      custom: 0,
    },
  };
  for (const asset of assets) {
    stats.byType[asset.type]++;
    stats.byStatus[asset.status]++;
    stats.byLicenseType[asset.licenseOffer.type]++;
  }
  return stats;
}

/** 构造默认发布流程选项（Codex 无对应端点，客户端用 filtering.ts 标签构造） */
function buildDefaultPublishFlow(): PublishFlowOptions {
  return {
    assetTypes: ALL_ASSET_TYPES.map((value) => ({
      value,
      labelZh: ASSET_TYPE_LABELS_ZH[value],
      labelEn: ASSET_TYPE_LABELS_EN[value],
    })),
    licenseTypes: ALL_LICENSE_TYPES.map((value) => ({
      value,
      labelZh: LICENSE_TYPE_LABELS_ZH[value],
      labelEn: LICENSE_TYPE_LABELS_EN[value],
      paid: value !== "free" && value !== "non_commercial",
    })),
    visibilities: [
      { value: "public" as Visibility, labelZh: "公开", labelEn: "Public" },
      { value: "private" as Visibility, labelZh: "私有", labelEn: "Private" },
      { value: "team" as Visibility, labelZh: "团队", labelEn: "Team" },
    ],
  };
}

// ============================================================
// 错误判断（UI 依赖）
// ============================================================

/** 是否为未登录错误（UI 据此切换到登录提示态） */
export function isUnauthenticatedError(err: unknown): boolean {
  if (err instanceof MarketplaceApiError) {
    return err.code === MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED;
  }
  if (err instanceof Error) {
    return err.message.includes("未登录") || err.message.includes("unauthenticated");
  }
  return false;
}

// ============================================================
// 读操作
// ============================================================

/**
 * 拉取市场完整数据集（资产列表 + 统计 + 发布流程选项）。
 * fixture 模式不依赖 accessToken；真实模式需要有效 token。
 *
 * 真实模式：GET /api/v2/assets?status=published
 * Codex 返回 { success, contractVersion, items: [Asset] }，
 * 适配层映射到 MarketplaceDataset（assets + stats + publishFlow）。
 */
export async function fetchMarketplace(
  accessToken: string | null,
  options: MarketplaceFetchOptions = {},
): Promise<MarketplaceResult> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const dataset = loadFixtureDataset();
    const version = fixtureContractVersion();
    if (version !== CONTRACT_VERSION) {
      throw new MarketplaceApiError(
        MARKETPLACE_API_ERROR_CODES.CONTRACT_MISMATCH,
        `市场契约版本不匹配：fixture=${version}, client=${CONTRACT_VERSION}`,
      );
    }
    return { dataset, contractVersion: version, source: "fixture" };
  }

  return fetchMarketplaceFromApi(accessToken, options);
}

/** 真实 API 调用（导出便于测试直接覆盖，绕过 USE_FIXTURE） */
export async function fetchMarketplaceFromApi(
  accessToken: string | null,
  options: MarketplaceFetchOptions = {},
): Promise<MarketplaceResult> {
  if (!accessToken) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问市场。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const qs = new URLSearchParams({ status: "published" });
  const response = await fetchImpl(`${ASSETS_API_BASE}?${qs.toString()}`, {
    method: "GET",
    headers: buildHeaders(accessToken),
    credentials: "same-origin",
  });
  const payload = await parseCodexResponse<{
    items: CodexAssetDTO[];
  }>(response, MARKETPLACE_API_ERROR_CODES.MARKETPLACE_FETCH_FAILED, "加载市场数据失败。");

  const assets = (payload.items || []).map((a) => mapCodexAssetToMarketplaceAsset(a));
  const dataset: MarketplaceDataset = {
    contractVersion: CONTRACT_VERSION,
    assets,
    licenseOffers: [],
    usageGrants: [],
    creators: [],
    publishFlow: buildDefaultPublishFlow(),
    stats: computeStats(assets),
  };
  return { dataset, contractVersion: CONTRACT_VERSION, source: "api" };
}

/**
 * 按 ID 拉取单个资产详情（含版本列表）。
 *
 * 真实模式：GET /api/v2/assets/[assetId]
 * Codex 返回 { success, contractVersion, asset: { ...Asset, versions: [AssetVersion] } }，
 * 适配层映射到 MarketplaceAsset。
 */
export async function fetchAssetById(
  id: string,
  accessToken: string | null,
  options: MarketplaceFetchOptions = {},
): Promise<{ asset: MarketplaceAsset; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    const asset = loadFixtureAssetById(id);
    if (!asset) {
      throw new MarketplaceApiError(
        MARKETPLACE_API_ERROR_CODES.NOT_FOUND,
        "未找到该资产。",
      );
    }
    return { asset, source: "fixture" };
  }

  return fetchAssetByIdFromApi(id, accessToken, options);
}

/** 真实 API 调用（导出便于测试直接覆盖） */
export async function fetchAssetByIdFromApi(
  id: string,
  accessToken: string | null,
  options: MarketplaceFetchOptions = {},
): Promise<{ asset: MarketplaceAsset; source: "fixture" | "api" }> {
  if (!accessToken) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问市场。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(
    `${ASSETS_API_BASE}/${encodeURIComponent(id)}`,
    {
      method: "GET",
      headers: buildHeaders(accessToken),
      credentials: "same-origin",
    },
  );
  const payload = await parseCodexResponse<{
    asset: CodexAssetDTO & { versions?: CodexAssetVersionDTO[] };
  }>(response, MARKETPLACE_API_ERROR_CODES.MARKETPLACE_FETCH_FAILED, "加载资产详情失败。");

  const assetDto = payload.asset;
  const versions = assetDto.versions || [];
  const asset = mapCodexAssetToMarketplaceAsset(assetDto, versions);
  return { asset, source: "api" };
}

/**
 * 拉取当前用户的使用授权记录。
 *
 * 真实模式：GET /api/v2/marketplace/grants?status=active
 * Codex 返回 { success, contractVersion, items: [UsageGrant] }。
 */
export async function fetchUsageGrants(
  accessToken: string | null,
  options: MarketplaceFetchOptions = {},
): Promise<{ grants: UsageGrant[]; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 60));
    const dataset = loadFixtureDataset();
    return { grants: dataset.usageGrants, source: "fixture" };
  }

  return fetchUsageGrantsFromApi(accessToken, options);
}

/** 真实 API 调用（导出便于测试直接覆盖） */
export async function fetchUsageGrantsFromApi(
  accessToken: string | null,
  options: MarketplaceFetchOptions = {},
): Promise<{ grants: UsageGrant[]; source: "fixture" | "api" }> {
  if (!accessToken) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问市场。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(GRANTS_API_BASE, {
    method: "GET",
    headers: buildHeaders(accessToken),
    credentials: "same-origin",
  });
  const payload = await parseCodexResponse<{
    items: CodexUsageGrantDTO[];
  }>(response, MARKETPLACE_API_ERROR_CODES.MARKETPLACE_FETCH_FAILED, "加载使用授权记录失败。");

  const grants = (payload.items || []).map(mapCodexGrantToUsageGrant);
  return { grants, source: "api" };
}

// ============================================================
// 写操作（完整链路：发布 → 授权要约 → 授权 → 调用 → 撤销）
// ============================================================

/**
 * 发布资产（创建资产身份，发布流程第一步）。
 *
 * POST /api/v2/assets
 * body: { kind, name, projectId?, actorId?, rightsState?, metadata? }
 * 返回：{ success, contractVersion, asset: Asset }
 */
export async function publishAsset(
  accessToken: string | null,
  input: PublishAssetInput,
  options: MarketplaceFetchOptions = {},
): Promise<{ asset: CodexAssetDTO; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    const asset: CodexAssetDTO = {
      id: `ast-fixture-${Date.now()}`,
      kind: input.kind,
      name: input.name,
      status: "draft",
      currentVersionId: null,
      createdAt: new Date().toISOString(),
      actorId: input.actorId || null,
      rightsState: input.rightsState || "ai_generated",
      projectId: input.projectId || null,
      metadata: input.metadata || {},
    };
    return { asset, source: "fixture" };
  }
  return publishAssetFromApi(accessToken, input, options);
}

/** 真实 API 调用（导出便于测试直接覆盖，绕过 USE_FIXTURE） */
export async function publishAssetFromApi(
  accessToken: string | null,
  input: PublishAssetInput,
  options: MarketplaceFetchOptions = {},
): Promise<{ asset: CodexAssetDTO; source: "fixture" | "api" }> {
  if (!accessToken) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再发布资产。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(ASSETS_API_BASE, {
    method: "POST",
    headers: buildHeaders(accessToken),
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  const payload = await parseCodexResponse<{
    asset: CodexAssetDTO;
  }>(response, MARKETPLACE_API_ERROR_CODES.MARKETPLACE_FETCH_FAILED, "发布资产失败。");
  return { asset: payload.asset, source: "api" };
}

/**
 * 创建授权要约（发布流程第二步）。
 *
 * POST /api/v2/assets/[assetId]/license-offers
 * body: { assetVersionId, template, terms, priceCents?, currency? }
 * 返回：{ success, contractVersion, offer: LicenseOffer }（201 状态码）
 *
 * 肖像保护：rightsState 非 portrait_confirmed 时 Codex 服务端返回 403 forbidden，
 * 客户端通过 parseCodexResponse 透传错误。
 */
export async function createLicenseOffer(
  accessToken: string | null,
  assetId: string,
  input: CreateLicenseOfferInput,
  options: MarketplaceFetchOptions = {},
): Promise<{ offer: LicenseOffer; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const offer: LicenseOffer = {
      id: `ofr-fixture-${Date.now()}`,
      type: mapTemplateToLicenseType(input.template),
      commercialScope: (input.terms.scope || "platform_free") as CommercialScope,
      modificationScope: mapModificationAllowed(input.terms.modificationAllowed),
      territory: Array.isArray(input.terms.territory) ? input.terms.territory : [],
      durationDays: input.terms.durationDays ?? null,
      price: input.priceCents || null,
      currency: input.currency || null,
    };
    return { offer, source: "fixture" };
  }
  return createLicenseOfferFromApi(accessToken, assetId, input, options);
}

/** 真实 API 调用（导出便于测试直接覆盖，绕过 USE_FIXTURE） */
export async function createLicenseOfferFromApi(
  accessToken: string | null,
  assetId: string,
  input: CreateLicenseOfferInput,
  options: MarketplaceFetchOptions = {},
): Promise<{ offer: LicenseOffer; source: "fixture" | "api" }> {
  if (!accessToken) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再创建授权要约。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(
    `${ASSETS_API_BASE}/${encodeURIComponent(assetId)}/license-offers`,
    {
      method: "POST",
      headers: buildHeaders(accessToken),
      credentials: "same-origin",
      body: JSON.stringify(input),
    },
  );
  const payload = await parseCodexResponse<{
    offer: CodexLicenseOfferDTO;
  }>(response, MARKETPLACE_API_ERROR_CODES.MARKETPLACE_FETCH_FAILED, "创建授权要约失败。");
  return { offer: mapCodexOfferToLicenseOffer(payload.offer), source: "api" };
}

/**
 * 发起使用授权（授权流程第一步）。
 *
 * POST /api/v2/marketplace/grants
 * body: { offerId, targetProjectId, expiresAt? }
 * 返回：{ success, contractVersion, grant: UsageGrant }（201 状态码）
 */
export async function createUsageGrant(
  accessToken: string | null,
  offerId: string,
  targetProjectId: string,
  expiresAt?: string | null,
  options: MarketplaceFetchOptions = {},
): Promise<{ grant: UsageGrant; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const grant: UsageGrant = {
      id: `grt-fixture-${Date.now()}`,
      assetId: "",
      assetVersionId: "",
      offerId,
      projectId: targetProjectId,
      projectName: "",
      status: "pending",
      grantedAt: new Date().toISOString(),
      expiresAt: expiresAt || null,
    };
    return { grant, source: "fixture" };
  }
  return createUsageGrantFromApi(accessToken, offerId, targetProjectId, expiresAt, options);
}

/** 真实 API 调用（导出便于测试直接覆盖，绕过 USE_FIXTURE） */
export async function createUsageGrantFromApi(
  accessToken: string | null,
  offerId: string,
  targetProjectId: string,
  expiresAt?: string | null,
  options: MarketplaceFetchOptions = {},
): Promise<{ grant: UsageGrant; source: "fixture" | "api" }> {
  if (!accessToken) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再发起授权。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const body: Record<string, unknown> = { offerId, targetProjectId };
  if (expiresAt) body.expiresAt = expiresAt;
  const response = await fetchImpl(GRANTS_API_BASE, {
    method: "POST",
    headers: buildHeaders(accessToken),
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const payload = await parseCodexResponse<{
    grant: CodexUsageGrantDTO;
  }>(response, MARKETPLACE_API_ERROR_CODES.MARKETPLACE_FETCH_FAILED, "发起授权失败。");
  return { grant: mapCodexGrantToUsageGrant(payload.grant), source: "api" };
}

/**
 * 调用资产到目标项目（创建项目级副本）。
 *
 * POST /api/v2/marketplace/grants/[grantId]/invoke
 * 无 body
 * 返回：{ success, contractVersion, grant: UsageGrant, copy: { id, copyAssetId, targetProjectId } }
 */
export async function invokeUsageGrant(
  accessToken: string | null,
  grantId: string,
  options: MarketplaceFetchOptions = {},
): Promise<{
  grant: UsageGrant;
  copy: { id: string; copyAssetId: string; targetProjectId: string };
  source: "fixture" | "api";
}> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      grant: {
        id: grantId,
        assetId: "",
        assetVersionId: "",
        offerId: "",
        projectId: "",
        projectName: "",
        status: "active",
        grantedAt: new Date().toISOString(),
        expiresAt: null,
      },
      copy: {
        id: `cpy-fixture-${Date.now()}`,
        copyAssetId: `ast-copy-${Date.now()}`,
        targetProjectId: "",
      },
      source: "fixture",
    };
  }
  return invokeUsageGrantFromApi(accessToken, grantId, options);
}

/** 真实 API 调用（导出便于测试直接覆盖，绕过 USE_FIXTURE） */
export async function invokeUsageGrantFromApi(
  accessToken: string | null,
  grantId: string,
  options: MarketplaceFetchOptions = {},
): Promise<{
  grant: UsageGrant;
  copy: { id: string; copyAssetId: string; targetProjectId: string };
  source: "fixture" | "api";
}> {
  if (!accessToken) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再调用资产。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(
    `${GRANTS_API_BASE}/${encodeURIComponent(grantId)}/invoke`,
    {
      method: "POST",
      headers: buildHeaders(accessToken),
      credentials: "same-origin",
    },
  );
  const payload = await parseCodexResponse<{
    grant: CodexUsageGrantDTO;
    copy: { id: string; copyAssetId: string; targetProjectId: string };
  }>(response, MARKETPLACE_API_ERROR_CODES.MARKETPLACE_FETCH_FAILED, "调用资产失败。");
  return {
    grant: mapCodexGrantToUsageGrant(payload.grant),
    copy: payload.copy,
    source: "api",
  };
}

/**
 * 撤销使用授权（停止新调用，已有副本保留）。
 *
 * PATCH /api/v2/marketplace/grants/[grantId]/revoke
 * body: { reason? }
 * 返回：{ success, contractVersion, grant: UsageGrant, preservedCopyCount: number }
 */
export async function revokeUsageGrant(
  accessToken: string | null,
  grantId: string,
  reason?: string,
  options: MarketplaceFetchOptions = {},
): Promise<{
  grant: UsageGrant;
  preservedCopyCount: number;
  source: "fixture" | "api";
}> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      grant: {
        id: grantId,
        assetId: "",
        assetVersionId: "",
        offerId: "",
        projectId: "",
        projectName: "",
        status: "revoked_for_new_use",
        grantedAt: new Date().toISOString(),
        expiresAt: null,
      },
      preservedCopyCount: 0,
      source: "fixture",
    };
  }
  return revokeUsageGrantFromApi(accessToken, grantId, reason, options);
}

/** 真实 API 调用（导出便于测试直接覆盖，绕过 USE_FIXTURE） */
export async function revokeUsageGrantFromApi(
  accessToken: string | null,
  grantId: string,
  reason?: string,
  options: MarketplaceFetchOptions = {},
): Promise<{
  grant: UsageGrant;
  preservedCopyCount: number;
  source: "fixture" | "api";
}> {
  if (!accessToken) {
    throw new MarketplaceApiError(
      MARKETPLACE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再撤销授权。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const body: Record<string, unknown> = {};
  if (reason) body.reason = reason;
  const response = await fetchImpl(
    `${GRANTS_API_BASE}/${encodeURIComponent(grantId)}/revoke`,
    {
      method: "PATCH",
      headers: buildHeaders(accessToken),
      credentials: "same-origin",
      body: JSON.stringify(body),
    },
  );
  const payload = await parseCodexResponse<{
    grant: CodexUsageGrantDTO;
    preservedCopyCount: number;
  }>(response, MARKETPLACE_API_ERROR_CODES.MARKETPLACE_FETCH_FAILED, "撤销授权失败。");
  return {
    grant: mapCodexGrantToUsageGrant(payload.grant),
    preservedCopyCount: Number(payload.preservedCopyCount || 0),
    source: "api",
  };
}
