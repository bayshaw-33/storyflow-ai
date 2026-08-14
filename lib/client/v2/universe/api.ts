// Kiikis 2.0 Universe API 适配器
// 默认走 fixture 兜底（NEXT_PUBLIC_USE_UNIVERSE_FIXTURE !== "false" 时），
// 显式设置 NEXT_PUBLIC_USE_UNIVERSE_FIXTURE=false 切换到真实 Codex API。
// 真实 API 模式下聚合 4 个端点（详情+entities+works+health）并映射到 UniverseBundleV2。

import { loadUniverseFixture, type UniverseFixtureName } from "./fixtures.ts";
import {
  CONTRACT_VERSION,
  type UniverseBundleV2,
  type UniverseInfo,
  type UniverseHealthSummary,
  type CharacterAsset,
  type LocationAsset,
  type OrganizationAsset,
  type PropAsset,
  type ConceptAsset,
  type WorldRule,
  type WorkLink,
  type ChangeProposalEntry,
  type UniverseObjectStatus,
  type WorkInheritanceStateV22,
  type WorkInheritanceManifestV22,
  type InheritanceDiffResultV22,
  type AdoptResultV22,
  type ContextPacketV22,
  type BindWorkToUniverseInput,
  type AdoptDiffsInput,
  type UniverseVersionSummaryV22,
} from "./types.ts";

// 全局开关：环境变量 NEXT_PUBLIC_USE_UNIVERSE_FIXTURE 控制。
// 未设置或非 "false" 时走 fixture（默认，UI 可独立预览全部 9 个交付物）；
// 显式 "false" 走真实 Codex API。
export const USE_FIXTURE = process.env.NEXT_PUBLIC_USE_UNIVERSE_FIXTURE !== "false";

// Codex v2 API 基础路径。
const API_PATH = "/api/v2/universes";

export interface FetchUniverseBundleOptions {
  // fixture 预览模式：指定用哪份 fixture，默认 "universe"。
  fixture?: UniverseFixtureName;
  // 自定义 fetch（测试注入用）。
  fetchImpl?: typeof fetch;
}

// ============ Codex API 原始 DTO（适配层内部使用，不对外暴露） ============

// Codex universe 详情端点返回结构。
interface CodexUniverseDetailResponse {
  success: boolean;
  contractVersion: string;
  universe: {
    id: string;
    name: string;
    summary: string;
    status: UniverseObjectStatus;
    visibility: "private" | "team" | "shared";
    currentVersion: string;
    updatedAt: string;
  };
  bible?: {
    summary?: string;
    genre?: string;
    tags?: string[];
  };
}

// Codex entity kind 枚举。
type CodexEntityKind =
  | "character"
  | "location"
  | "organization"
  | "object"
  | "rule"
  | "concept";

// Codex entities 端点返回结构。
interface CodexEntity {
  id: string;
  universeId: string;
  kind: CodexEntityKind;
  name: string;
  summary: string;
  status: UniverseObjectStatus;
  updatedAt: string;
}
interface CodexEntitiesResponse {
  success: boolean;
  contractVersion: string;
  items: CodexEntity[];
}

// Codex works 端点返回结构。
interface CodexWorkItem {
  id: string;
  name: string;
  contentType: string;
  productionStage: string;
  universeId: string;
  updatedAt: string;
}
interface CodexWorksResponse {
  success: boolean;
  contractVersion: string;
  items: CodexWorkItem[];
}

// Codex health 维度 key 枚举。
type CodexHealthKey =
  | "canon_completeness"
  | "character_completeness"
  | "relationship_timeline_completeness"
  | "asset_coverage"
  | "pending_proposals"
  | "conflicts_and_stale_snapshots";

// Codex health 端点返回结构（todos 为待办事项文本数组）。
interface CodexHealthDimension {
  key: CodexHealthKey;
  label: string;
  todos: string[];
}
interface CodexHealthResponse {
  success: boolean;
  contractVersion: string;
  dimensions: CodexHealthDimension[];
}

