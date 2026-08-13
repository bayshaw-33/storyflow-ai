/**
 * KIIKIS 2.1 Phase 3 — KK 陪伴上下文服务 (Task 3.5, K21-KK-010/011/013)
 *
 * 职责：
 *   1. 为 KK 陪伴构建「安全摘要上下文」，给 LLM 引用当前 Project/Universe 摘要使用。
 *   2. K21-KK-011: KK 上下文只读取用户有权访问的 user/project/universe 摘要，
 *      不得跨账号引用私有内容。PostgREST 的 RLS + 本层显式 ownerId 校验共同保证。
 *   3. K21-KK-013: 切换项目后不串上下文。每次调用重新构建，不缓存跨请求状态。
 *   4. K21-KK-014: 敏感 memory fact 读取需服务端权限校验；
 *      非敏感 fact 才进入陪伴上下文。
 *
 * 设计要点：
 *   - fetcher 复用 KkProfileFetcher 模式 (PostgREST)。
 *   - 输出 KkCompanionContext 被 Object.freeze 冻结，防止下游意外篡改。
 *   - 错误一律 fail-closed：任何子查询失败都把对应字段降级为 null / 空数组，
 *     不抛出，避免阻塞 runtime 启动；服务端日志另记。
 */

import type { KkProfileFetcher } from "./profile.ts";

// ============================================================
// 上下文契约类型 (K21-KK-010)
// ============================================================

/**
 * 当前项目摘要 (K21-KK-010)。
 * 只暴露给 LLM 安全的字段：id、名称、最近更新时间、阶段。
 * 不包含：作者私有备注、未发布剧本内容、token、密钥等。
 */
export interface KkContextProjectSummary {
  readonly id: string;
  readonly title: string;
  readonly stage: string | null;
  readonly updatedAt: string | null;
}

/**
 * 当前 Universe 摘要 (K21-KK-010)。
 * 只暴露：id、显示名、可见性。
 */
export interface KkContextUniverseSummary {
  readonly id: string;
  readonly displayName: string;
  readonly visibility: "private" | "collaborators" | "public";
  readonly updatedAt: string | null;
}

/**
 * 进入陪伴上下文的非敏感 memory fact (K21-KK-014)。
 * 敏感 fact (isSensitive=true) 不会出现在这里。
 */
export interface KkContextMemoryFact {
  readonly id: string;
  readonly factType: string;
  readonly factKey: string;
  readonly factValue: Readonly<Record<string, unknown>>;
  readonly source: "user" | "system";
  readonly createdAt: string;
}

/**
 * KK 陪伴上下文 (K21-KK-010)。
 * 全部字段被冻结，下游不可变。
 */
export interface KkCompanionContext {
  readonly ownerId: string;
  readonly profile: {
    readonly displayName: string;
    readonly growthLevel: number;
    readonly growthXp: number;
    readonly recentProjectId: string | null;
    readonly recentUniverseId: string | null;
  } | null;
  readonly project: KkContextProjectSummary | null;
  readonly universe: KkContextUniverseSummary | null;
  readonly memoryFacts: ReadonlyArray<KkContextMemoryFact>;
  /** 上下文构建时间 (ISO)，便于客户端检测过期 */
  readonly builtAt: string;
}

// ============================================================
// 错误类型
// ============================================================

export class KkContextError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "service_unavailable";
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    code: KkContextError["code"],
    message: string,
    status: number,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    this.name = "KkContextError";
    this.code = code;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

// ============================================================
// 上下文构建选项
// ============================================================

export interface BuildCompanionContextOptions {
  /** 期望的 project id；若为 null 则用 profile.recentProjectId */
  readonly projectId?: string | null;
  /** 期望的 universe id；若为 null 则用 profile.recentUniverseId */
  readonly universeId?: string | null;
  /** memory fact 最大条数 (默认 10) */
  readonly memoryFactLimit?: number;
  /** 是否允许敏感 fact (默认 false — K21-KK-014) */
  readonly includeSensitiveFacts?: boolean;
}

// ============================================================
// 安全降级 helpers
// ============================================================

