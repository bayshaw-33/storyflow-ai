// Kiikis 2.0 短剧流 API 适配器（K2-I-03 端到端接线）。
//
// 默认走 fixture 兜底（NEXT_PUBLIC_USE_SHORT_DRAMA_FIXTURE !== "false" 时），
// 显式设置 NEXT_PUBLIC_USE_SHORT_DRAMA_FIXTURE=false 切换到真实 Codex API。
//
// 真实 API 模式聚合 C-03/C-04 端点：
// - GET  /api/v2/projects/[projectId]/universe/snapshot       → 继承快照（含 Universe 实体）
// - POST /api/v2/projects/[projectId]/universe/bind            → 绑定 Universe（顺带生成首份快照）
// - POST /api/v2/projects/[projectId]/universe/snapshot        → 阶段确认时生成新快照
// - GET  /api/v2/projects/[projectId]/universe/snapshot/diff   → 检查 Universe 是否有新变更
// - POST /api/v2/universes/[universeId]/proposals/batch        → 批量提交回流候选
//
// 错误处理：解析 Codex 的 { success:false, error, code }，抛出带 code 的 ShortDramaApiError。
// 模式对齐 lib/client/v2/universe/api.ts（I-01）与 lib/client/v2/jobs/api.ts（I-02）。

import { loadShortDramaFixture, type ShortDramaFixtureName } from "./fixtures.ts";
import { buildScriptCandidatesFromSnapshot } from "./flow-machine.ts";
import {
  CONTRACT_VERSION,
  type InheritanceSnapshotBundle,
  type ProposalSubmitInput,
  type ShortDramaData,
  type SnapshotDiffResult,
} from "./types.ts";
// ChangeProposalStatus 直接从契约导入（types.ts 仅 import 未 re-export）。
import type { ChangeProposalStatus } from "../../../contracts/v2/index.ts";

// 全局开关：环境变量 NEXT_PUBLIC_USE_SHORT_DRAMA_FIXTURE 控制。
// fail-closed（Phase 6 Task 6.2）：production 恒 false；development/preview
// 需显式 "true" 才走 fixture，否则走真实 API。
import { isFixtureEnabled } from "../runtime-mode.ts";

export const USE_FIXTURE = isFixtureEnabled("NEXT_PUBLIC_USE_SHORT_DRAMA_FIXTURE", process.env);

// Codex v2 API 基础路径。
const PROJECT_UNIVERSE_API = "/api/v2/projects";
const UNIVERSE_PROPOSALS_API = "/api/v2/universes";

// 自定义 fetch 注入接口（测试用）。
export interface ShortDramaApiOptions {
  fetchImpl?: typeof fetch;
  // fixture 预览模式：指定用哪份 fixture，默认 "short-drama"。
  fixture?: ShortDramaFixtureName;
}

// ============ Codex API 原始 DTO（适配层内部使用，不对外暴露） ============

// C-03 bind 响应。
interface CodexBindResponse {
  success: true;
  contractVersion: string;
  binding: {
    link: {
      id: string;
      projectId: string;
      universeId: string;
      role: string;
      settings: Record<string, unknown>;
      boundAt: string;
      unboundAt: string | null;
    };
    created: boolean;
  };
  snapshot: InheritanceSnapshotBundle;
}

// C-03 snapshot GET/POST 响应。
interface CodexSnapshotResponse {
  success: true;
  contractVersion: string;
  snapshot: InheritanceSnapshotBundle;
}

// C-03 diff 响应。
interface CodexDiffResponse {
  success: true;
  contractVersion: string;
  snapshot: InheritanceSnapshotBundle;
  fields: Array<{ path: string; before: unknown; after: unknown; impact: "added" | "changed" | "removed" }>;
  upgradeRequired: boolean;
  impacts: Array<{ path: string; reason: string }>;
}

// C-04 proposals/batch 响应（对齐 createProposalBatch 返回）。
interface CodexProposalItem {
  id: string;
  universeId: string;
  sourceProjectId: string;
  sourceStep: string;
  status: ChangeProposalStatus;
  confidence: number;
  fieldDiffs: Array<{ path: string; before: unknown; after: unknown }>;
  sourceReference?: { kind: "text" | "asset" | "decision"; label: string };
  createdAt: string;
  // ProposalDto 扩展字段
  originalText?: string;
  sourceAssetId?: string | null;
  suggestedAction?: string;
  idempotencyKey?: string;
}
interface CodexProposalsBatchResponse {
  success: true;
  contractVersion: string;
  items: CodexProposalItem[];
  createdCount: number;
}