// Codex proposals 端点返回结构（字段对齐 lib/contracts/v2 ChangeProposal）。
interface CodexProposalItem {
  id: string;
  universeId?: string;
  sourceProjectId?: string;
  sourceStep?: string;
  status?: ChangeProposalEntry["status"];
  confidence?: number;
  fieldDiffs?: Array<{ path: string; before: unknown; after: unknown }>;
  sourceReference?: { kind: "text" | "asset" | "decision"; label: string };
  createdAt?: string;
}
interface CodexProposalsResponse {
  success: boolean;
  contractVersion: string;
  items: CodexProposalItem[];
}

// Codex 错误响应结构。
interface CodexErrorResponse {
  success: false;
  error: string;
  code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "validation_failed"
    | "service_unavailable";
}

// 带有 envelope 字段的响应体（parseCodexResponse 内部用）。
type CodexEnvelope = {
  success?: boolean;
  contractVersion?: string;
  error?: string;
  code?: string;
};

// ============ 错误类型 ============

// Universe API 错误码（适配 Codex code 并保留 UI 依赖的 UNAUTHENTICATED）。
export const UNIVERSE_API_ERROR_CODES = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  UNIVERSE_FETCH_FAILED: "UNIVERSE_FETCH_FAILED",
  UNIVERSE_CONTRACT_MISMATCH: "UNIVERSE_CONTRACT_MISMATCH",
} as const;

export class UniverseApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "UniverseApiError";
    this.code = code;
  }
}

// 把 Codex 错误 code 映射到 TRAE 侧错误码。
function mapCodexCode(codexCode: string | undefined, fallback: string): string {
  switch (codexCode) {
    case "unauthenticated":
      return UNIVERSE_API_ERROR_CODES.UNAUTHENTICATED;
    case "forbidden":
      return UNIVERSE_API_ERROR_CODES.FORBIDDEN;
    case "not_found":
      return UNIVERSE_API_ERROR_CODES.NOT_FOUND;
    case "validation_failed":
      return UNIVERSE_API_ERROR_CODES.VALIDATION_FAILED;
    case "service_unavailable":
      return UNIVERSE_API_ERROR_CODES.SERVICE_UNAVAILABLE;
    default:
      return fallback;
  }
}

// 统一解析 Codex 响应：处理 HTTP 状态码与 { success, error, code } 错误体，
// 成功时返回原始 body（含 contractVersion 校验）。
async function parseCodexResponse<T>(
  res: Response,
  fallbackCode: string,
  fallbackMsg: string,
): Promise<T> {
  // 401/403/404 直接按 HTTP 状态码抛错（UI 依赖 UNAUTHENTICATED/NOT_FOUND 分支）。
  if (res.status === 401) {
    throw new UniverseApiError(
      UNIVERSE_API_ERROR_CODES.UNAUTHENTICATED,
      "登录已过期，请重新登录。",
    );
  }
  if (res.status === 403) {
    throw new UniverseApiError(
      UNIVERSE_API_ERROR_CODES.FORBIDDEN,
      "无访问权限。",
    );
  }
  if (res.status === 404) {
    throw new UniverseApiError(
      UNIVERSE_API_ERROR_CODES.NOT_FOUND,
      "宇宙不存在或无访问权限。",
    );
  }
  // 解析 body（错误体与成功体结构不同，统一以 envelope 读取）。
  let body: (T & CodexEnvelope) | null = null;
  try {
    body = (await res.json()) as T & CodexEnvelope;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const code = mapCodexCode(body?.code, fallbackCode);
    const msg = body?.error || fallbackMsg;
    throw new UniverseApiError(code, `${msg}（${res.status}）`);
  }
  if (!body || body.success === false) {
    const code = mapCodexCode(body?.code, fallbackCode);
    const msg = body?.error || fallbackMsg;
    throw new UniverseApiError(code, msg);
  }
  if (body.contractVersion && body.contractVersion !== CONTRACT_VERSION) {
    throw new UniverseApiError(
      UNIVERSE_API_ERROR_CODES.UNIVERSE_CONTRACT_MISMATCH,
      `契约版本不匹配：${body.contractVersion}`,
    );
  }
  return body as T;
}

