/**
 * KIIKIS V2.2 Screenplay Studio client API — Phase 3 Task 3.3/3.4/3.5.
 * Thin fetch wrappers over /api/v2/works/[workId]/screenplay/*.
 * No local fake success: every call surfaces real service errors.
 */

import type { ScreenplayUnitType } from "../../../contracts/v2/screenplay-studio.ts";
import type { TrilogyStage, TrilogyState } from "../../../contracts/v2/screenplay-trilogy.ts";
import { fetchScreenplayStudio } from "./auth.ts";

export interface ScreenplayUnitClientDto {
  id: string;
  workId: string;
  type: ScreenplayUnitType;
  parentId: string | null;
  order: number;
  title: string;
  readiness: string;
  currentVersionId: string | null;
  finalizedVersionId: string | null;
  legacyId: string | null;
}

export interface StaleEdgeDto {
  edgeId: string;
  upstreamUnitId: string;
  downstreamUnitId: string;
  referencedVersionId: string;
}

export interface KkMessageDto {
  id: string;
  role: string;
  content: string;
}

export interface KkCandidateDto {
  id: string;
  status: string;
  patches: Array<{ unitPath: string; before: string; after: string }>;
}

export class ScreenplayStudioApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly currentVersionId?: string;
  readonly requestId?: string;
  constructor(code: string, message: string, status: number, currentVersionId?: string, requestId?: string) {
    super(message);
    this.name = "ScreenplayStudioApiError";
    this.code = code;
    this.status = status;
    if (currentVersionId) this.currentVersionId = currentVersionId;
    if (requestId) this.requestId = requestId;
  }

  /** Chinese, user-actionable guidance mapped from the safe server code. */
  get userMessage(): string {
    return clientErrorMessage(this.code, this.message);
  }
}

/** Safe server codes → 中文用户提示（服务端只回码，不回原始 PostgREST 细节）。 */
export function clientErrorMessage(code: string, fallback: string): string {
  switch (code) {
    case "schema_not_deployed":
      return "数据库结构尚未部署，请联系管理员或稍后重试。";
    case "service_unavailable":
      return "服务暂时不可用，请稍后重试。";
    case "unauthenticated":
      return "登录状态已失效，请重新登录。";
    case "provider_failed":
      return "AI 服务暂时不可用，你的输入已保留，请重试。";
    case "forbidden":
      return "没有访问该内容的权限。";
    case "not_found":
      return "内容不存在或已被移动。";
    case "conflict":
      return "内容已被其他端更新，请刷新后重试。";
    case "validation_failed":
      return "请求参数有误，请调整后重试。";
    case "rate_limited":
      return "操作过于频繁，请稍后重试。";
    case "retired_novel":
      return "该旧小说项目已下线。";
    default:
      return fallback || "请求失败，请重试。";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchScreenplayStudio(path, init);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || body.success === false) {
    throw new ScreenplayStudioApiError(
      String(body.code ?? "service_unavailable"),
      String(body.error ?? `Request failed (${response.status}).`),
      response.status,
      body.currentVersionId ? String(body.currentVersionId) : undefined,
      body.requestId ? String(body.requestId) : undefined,
    );
  }
  return body as T;
}

export const screenplayStudioApi = {
  listUnits(workId: string) {
    return call<{ units: ScreenplayUnitClientDto[] }>(`/api/v2/works/${encodeURIComponent(workId)}/screenplay`);
  },
  getUnit(workId: string, unitId: string) {
    return call<{ unit: ScreenplayUnitClientDto; content: unknown }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/units/${encodeURIComponent(unitId)}`,
    );
  },
  createUnit(workId: string, body: { type: string; title: string; parentId: string | null; order: number }) {
    return call<{ unit: ScreenplayUnitClientDto }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/units`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  generateNextTrilogyStage(workId: string, body: { conversationId: string; idempotencyKey: string; projectId?: string | null }) {
    return call<{
      stage: TrilogyStage;
      unit: ScreenplayUnitClientDto;
      version: { id: string };
      nextState: TrilogyState;
    }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/trilogy`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  saveUnitContent(
    workId: string,
    unitId: string,
    body: { content: Record<string, unknown>; baseVersionId: string | null; references?: Array<{ unitId: string | null; unitVersionId: string | null }>; sourceMessageIds?: string[]; idempotencyKey?: string },
  ) {
    return call<{ version: { id: string } }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/units/${encodeURIComponent(unitId)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  updateUnitIdentity(workId: string, unitId: string, body: { title?: string; order?: number; parentId?: string | null }) {
    return call<{ unit: ScreenplayUnitClientDto }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/units/${encodeURIComponent(unitId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
  },
  finalizeUnit(workId: string, unitId: string, versionId: string) {
    return call<{ unit: ScreenplayUnitClientDto }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/units/${encodeURIComponent(unitId)}`,
      { method: "PUT", body: JSON.stringify({ versionId }) },
    );
  },
  listStale(workId: string) {
    return call<{ stale: StaleEdgeDto[] }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/dependencies`,
    );
  },
  recomputeStale(workId: string) {
    return call<{ staleCount: number }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/dependencies`,
      { method: "POST", body: JSON.stringify({ action: "recompute" }) },
    );
  },
  resolveStale(workId: string, body: { upstreamUnitId: string; downstreamUnitId: string; resolution: string; note?: string }) {
    return call<{ resolved: boolean; action: string }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/dependencies`,
      { method: "POST", body: JSON.stringify({ action: "resolve", ...body }) },
    );
  },
  /** 会话历史（刷新恢复）。404/空线程 → 空列表。 */
  async listMessages(workId: string, conversationId: string): Promise<KkMessageDto[]> {
    try {
      const { messages } = await call<{ messages: KkMessageDto[] }>(
        `/api/v2/works/${encodeURIComponent(workId)}/screenplay/discuss?conversationId=${encodeURIComponent(conversationId)}`,
      );
      return messages ?? [];
    } catch (error) {
      if (error instanceof ScreenplayStudioApiError && (error.status === 404 || error.code === "not_found")) return [];
      throw error;
    }
  },
  discuss(workId: string, body: { conversationId: string; userMessage: string; purpose?: "discuss" | "similarity_review"; clientContext?: string; idempotencyKey?: string }) {
    return call<{ userMessage: KkMessageDto; assistantMessage: KkMessageDto }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/discuss`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  proposeChange(workId: string, body: { conversationId: string; userMessage: string; scope?: { kind: string; unitId?: string }; clientContext?: string; baseVersionId?: string; idempotencyKey?: string }) {
    return call<{ candidate: KkCandidateDto; snapshotId: string }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/propose-change`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  applyCandidate(workId: string, body: { candidateId: string; acceptedPatchIndexes: number[] }) {
    return call<{ applied: boolean; version: { id: string; kind: string } }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/propose-change`,
      { method: "PUT", body: JSON.stringify(body) },
    );
  },
  rejectCandidate(workId: string, body: { candidateId: string }) {
    return call<{ status: string }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/propose-change`,
      { method: "DELETE", body: JSON.stringify(body) },
    );
  },
};