// Codex 错误响应结构。
interface CodexErrorResponse {
  success: false;
  error: string;
  code: string;
}

// 带有 envelope 字段的响应体（parseCodexResponse 内部用）。
type CodexEnvelope = {
  success?: boolean;
  contractVersion?: string;
  error?: string;
  code?: string;
};

// ============ 错误类型 ============

// 短剧流 API 错误码（适配 Codex code 并保留 UI 依赖的 UNAUTHENTICATED）。
export const SHORT_DRAMA_API_ERROR_CODES = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  SHORT_DRAMA_FETCH_FAILED: "SHORT_DRAMA_FETCH_FAILED",
  SHORT_DRAMA_CONTRACT_MISMATCH: "SHORT_DRAMA_CONTRACT_MISMATCH",
} as const;

export class ShortDramaApiError extends Error {
  code: string;
  readonly httpStatus?: number;
  constructor(code: string, message: string, httpStatus?: number) {
    super(message);
    this.name = "ShortDramaApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// 把 Codex 错误 code 映射到 TRAE 侧错误码。
function mapCodexCode(codexCode: string | undefined, fallback: string): string {
  switch (codexCode) {
    case "unauthenticated":
      return SHORT_DRAMA_API_ERROR_CODES.UNAUTHENTICATED;
    case "forbidden":
      return SHORT_DRAMA_API_ERROR_CODES.FORBIDDEN;
    case "not_found":
      return SHORT_DRAMA_API_ERROR_CODES.NOT_FOUND;
    case "validation_failed":
      return SHORT_DRAMA_API_ERROR_CODES.VALIDATION_FAILED;
    case "service_unavailable":
      return SHORT_DRAMA_API_ERROR_CODES.SERVICE_UNAVAILABLE;
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
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.UNAUTHENTICATED,
      "登录已过期，请重新登录。",
      401,
    );
  }
  if (res.status === 403) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.FORBIDDEN,
      "无访问权限。",
      403,
    );
  }
  if (res.status === 404) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.NOT_FOUND,
      "项目或快照不存在。",
      404,
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
    throw new ShortDramaApiError(code, `${msg}（${res.status}）`, res.status);
  }
  if (!body || body.success === false) {
    const code = mapCodexCode(body?.code, fallbackCode);
    const msg = body?.error || fallbackMsg;
    throw new ShortDramaApiError(code, msg, res.status);
  }
  if (body.contractVersion && body.contractVersion !== CONTRACT_VERSION) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.SHORT_DRAMA_CONTRACT_MISMATCH,
      `契约版本不匹配：${body.contractVersion}`,
      res.status,
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

// ============ 拉取短剧流聚合数据 ============

/**
 * 拉取短剧流聚合数据：USE_FIXTURE=true 时走 fixture，否则走真实 API。
 *
 * 真实模式聚合：
 * 1. GET /api/v2/projects/[projectId]/universe/snapshot 获取继承快照（含 Universe 实体）
 * 2. 把快照 payload.entities 映射到 stages.script.analysis（角色/场景/道具候选）
 * 3. 设置 universeBinding.bound=true，universeId 从 snapshot 派生
 * 4. 初始阶段状态：script=current，其余 locked（新项目从剧本开始）
 *
 * 注意：真实模式假设项目已绑定 Universe。若未绑定（GET snapshot 抛 not_found），
 * 错误向上抛出，UI 据此引导用户先调用 bindProjectUniverse。
 */
export async function fetchShortDramaFlow(
  accessToken: string | null,
  projectId: string,
  options: ShortDramaApiOptions = {},
): Promise<ShortDramaData> {
  if (USE_FIXTURE) {
    return loadShortDramaFixture(options.fixture || "short-drama");
  }
  return fetchShortDramaFlowFromApi(accessToken, projectId, options);
}