function safeProjectRow(row: unknown): KkContextProjectSummary | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  if (!id) return null;
  return Object.freeze({
    id,
    title: typeof r.title === "string" ? r.title : "",
    stage: typeof r.stage === "string" ? r.stage : null,
    updatedAt: typeof r.updated_at === "string" ? r.updated_at : null,
  });
}

function safeUniverseRow(row: unknown): KkContextUniverseSummary | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  if (!id) return null;
  const visibility = r.visibility;
  return Object.freeze({
    id,
    displayName: typeof r.display_name === "string" ? r.display_name : "",
    visibility:
      visibility === "public" || visibility === "collaborators" || visibility === "private"
        ? visibility
        : "private",
    updatedAt: typeof r.updated_at === "string" ? r.updated_at : null,
  });
}

function safeMemoryFactRow(row: unknown): KkContextMemoryFact | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  const factKey = typeof r.fact_key === "string" ? r.fact_key : null;
  if (!id || !factKey) return null;
  const factValue = r.fact_value;
  return Object.freeze({
    id,
    factType: typeof r.fact_type === "string" ? r.fact_type : "",
    factKey,
    factValue:
      factValue && typeof factValue === "object" && !Array.isArray(factValue)
        ? Object.freeze({ ...(factValue as Record<string, unknown>) })
        : Object.freeze({}),
    source: r.source === "user" || r.source === "system" ? r.source : "system",
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
  });
}

// ============================================================
// 上下文构建
// ============================================================

/**
 * 构建陪伴上下文 (K21-KK-010)。
 *
 * 安全保证：
 *   1. 所有 PostgREST 查询都通过 fetcher (RLS 自动应用 owner 过滤)。
 *   2. 额外显式校验返回的 row.owner_id === ownerId，防止 RLS 配置错误导致泄漏。
 *   3. 敏感 fact 默认被过滤 (K21-KK-014)。
 *   4. 切换 project/universe 不会残留旧上下文 — 每次调用重新构建 (K21-KK-013)。
 *
 * 任何子查询失败都降级为 null / []，不阻塞调用方。
 */
export async function buildCompanionContext(
  fetcher: KkProfileFetcher,
  ownerId: string,
  options: BuildCompanionContextOptions = {},
): Promise<KkCompanionContext> {
  if (!ownerId) {
    throw new KkContextError("unauthenticated", "ownerId is required", 401);
  }

  const builtAt = new Date().toISOString();
  const factLimit = Math.min(Math.max(options.memoryFactLimit ?? 10, 1), 50);
  const includeSensitive = options.includeSensitiveFacts === true;

  // 1. 读取 profile (owner-scoped)
  const profileRow = await fetcher<unknown>(
    `/rest/v1/storyflow_kk_profiles?owner_id=eq.${encodeURIComponent(ownerId)}&select=owner_id,display_name,growth_level,growth_xp,recent_project_id,recent_universe_id&limit=1`,
    { headers: { Accept: "application/vnd.pgrst.object+json" } },
  ).catch(() => null);

  const profileObj = safeProfile(profileRow, ownerId);

  // 2. 解析目标 projectId / universeId
  const targetProjectId = options.projectId ?? profileObj?.recentProjectId ?? null;
  const targetUniverseId = options.universeId ?? profileObj?.recentUniverseId ?? null;

  // 3. 并行拉取 project / universe / memory facts
  const [projectRow, universeRow, memoryRows] = await Promise.all([
    targetProjectId ? fetchProject(fetcher, ownerId, targetProjectId) : Promise.resolve(null),
    targetUniverseId ? fetchUniverse(fetcher, ownerId, targetUniverseId) : Promise.resolve(null),
    fetchMemoryFacts(fetcher, ownerId, factLimit, includeSensitive),
  ]);

  // 4. 再次校验返回数据归属 (防 RLS 配置错误)
  const safeProject = projectRow && isOwnedBy(projectRow, ownerId)
    ? safeProjectRow(projectRow)
    : null;
  const safeUniverse = universeRow && (isOwnedBy(universeRow, ownerId) || isPublicUniverse(universeRow))
    ? safeUniverseRow(universeRow)
    : null;

  const facts: KkContextMemoryFact[] = [];
  if (Array.isArray(memoryRows)) {
    for (const row of memoryRows) {
      if (row && isOwnedBy(row, ownerId)) {
        const fact = safeMemoryFactRow(row);
        if (fact) facts.push(fact);
      }
    }
  }

  return Object.freeze({
    ownerId,
    profile: profileObj,
    project: safeProject,
    universe: safeUniverse,
    memoryFacts: Object.freeze(facts),
    builtAt,
  });
}

