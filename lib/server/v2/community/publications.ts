/**
 * KIIKIS 2.1 Phase 5 — 发布服务 (Task 5.1, CM-001/002/005)
 *
 * CM-001: publication 与源资源分离 (隐藏不删除源)
 * CM-005: 对象页明确来源/owner/许可状态/允许动作
 */
import {
  parsePublication,
  validateCreatePublication,
  CommunityValidationError,
  type CreatePublicationInput,
  type Publication,
  type PublicationRow,
} from "../../../contracts/v2/community.ts";

export type CommunityFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export class CommunityServiceError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "validation_failed"
    | "idempotent_skip"
    | "service_unavailable";
  readonly status: number;
  readonly cause?: unknown;
  /** Phase 0 Task 0.5：每条服务错误附带 correlationId 便于前端/日志追踪 */
  readonly correlationId: string;

  constructor(
    code: CommunityServiceError["code"],
    message: string,
    status: number,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    this.name = "CommunityServiceError";
    this.code = code;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
    this.correlationId = generateCorrelationId();
  }
}

/**
 * Phase 0 Task 0.5：生成短 correlationId（8 位 hex），用于错误响应追踪。
 * 优先用 crypto.randomUUID，降级用时间戳+随机数。
 */
function generateCorrelationId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID().slice(0, 8);
    }
  } catch {
    /* fall through */
  }
  return Date.now().toString(16).slice(-4) + Math.random().toString(16).slice(2, 6);
}

/**
 * Phase 0 Task 0.5：识别 PostgREST/Postgres schema 错误（未知列/未知表）。
 * 这类错误不得被掩盖成"服务不可用"伪降级，必须暴露真实类别。
 */
export function isSchemaError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return (
    text.includes("PGRST204") ||
    text.includes("42703") ||
    text.includes("42P01") ||
    text.includes("PGRST205") ||
    text.includes("Could not find the column") ||
    text.includes("Could not find the table")
  );
}

/**
 * CM-001: 创建 publication (服务端注入 publisherId)
 */
export async function createPublication(
  fetcher: CommunityFetcher,
  input: CreatePublicationInput,
): Promise<Publication> {
  let validated: CreatePublicationInput;
  try {
    validated = validateCreatePublication(input);
  } catch (err) {
    if (err instanceof CommunityValidationError) {
      throw new CommunityServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  const row = await fetcher<PublicationRow>(
    `/rest/v1/rpc/create_publication`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_source_type: validated.sourceType,
        p_source_id: validated.sourceId,
        p_source_version: validated.sourceVersion ?? null,
        p_title: validated.title,
        p_summary: validated.summary ?? "",
        p_cover_url: validated.coverUrl ?? null,
        p_visibility: validated.visibility ?? "public",
        p_invite_token_hash: validated.inviteTokenHash ?? null,
        p_idempotency_key: validated.idempotencyKey,
        p_subject_type: validated.subjectType ?? null,
        p_source_workbench: validated.sourceWorkbench ?? null,
        p_rights_summary: validated.rightsSummary ?? null,
        p_contribution_summary: validated.contributionSummary ?? null,
        p_work_id: validated.workId ?? null,
        p_universe_id: validated.universeId ?? null,
      }),
    },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to create publication", 503, err);
  });

  return parsePublication(row);
}

/**
 * 获取 publication 详情 (CM-005)
 */
export async function getPublication(
  fetcher: CommunityFetcher,
  publicationId: string,
): Promise<Publication | null> {
  if (!publicationId) {
    throw new CommunityServiceError("validation_failed", "publicationId is required", 400);
  }
  const row = await fetcher<PublicationRow | null>(
    `/rest/v1/storyflow_publications?id=eq.${encodeURIComponent(publicationId)}&limit=1`,
    { headers: { Accept: "application/vnd.pgrst.object+json" } },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 406) return null;
    throw new CommunityServiceError("service_unavailable", "failed to fetch publication", 503, err);
  });
  return row ? parsePublication(row) : null;
}

/**
 * 列出 publisher 的 publications
 */
export async function listPublicationsByPublisher(
  fetcher: CommunityFetcher,
  publisherId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<Publication[]> {
  if (!publisherId) {
    throw new CommunityServiceError("unauthenticated", "publisherId is required", 401);
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await fetcher<PublicationRow[]>(
    `/rest/v1/storyflow_publications?publisher_id=eq.${encodeURIComponent(publisherId)}&order=created_at.desc&limit=${limit}&offset=${offset}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to list publications", 503, err);
  });

  return (rows ?? []).map(parsePublication);
}

/**
 * CM-008: 隐藏 publication (只改 visibility, 不删除源)
 */
export async function hidePublication(
  fetcher: CommunityFetcher,
  publicationId: string,
  reason?: string,
): Promise<Publication> {
  if (!publicationId) {
    throw new CommunityServiceError("validation_failed", "publicationId is required", 400);
  }
  const row = await fetcher<PublicationRow>(
    `/rest/v1/rpc/hide_publication`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_publication_id: publicationId,
        p_reason: reason ?? null,
      }),
    },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 404) {
      throw new CommunityServiceError("not_found", `publication ${publicationId} not found`, 404, err);
    }
    throw new CommunityServiceError("service_unavailable", "failed to hide publication", 503, err);
  });
  return parsePublication(row);
}

/**
 * 恢复 publication
 */
export async function restorePublication(
  fetcher: CommunityFetcher,
  publicationId: string,
  reason?: string,
): Promise<Publication> {
  if (!publicationId) {
    throw new CommunityServiceError("validation_failed", "publicationId is required", 400);
  }
  const row = await fetcher<PublicationRow>(
    `/rest/v1/rpc/restore_publication`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_publication_id: publicationId,
        p_reason: reason ?? null,
      }),
    },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to restore publication", 503, err);
  });
  return parsePublication(row);
}
