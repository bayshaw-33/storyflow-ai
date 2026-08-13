"use client";

/**
 * KIIKIS 2.1 Phase 2 — Dynamic Grid Storyboard 浏览器端 client (K21-SB-007, K21-SB-008)
 *
 * 与 StoryboardClient 分离，专门调用 /api/v2/storyboards 端点。
 * 处理 401/409/422 错误，409 时返回结构化冲突信息供 UI 显示 diff。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DynamicGridSceneV1,
  DynamicGridFrameV1,
  DynamicGridContinuityMode,
  DynamicGridCount,
  SpatialPlan,
} from "./dynamic-grid-contract";
import type { StoryboardDiff } from "./dynamic-grid-diff";

/** 当前版本查询结果。 */
export interface CurrentStoryboardPayload {
  storyboard: DynamicGridSceneV1;
  rowId: string;
  revision: number;
  parentId: string | null;
  createdAt: string;
}

/** 列表项。 */
export interface StoryboardListItem {
  storyboard: DynamicGridSceneV1;
  rowId: string;
  revision: number;
  sceneId: string;
  createdAt: string;
}

/** 历史版本项。 */
export interface StoryboardHistoryItem {
  storyboard: DynamicGridSceneV1;
  rowId: string;
  revision: number;
  parentId: string | null;
  revisionSource: "ai" | "user" | "system";
  createdAt: string;
}

/** upsert 成功结果。 */
export interface UpsertSuccessPayload {
  storyboard: DynamicGridSceneV1;
  rowId: string;
  revision: number;
  status: "created" | "revision_added" | "idempotent_skip";
  parentId: string | null;
}

/** upsert 冲突结果 (409)。 */
export interface UpsertConflictPayload {
  kind: "cas_mismatch" | "locked_override" | "not_found";
  currentRevision: number;
  currentStoryboard: DynamicGridSceneV1;
  attemptedStoryboard: DynamicGridSceneV1;
  diff: StoryboardDiff;
  message: string;
}

/** upsert 入参。 */
export interface UpsertStoryboardBody {
  handoffId: string;
  sceneId: string;
  continuityMode: DynamicGridContinuityMode;
  gridCount: DynamicGridCount;
  gridRationale: string;
  spatialPlan: SpatialPlan;
  sharedCinematography: string;
  negativePrompt: string;
  frames: DynamicGridFrameV1[];
  revisionSource: "ai" | "user" | "system";
  expectedRevision: number;
}

export class DynamicGridClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "DynamicGridClientError";
    this.code = code;
    this.status = status;
    if (details) this.details = details;
  }
}

type SessionSupplier = () => Promise<string | null>;

type DynamicGridClientOptions = {
  getSessionToken: SessionSupplier;
  fetchImpl?: typeof fetch;
};

export class DynamicGridClient {
  private readonly getSessionToken: SessionSupplier;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DynamicGridClientOptions) {
    this.getSessionToken = options.getSessionToken;
    this.fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  }

  static fromSupabase(client: SupabaseClient | null): DynamicGridClient {
    const supplier: SessionSupplier = async () => {
      if (!client) return null;
      try {
        const { data } = await client.auth.getSession();
        return data.session?.access_token ?? null;
      } catch {
        return null;
      }
    };
    return new DynamicGridClient({ getSessionToken: supplier });
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getSessionToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await this.fetchImpl(path, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    });

    const text = await response.text();
    let payload: Record<string, unknown> | null = null;
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = null;
      }
    }

    if (response.status === 401) {
      throw new DynamicGridClientError("UNAUTHORIZED", "请先登录后再使用动态分镜功能。", 401);
    }

    if (!response.ok) {
      const code = (payload?.code as string) || "DYNAMIC_GRID_CLIENT_ERROR";
      const message = (payload?.error as string) || `请求失败 (${response.status})。`;
      throw new DynamicGridClientError(code, message, response.status, payload ?? undefined);
    }

    if (!payload || payload.success !== true) {
      throw new DynamicGridClientError(
        "DYNAMIC_GRID_CLIENT_ERROR",
        (payload?.error as string) || "响应缺少 success 字段。",
        response.status,
        payload ?? undefined,
      );
    }

    return payload as unknown as T;
  }

  /** GET /api/v2/storyboards?handoffId= — 列出 handoff 下所有场景当前版本。 */
  async listForHandoff(handoffId: string): Promise<{ items: StoryboardListItem[] }> {
    return this.fetchJson(`/api/v2/storyboards?handoffId=${encodeURIComponent(handoffId)}`);
  }

  /** GET /api/v2/storyboards?handoffId=&sceneId= — 获取特定场景当前版本。 */
  async getCurrent(handoffId: string, sceneId: string): Promise<CurrentStoryboardPayload> {
    const path = `/api/v2/storyboards?handoffId=${encodeURIComponent(handoffId)}&sceneId=${encodeURIComponent(sceneId)}`;
    return this.fetchJson<CurrentStoryboardPayload>(path);
  }

  /** GET /api/v2/storyboards?handoffId=&sceneId=&history=true — 历史版本列表。 */
  async getHistory(handoffId: string, sceneId: string): Promise<{ items: StoryboardHistoryItem[] }> {
    const path = `/api/v2/storyboards?handoffId=${encodeURIComponent(handoffId)}&sceneId=${encodeURIComponent(sceneId)}&history=true`;
    return this.fetchJson<{ items: StoryboardHistoryItem[] }>(path);
  }

  /** GET /api/v2/storyboards/{rowId} — 获取特定版本 (用于 diff)。 */
  async getById(rowId: string): Promise<StoryboardHistoryItem> {
    return this.fetchJson<StoryboardHistoryItem>(`/api/v2/storyboards/${encodeURIComponent(rowId)}`);
  }

  /** GET /api/v2/storyboards/{rowId}?diffAgainst={otherRowId} — 两版本 diff。 */
  async diffVersions(rowId: string, againstRowId: string): Promise<{
    from: StoryboardHistoryItem;
    to: StoryboardHistoryItem;
    diff: StoryboardDiff;
  }> {
    const path = `/api/v2/storyboards/${encodeURIComponent(rowId)}?diffAgainst=${encodeURIComponent(againstRowId)}`;
    return this.fetchJson(path);
  }

  /**
   * POST /api/v2/storyboards — 创建/更新 (CAS)。
   * 成功返回 UpsertSuccessPayload; 冲突 (409) 返回 UpsertConflictPayload (不抛异常)。
   */
  async upsert(body: UpsertStoryboardBody): Promise<UpsertSuccessPayload | UpsertConflictPayload> {
    try {
      const result = await this.fetchJson<UpsertSuccessPayload | UpsertConflictPayload>(
        "/api/v2/storyboards",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      // 409 时 success=false, 但 fetchJson 会抛异常 (因为 !response.ok)
      // 所以这里只会收到 200/201 的成功结果
      return result as UpsertSuccessPayload;
    } catch (err) {
      if (err instanceof DynamicGridClientError && err.status === 409 && err.details) {
        const d = err.details as Record<string, unknown>;
        return {
          kind: (d.code as UpsertConflictPayload["kind"]) ?? "cas_mismatch",
          currentRevision: Number(d.currentRevision ?? 0),
          currentStoryboard: d.currentStoryboard as DynamicGridSceneV1,
          attemptedStoryboard: d.attemptedStoryboard as DynamicGridSceneV1,
          diff: d.diff as StoryboardDiff,
          message: (d.error as string) ?? "Conflict",
        } satisfies UpsertConflictPayload;
      }
      throw err;
    }
  }
}