// 构造请求 headers（带 Authorization Bearer）。
function authHeaders(accessToken: string | null): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken ?? ""}`,
    Accept: "application/json",
  };
}

// ============ bundle 拉取 ============

// 拉取 Universe bundle：USE_FIXTURE=true 时走 fixture，否则走真实 API。
export async function fetchUniverseBundle(
  universeId: string,
  accessToken: string | null,
  options: FetchUniverseBundleOptions = {},
): Promise<UniverseBundleV2> {
  if (USE_FIXTURE) {
    const fixtureName = options.fixture || "universe";
    return loadUniverseFixture(fixtureName);
  }
  return fetchUniverseBundleFromApi(universeId, accessToken, options);
}

// 真实 API 调用：并行请求详情、entities、works、health 四个端点，
// 聚合后映射到 TRAE 的 UniverseBundleV2。导出便于测试直接覆盖（绕过 USE_FIXTURE）。
export async function fetchUniverseBundleFromApi(
  universeId: string,
  accessToken: string | null,
  options: FetchUniverseBundleOptions = {},
): Promise<UniverseBundleV2> {
  if (!accessToken) {
    throw new UniverseApiError(
      UNIVERSE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再查看宇宙。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const id = encodeURIComponent(universeId);
  const headers = authHeaders(accessToken);

  // 并行请求 4 个端点：详情、资产、作品、健康度。
  const [detailRes, entitiesRes, worksRes, healthRes] = await Promise.all([
    fetchImpl(`${API_PATH}/${id}`, { headers, credentials: "same-origin" }),
    fetchImpl(`${API_PATH}/${id}/entities`, { headers, credentials: "same-origin" }),
    fetchImpl(`${API_PATH}/${id}/works`, { headers, credentials: "same-origin" }),
    fetchImpl(`${API_PATH}/${id}/health`, { headers, credentials: "same-origin" }),
  ]);

  const detail = await parseCodexResponse<CodexUniverseDetailResponse>(
    detailRes,
    UNIVERSE_API_ERROR_CODES.UNIVERSE_FETCH_FAILED,
    "宇宙详情加载失败。",
  );
  const entities = await parseCodexResponse<CodexEntitiesResponse>(
    entitiesRes,
    UNIVERSE_API_ERROR_CODES.UNIVERSE_FETCH_FAILED,
    "宇宙资产加载失败。",
  );
  const works = await parseCodexResponse<CodexWorksResponse>(
    worksRes,
    UNIVERSE_API_ERROR_CODES.UNIVERSE_FETCH_FAILED,
    "宇宙关联作品加载失败。",
  );
  const health = await parseCodexResponse<CodexHealthResponse>(
    healthRes,
    UNIVERSE_API_ERROR_CODES.UNIVERSE_FETCH_FAILED,
    "宇宙健康度加载失败。",
  );

  return mapCodexToBundle(detail, entities, works, health);
}

// ============ DTO 映射 ============

// 把 Codex 四个端点的返回聚合映射到 UniverseBundleV2。
function mapCodexToBundle(
  detail: CodexUniverseDetailResponse,
  entities: CodexEntitiesResponse,
  works: CodexWorksResponse,
  health: CodexHealthResponse,
): UniverseBundleV2 {
  const grouped = groupEntitiesByKind(entities.items);
  return {
    contractVersion: detail.contractVersion || CONTRACT_VERSION,
    universe: mapUniverseInfo(detail),
    bible: detail.bible ? { ...detail.bible } : undefined,
    healthSummary: mapHealth(health.dimensions),
    rules: grouped.rules,
    characters: grouped.characters,
    locations: grouped.locations,
    organizations: grouped.organizations,
    props: grouped.props,
    concepts: grouped.concepts,
    // 关系/时间线/Canon Fact 有独立端点，bundle 聚合阶段暂留空，
    // 后续可扩展并行拉取 relationships/timeline/canon-facts 端点。
    relationships: [],
    timelineEvents: [],
    canonFacts: [],
    // Inbox 通过 fetchUniverseProposals 单独拉取，bundle 内留空。
    proposals: [],
    works: mapWorks(works.items),
    impactAnalysis: {
      targetCanonId: "",
      affectedWorks: [],
      affectedSnapshots: [],
      affectedAssets: [],
    },
    recentActivity: [],
  };
}

// 详情端点 → UniverseInfo。
function mapUniverseInfo(detail: CodexUniverseDetailResponse): UniverseInfo {
  const u = detail.universe;
  return {
    id: u.id,
    name: u.name,
    summary: u.summary,
    // bible.summary 语义上对应核心前提（corePremise）；缺失时回退空串。
    corePremise: detail.bible?.summary ?? "",
    // Codex 详情未返回 createdAt/owner，用 updatedAt 兜底 createdAt，owner 留空。
    createdAt: u.updatedAt,
    updatedAt: u.updatedAt,
    owner: "",
    status: u.status,
    visibility: u.visibility,
    currentVersion: u.currentVersion,
  };
}

// 把 entity 按 kind 分组并映射到 TRAE 资产结构。
// 注意：Codex entity kind "object" 映射到 TRAE 的 props。
function groupEntitiesByKind(items: CodexEntity[]): {
  rules: WorldRule[];
  characters: CharacterAsset[];
  locations: LocationAsset[];
  organizations: OrganizationAsset[];
  props: PropAsset[];
  concepts: ConceptAsset[];
} {
  const rules: WorldRule[] = [];
  const characters: CharacterAsset[] = [];
  const locations: LocationAsset[] = [];
  const organizations: OrganizationAsset[] = [];
  const props: PropAsset[] = [];
  const concepts: ConceptAsset[] = [];
  for (const e of items) {
    // 共享基础字段：Codex entity 未返回 source/mainVersion/usedBy，填默认值。
    const base = {
      id: e.id,
      name: e.name,
      summary: e.summary,
      status: e.status,
      source: "",
      mainVersion: "",
      usedBy: [] as string[],
    };
    switch (e.kind) {
      case "character":
        characters.push(base as CharacterAsset);
        break;
      case "location":
        locations.push(base as LocationAsset);
        break;
      case "organization":
        organizations.push(base as OrganizationAsset);
        break;
      case "object":
        props.push(base as PropAsset);
        break;
      case "concept":
        concepts.push(base as ConceptAsset);
        break;
      case "rule":
        rules.push(base as WorldRule);
        break;
    }
  }
  return { rules, characters, locations, organizations, props, concepts };
}

// works → WorkLink[]。
// Codex works 端点未返回继承关系，默认 referenced。
function mapWorks(items: CodexWorkItem[]): WorkLink[] {
  return items.map((w) => ({
    id: w.id,
    title: w.name,
    type: w.contentType,
    relationship: "referenced" as const,
  }));
}

// health dimensions → UniverseHealthSummary。
// Codex 的 todos 是定性待办文本数组（空=该维度完整，非空=有待办），
// TRAE 期望 0-1 比例与整数计数，这里采用近似映射：
// - completeness 类：todos 为空 → 1.0，非空 → 0.0
// - pendingProposals：从 todos 文本提取数字（如 "处理 4 条候选变更"），无则 0
// - conflicts：todos 长度（0 或 1）
function mapHealth(dimensions: CodexHealthDimension[]): UniverseHealthSummary {
  const byKey = new Map(dimensions.map((d) => [d.key, d]));
  const completeness = (key: CodexHealthKey): number => {
    const dim = byKey.get(key);
    return dim && dim.todos.length > 0 ? 0 : 1;
  };
  const pendingDim = byKey.get("pending_proposals");
  let pendingProposals = 0;
  if (pendingDim && pendingDim.todos.length > 0) {
    // 从 "处理 N 条候选变更" 提取 N；无法提取时退化为 todos 长度。
    const match = pendingDim.todos[0]?.match(/(\d+)/);
    pendingProposals = match ? Number(match[1]) : pendingDim.todos.length;
  }
  const conflictsDim = byKey.get("conflicts_and_stale_snapshots");
  const conflicts = conflictsDim ? conflictsDim.todos.length : 0;
  return {
    canonCompleteness: completeness("canon_completeness"),
    characterCompleteness: completeness("character_completeness"),
    relationshipTimeline: completeness("relationship_timeline_completeness"),
    assetCoverage: completeness("asset_coverage"),
    pendingProposals,
    conflicts,
  };
}

// ============ Inbox / Canon 操作 ============

// 拉取 Change Proposal 列表（Inbox 数据源）。
export async function fetchUniverseProposals(
  accessToken: string | null,
  universeId: string,
  options: FetchUniverseBundleOptions = {},
): Promise<ChangeProposalEntry[]> {
  if (!accessToken) {
    throw new UniverseApiError(
      UNIVERSE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再查看候选变更。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(
    `${API_PATH}/${encodeURIComponent(universeId)}/proposals`,
    { headers: authHeaders(accessToken), credentials: "same-origin" },
  );
  const data = await parseCodexResponse<CodexProposalsResponse>(
    res,
    UNIVERSE_API_ERROR_CODES.UNIVERSE_FETCH_FAILED,
    "候选变更加载失败。",
  );
  return data.items.map(mapProposal);
}

// Codex ChangeProposal → TRAE ChangeProposalEntry。
function mapProposal(p: CodexProposalItem): ChangeProposalEntry {
  return {
    id: p.id,
    // Codex 未直接给出提案类型，默认 state_change。
    type: "state_change",
    title: p.sourceReference?.label || p.sourceStep || "候选变更",
    sourceProject: p.sourceProjectId ?? "",
    sourceStep: p.sourceStep ?? "",
    originalContent: p.sourceReference?.label ?? "",
    fieldDiff: (p.fieldDiffs ?? []).map((d) => ({
      path: d.path,
      before: d.before,
      after: d.after,
    })),
    confidence: typeof p.confidence === "number" ? p.confidence : 0,
    status: p.status ?? "draft",
    createdAt: p.createdAt ?? "",
    impactSummary: "",
  };
}

// 执行 Canon Check（POST canon/check）。
// 返回 Codex 原始业务结果（去掉 success/contractVersion envelope）。
export async function runCanonCheck(
  accessToken: string | null,
  universeId: string,
  options: FetchUniverseBundleOptions & { input?: Record<string, unknown> } = {},
): Promise<Record<string, unknown>> {
  if (!accessToken) {
    throw new UniverseApiError(
      UNIVERSE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再执行 Canon Check。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(
    `${API_PATH}/${encodeURIComponent(universeId)}/canon/check`,
    {
      method: "POST",
      headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(options.input ?? {}),
    },
  );
  const data = await parseCodexResponse<CodexEnvelope & Record<string, unknown>>(
    res,
    UNIVERSE_API_ERROR_CODES.UNIVERSE_FETCH_FAILED,
    "Canon Check 执行失败。",
  );
  // 去掉 envelope 字段，返回业务结果。
  const { success: _success, contractVersion: _version, ...rest } = data;
  return rest;
}

// 拉取 Canon 影响分析（GET canon/impact?entity=<canonFactId>）。
// 返回 Codex 原始业务结果（去掉 envelope）。
export async function fetchImpactAnalysis(
  accessToken: string | null,
  universeId: string,
  canonFactId: string,
  options: FetchUniverseBundleOptions = {},
): Promise<Record<string, unknown>> {
  if (!accessToken) {
    throw new UniverseApiError(
      UNIVERSE_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再查看影响分析。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const qs = new URLSearchParams({ entity: canonFactId });
  const res = await fetchImpl(
    `${API_PATH}/${encodeURIComponent(universeId)}/canon/impact?${qs.toString()}`,
    { headers: authHeaders(accessToken), credentials: "same-origin" },
  );
  const data = await parseCodexResponse<CodexEnvelope & Record<string, unknown>>(
    res,
    UNIVERSE_API_ERROR_CODES.UNIVERSE_FETCH_FAILED,
    "影响分析加载失败。",
  );
  const { success: _success, contractVersion: _version, ...rest } = data;
  return rest;
}

// ============ 写入操作（保留原有签名，真实 API 路径走 PATCH） ============

// Inbox 写入操作的状态反馈类型（组件层用）。
export type InboxActionKind =
  | "accept"
  | "edit_accept"
  | "reject"
  | "defer";

export interface InboxActionResult {
  proposalId: string;
  action: InboxActionKind;
  success: boolean;
  message: string;
}

// Inbox 操作：USE_FIXTURE 时本地模拟，否则 PATCH proposals/:proposalId。
// 注意：UI 调用未传 accessToken，真实模式依赖同源 session cookie 鉴权。
export async function applyInboxAction(
  universeId: string,
  proposalId: string,
  action: InboxActionKind,
  _editedPayload?: Record<string, unknown>,
  options: FetchUniverseBundleOptions = {},
): Promise<InboxActionResult> {
  if (USE_FIXTURE) {
    // fixture 模式：模拟 200ms 网络延迟，返回成功。
    await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      proposalId,
      action,
      success: true,
      message: "操作已提交（fixture 预览模式，不会真正写入）。",
    };
  }
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(
    `${API_PATH}/${encodeURIComponent(universeId)}/proposals/${encodeURIComponent(proposalId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action }),
    },
  );
  if (!res.ok) {
    return {
      proposalId,
      action,
      success: false,
      message: `操作失败（${res.status}）`,
    };
  }
  return {
    proposalId,
    action,
    success: true,
    message: "操作成功。",
  };
}