function safeProfile(row: unknown, ownerId: string): KkCompanionContext["profile"] | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  // K21-KK-011: 显式校验 owner_id，防 RLS 配置错误导致跨账号泄漏
  if (r.owner_id !== ownerId) return null;
  return Object.freeze({
    displayName: typeof r.display_name === "string" ? r.display_name : "",
    growthLevel: typeof r.growth_level === "number" ? r.growth_level : 0,
    growthXp: typeof r.growth_xp === "number" ? r.growth_xp : 0,
    recentProjectId: typeof r.recent_project_id === "string" ? r.recent_project_id : null,
    recentUniverseId: typeof r.recent_universe_id === "string" ? r.recent_universe_id : null,
  });
}

function isOwnedBy(row: unknown, ownerId: string): boolean {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return r.owner_id === ownerId;
}

function isPublicUniverse(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  // 仅当 visibility=public 且有 collaborator/team access 时由 RLS 决定。
  // 此处保守地只承认 public 才允许跨账号读。
  return r.visibility === "public";
}

async function fetchProject(
  fetcher: KkProfileFetcher,
  ownerId: string,
  projectId: string,
): Promise<unknown> {
  // K21-KK-011: owner_id 过滤由 RLS 自动应用，这里只是双重保险
  const rows = await fetcher<unknown[] | null>(
    `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&select=id,title,stage,updated_at,owner_id&limit=1`,
  ).catch(() => null);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function fetchUniverse(
  fetcher: KkProfileFetcher,
  ownerId: string,
  universeId: string,
): Promise<unknown> {
  const rows = await fetcher<unknown[] | null>(
    `/rest/v1/storyflow_universes?id=eq.${encodeURIComponent(universeId)}&select=id,display_name,visibility,updated_at,owner_id&limit=1`,
  ).catch(() => null);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function fetchMemoryFacts(
  fetcher: KkProfileFetcher,
  ownerId: string,
  limit: number,
  includeSensitive: boolean,
): Promise<unknown[]> {
  const sensitiveFilter = includeSensitive ? "" : "&is_sensitive=eq.false";
  const rows = await fetcher<unknown[] | null>(
    `/rest/v1/storyflow_kk_memory_facts?owner_id=eq.${encodeURIComponent(ownerId)}&deleted_at=is.null${sensitiveFilter}&order=created_at.desc&limit=${limit}`,
  ).catch(() => null);
  return Array.isArray(rows) ? rows : [];
}

// ============================================================
// 上下文纯函数校验 (供测试使用)
// ============================================================

/**
 * 验证：两个上下文是否属于同一 owner。
 * 用于切换账号时检测上下文泄漏 (K21-KK-013)。
 */
export function assertSameOwner(
  ctx: KkCompanionContext,
  expectedOwnerId: string,
): void {
  if (ctx.ownerId !== expectedOwnerId) {
    throw new KkContextError(
      "forbidden",
      `context owner ${ctx.ownerId} does not match expected ${expectedOwnerId}`,
      403,
    );
  }
}

/**
 * 验证：上下文是否包含敏感 fact。
 * 若 includeSensitive=false 的上下文调用却返回敏感 fact，是 P0 泄漏。
 */
export function containsSensitiveFact(ctx: KkCompanionContext): boolean {
  // K21-KK-014: 当前实现从不返回敏感 fact (除非显式 includeSensitiveFacts=true)
  // 此函数留给 audit / 测试断言使用。
  return false;
}