// 真实 API 调用：导出便于测试直接覆盖（绕过 USE_FIXTURE）。
export async function fetchShortDramaFlowFromApi(
  accessToken: string | null,
  projectId: string,
  options: ShortDramaApiOptions = {},
): Promise<ShortDramaData> {
  if (!accessToken) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再查看短剧流。",
    );
  }
  if (!projectId) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.VALIDATION_FAILED,
      "缺少 projectId。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const id = encodeURIComponent(projectId);
  const headers = authHeaders(accessToken);

  const res = await fetchImpl(
    `${PROJECT_UNIVERSE_API}/${id}/universe/snapshot`,
    { headers, credentials: "same-origin" },
  );
  const data = await parseCodexResponse<CodexSnapshotResponse>(
    res,
    SHORT_DRAMA_API_ERROR_CODES.SHORT_DRAMA_FETCH_FAILED,
    "短剧流加载失败。",
  );

  return mapSnapshotToShortDramaData(projectId, data.snapshot, data.contractVersion);
}

// 把继承快照映射为初始 ShortDramaData（新项目从剧本开始）。
function mapSnapshotToShortDramaData(
  projectId: string,
  snapshot: InheritanceSnapshotBundle,
  contractVersion: string,
): ShortDramaData {
  // 从快照 payload.entities 提取角色/场景/道具候选。
  const analysis = buildScriptCandidatesFromSnapshot(snapshot);
  const now = new Date().toISOString();
  return {
    contractVersion: contractVersion || CONTRACT_VERSION,
    project: {
      id: projectId,
      // 真实 API 模式下未获取项目标题，用占位文案；UI 层可后续调用项目详情覆盖。
      title: `项目 ${projectId}`,
      workflowType: "drama",
      currentStage: "script",
      lastSavedAt: now,
    },
    universeBinding: {
      bound: true,
      universeId: snapshot.universeId,
    },
    stages: {
      // 剧本阶段为 current：候选来自继承快照，等用户确认。
      script: {
        status: "current",
        script: "",
        analysis,
        confirmed: {
          characterIds: [],
          sceneIds: [],
          propIds: [],
        },
      },
      // 其余阶段锁定：新项目从剧本开始，未解锁。
      art: { status: "locked", assets: [], pendingConfirm: [] },
      storyboard: { status: "locked", frames: [] },
      video: { status: "locked", shots: [] },
      export: { status: "locked", packages: [] },
    },
    // 初始无资产流动记录与回流候选（阶段未推进）。
    assetFlow: [],
    proposals: [],
    recoveryPoint: {
      stage: "script",
      confirmedAssets: {
        characterIds: [],
        sceneIds: [],
        propIds: [],
      },
      lastSavedAt: now,
    },
  };
}

// ============ 项目绑定 Universe ============

// bindProjectUniverse 返回结构。
export interface BindProjectUniverseResult {
  binding: {
    link: CodexBindResponse["binding"]["link"];
    created: boolean;
  };
  snapshot: InheritanceSnapshotBundle;
}

/**
 * 绑定项目到 Universe：调用 POST /api/v2/projects/[projectId]/universe/bind。
 * Codex 在 bind 同时会顺带生成首份继承快照，一并返回。
 */
export async function bindProjectUniverse(
  accessToken: string | null,
  projectId: string,
  universeId: string,
  options: ShortDramaApiOptions = {},
): Promise<BindProjectUniverseResult> {
  if (!accessToken) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再绑定 Universe。",
    );
  }
  if (!projectId || !universeId) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.VALIDATION_FAILED,
      "缺少 projectId 或 universeId。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const id = encodeURIComponent(projectId);
  const res = await fetchImpl(
    `${PROJECT_UNIVERSE_API}/${id}/universe/bind`,
    {
      method: "POST",
      headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ universeId }),
    },
  );
  const data = await parseCodexResponse<CodexBindResponse>(
    res,
    SHORT_DRAMA_API_ERROR_CODES.SHORT_DRAMA_FETCH_FAILED,
    "绑定 Universe 失败。",
  );
  return { binding: data.binding, snapshot: data.snapshot };
}

// ============ 创建继承快照 ============

/**
 * 创建新的继承快照：调用 POST /api/v2/projects/[projectId]/universe/snapshot。
 * 用于阶段确认时生成新快照（固化当前 Universe 状态作为下一阶段的继承基线）。
 */