// Canon Fact 锁定/解锁：USE_FIXTURE 时本地模拟，否则 PATCH canon-facts/:id/lock。
export async function toggleCanonFactLock(
  universeId: string,
  canonFactId: string,
  locked: boolean,
  options: FetchUniverseBundleOptions = {},
): Promise<{ success: boolean; message: string }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {
      success: true,
      message: locked
        ? "Canon Fact 已锁定（fixture 预览模式）。"
        : "Canon Fact 已解锁（fixture 预览模式）。",
    };
  }
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(
    `${API_PATH}/${encodeURIComponent(universeId)}/canon-facts/${encodeURIComponent(canonFactId)}/lock`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ locked }),
    },
  );
  return {
    success: res.ok,
    message: res.ok ? "操作成功。" : `操作失败（${res.status}）`,
  };
}

// 判断是否未登录错误（UI 据此切换到登录提示态）。
export function isUnauthenticatedError(err: unknown): boolean {
  return (
    err instanceof UniverseApiError &&
    err.code === UNIVERSE_API_ERROR_CODES.UNAUTHENTICATED
  );
}

// ============================================================
// V2.2 Universe Inheritance client API (Phase 2 Task 2.5)
// ============================================================
//
// 这些函数调用 Phase 2 Task 2.2/2.3/2.4 创建的服务端 API routes，
// 返回 camelCase DTO（已剥离 envelope），供 WorkbenchShell 常驻组件使用。
// 所有写操作（bind/adopt）都需要登录态；读操作（diff/context-packet/inheritance）
// 在未登录时抛 UNIVERSE_API_ERROR_CODES.UNAUTHENTICATED。