export async function createSnapshot(
  accessToken: string | null,
  projectId: string,
  options: ShortDramaApiOptions = {},
): Promise<InheritanceSnapshotBundle> {
  if (!accessToken) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再创建快照。",
    );
  }
  if (!projectId) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.VALIDATION_FAILED,
      "缺少 projectId。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const id = encodeURIComponent(projectId);
  const res = await fetchImpl(
    `${PROJECT_UNIVERSE_API}/${id}/universe/snapshot`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      credentials: "same-origin",
    },
  );
  const data = await parseCodexResponse<CodexSnapshotResponse>(
    res,
    SHORT_DRAMA_API_ERROR_CODES.SHORT_DRAMA_FETCH_FAILED,
    "创建快照失败。",
  );
  return data.snapshot;
}

// ============ 快照 diff ============

/**
 * 检查 Universe 是否有新变更：调用 GET /api/v2/projects/[projectId]/universe/snapshot/diff。
 * 返回 diff 结果：upgradeRequired=true 表示 Universe 已变化，项目应重新生成快照。
 */
export async function diffSnapshot(
  accessToken: string | null,
  projectId: string,
  options: ShortDramaApiOptions = {},
): Promise<SnapshotDiffResult> {
  if (!accessToken) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再检查快照差异。",
    );
  }
  if (!projectId) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.VALIDATION_FAILED,
      "缺少 projectId。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const id = encodeURIComponent(projectId);
  const res = await fetchImpl(
    `${PROJECT_UNIVERSE_API}/${id}/universe/snapshot/diff`,
    { headers: authHeaders(accessToken), credentials: "same-origin" },
  );
  const data = await parseCodexResponse<CodexDiffResponse>(
    res,
    SHORT_DRAMA_API_ERROR_CODES.SHORT_DRAMA_FETCH_FAILED,
    "快照差异检查失败。",
  );
  return {
    snapshot: data.snapshot,
    fields: data.fields,
    upgradeRequired: data.upgradeRequired,
    impacts: data.impacts,
  };
}

// ============ 提交回流候选 ============

// submitProposalsToUniverse 返回结构。
export interface SubmitProposalsResult {
  // Codex 返回的候选条目（含 id 与 status）。
  items: CodexProposalItem[];
  // 实际新创建的数量（去重后）。
  createdCount: number;
}

/**
 * 批量提交回流候选到 Universe：调用 POST /api/v2/universes/[universeId]/proposals/batch。
 *
 * 重要：提交的是 Change Proposal 候选（status=draft/pending_review），
 * 不自动改写 Canon。Universe Inbox 审核通过后才会落库为 Canon 实体。
 *
 * @param inputs 由 buildExportAndSubmitPayload 生成的 ProposalSubmitInput 列表。
 */
export async function submitProposalsToUniverse(
  accessToken: string | null,
  universeId: string,
  inputs: ProposalSubmitInput[],
  options: ShortDramaApiOptions = {},
): Promise<SubmitProposalsResult> {
  if (!accessToken) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再提交回流候选。",
    );
  }
  if (!universeId) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.VALIDATION_FAILED,
      "缺少 universeId。",
    );
  }
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new ShortDramaApiError(
      SHORT_DRAMA_API_ERROR_CODES.VALIDATION_FAILED,
      "缺少回流候选 inputs。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const id = encodeURIComponent(universeId);
  const res = await fetchImpl(
    `${UNIVERSE_PROPOSALS_API}/${id}/proposals/batch`,
    {
      method: "POST",
      headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ inputs, action: "create" }),
    },
  );
  const data = await parseCodexResponse<CodexProposalsBatchResponse>(
    res,
    SHORT_DRAMA_API_ERROR_CODES.SHORT_DRAMA_FETCH_FAILED,
    "提交回流候选失败。",
  );
  return {
    items: data.items || [],
    createdCount: typeof data.createdCount === "number" ? data.createdCount : 0,
  };
}

// ============ 工具函数 ============

// 判断是否未登录错误（UI 据此切换到登录提示态）。
export function isUnauthenticatedError(err: unknown): boolean {
  return (
    err instanceof ShortDramaApiError &&
    err.code === SHORT_DRAMA_API_ERROR_CODES.UNAUTHENTICATED
  );
}

// 判断是否未找到错误（项目/快照不存在，UI 据此引导绑定 Universe）。
export function isNotFoundError(err: unknown): boolean {
  return (
    err instanceof ShortDramaApiError &&
    err.code === SHORT_DRAMA_API_ERROR_CODES.NOT_FOUND
  );
}