// V2.2 Works API 基础路径。
const WORKS_API_PATH = "/api/v2/works";

// 解析 V2.2 API 响应 envelope { success, data, error, code }。
// 成功返回 data；失败抛 UniverseApiError。
async function parseV22Envelope<T>(
  res: Response,
  fallbackCode: string,
  fallbackMsg: string,
): Promise<T> {
  if (res.status === 401) {
    throw new UniverseApiError(UNIVERSE_API_ERROR_CODES.UNAUTHENTICATED, "登录已过期，请重新登录。");
  }
  if (res.status === 403) {
    throw new UniverseApiError(UNIVERSE_API_ERROR_CODES.FORBIDDEN, "无访问权限。");
  }
  if (res.status === 404) {
    throw new UniverseApiError(UNIVERSE_API_ERROR_CODES.NOT_FOUND, "资源不存在或无访问权限。");
  }
  let body: { success?: boolean; data?: T; error?: string; code?: string } | null = null;
  try {
    body = (await res.json()) as { success?: boolean; data?: T; error?: string; code?: string };
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success === false) {
    const code = body?.code || fallbackCode;
    const msg = body?.error || fallbackMsg;
    throw new UniverseApiError(code, `${msg}（${res.status}）`);
  }
  return body.data as T;
}

// 把服务端 snake_case manifest 行映射为 camelCase DTO。
function toManifestDto(row: Record<string, unknown>): WorkInheritanceManifestV22 {
  return {
    id: String(row.id),
    workId: String(row.work_id),
    universeId: String(row.universe_id),
    universeVersionId: String(row.universe_version_id),
    universeVersionNo: Number(row.universe_version_no),
    relation: row.relation as WorkInheritanceManifestV22["relation"],
    canonPolicy: row.canon_policy as WorkInheritanceManifestV22["canonPolicy"],
    timelineAnchorId: (row.timeline_anchor_id as string | null) ?? null,
    includedEntityVersionIds: (row.included_entity_version_ids as string[]) ?? [],
    includedFactVersionIds: (row.included_fact_version_ids as string[]) ?? [],
    includedRelationshipVersionIds: (row.included_relationship_version_ids as string[]) ?? [],
    includedTimelineEventVersionIds: (row.included_timeline_event_version_ids as string[]) ?? [],
    includedAssetVersionIds: (row.included_asset_version_ids as string[]) ?? [],
    isActive: Boolean(row.is_active),
    supersededBy: (row.superseded_by as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function toVersionSummary(row: Record<string, unknown>): UniverseVersionSummaryV22 {
  return {
    id: String(row.id),
    universeId: String(row.universe_id),
    versionNo: Number(row.version_no),
    contentHash: String(row.content_hash),
    createdAt: String(row.created_at),
  };
}

// 读取 Work 的继承状态（manifest + 当前版本 + 最新版本 + stale）。
// GET /api/v2/works/:workId/inheritance
export async function fetchWorkInheritanceState(
  workId: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<WorkInheritanceStateV22> {
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(`${WORKS_API_PATH}/${encodeURIComponent(workId)}/inheritance`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  const data = await parseV22Envelope<{
    manifest: WorkInheritanceManifestV22 | null;
    universeVersion: UniverseVersionSummaryV22 | null;
    latestUniverseVersion: UniverseVersionSummaryV22 | null;
    isStale: boolean;
  }>(res, UNIVERSE_API_ERROR_CODES.SERVICE_UNAVAILABLE, "继承状态加载失败。");
  return data;
}

// 绑定 Work 到 Universe（原子操作，创建 manifest + snapshot）。
// POST /api/v2/works/:workId/universe/bind
export async function bindWorkToUniverse(
  workId: string,
  input: BindWorkToUniverseInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<WorkInheritanceManifestV22> {
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(`${WORKS_API_PATH}/${encodeURIComponent(workId)}/universe/bind`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  const data = await parseV22Envelope<Record<string, unknown>>(
    res,
    UNIVERSE_API_ERROR_CODES.VALIDATION_FAILED,
    "Universe 绑定失败。",
  );
  return toManifestDto(data);
}

// 查询 Work 与最新 Universe Version 的对象级 diff + stale 标记。
// GET /api/v2/works/:workId/inheritance/diff
export async function fetchInheritanceDiff(
  workId: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<InheritanceDiffResultV22> {
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(`${WORKS_API_PATH}/${encodeURIComponent(workId)}/inheritance/diff`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  return parseV22Envelope<InheritanceDiffResultV22>(
    res,
    UNIVERSE_API_ERROR_CODES.SERVICE_UNAVAILABLE,
    "继承差异加载失败。",
  );
}

// 逐项采用 diff（产生新 manifest + checkpoint）。
// POST /api/v2/works/:workId/inheritance/adopt
export async function adoptInheritanceDiffs(
  workId: string,
  input: AdoptDiffsInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<AdoptResultV22> {
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(`${WORKS_API_PATH}/${encodeURIComponent(workId)}/inheritance/adopt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  const data = await parseV22Envelope<{ manifest: Record<string, unknown>; idempotent: boolean }>(
    res,
    UNIVERSE_API_ERROR_CODES.VALIDATION_FAILED,
    "采用变更失败。",
  );
  return {
    manifest: toManifestDto(data.manifest),
    idempotent: Boolean(data.idempotent),
  };
}

// 拉取 Work 的 Context Packet（高信号上下文包，来源可见）。
// GET /api/v2/works/:workId/context-packet
export async function fetchContextPacket(
  workId: string,
  options: { fetchImpl?: typeof fetch; workVersionId?: string } = {},
): Promise<ContextPacketV22> {
  const fetchImpl = options.fetchImpl || fetch;
  const qs = options.workVersionId
    ? `?workVersionId=${encodeURIComponent(options.workVersionId)}`
    : "";
  const res = await fetchImpl(
    `${WORKS_API_PATH}/${encodeURIComponent(workId)}/context-packet${qs}`,
    { headers: { Accept: "application/json" }, credentials: "same-origin" },
  );
  return parseV22Envelope<ContextPacketV22>(
    res,
    UNIVERSE_API_ERROR_CODES.SERVICE_UNAVAILABLE,
    "Context Packet 加载失败。",
  );
}
