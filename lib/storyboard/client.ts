"use client";

/**
 * Storyboard browser client.
 *
 * Task card: KIIKIS-P1-TRAE-002 §4
 *
 * One unified entry point for ProductionWorkbench to talk to the storyboard
 * backend. All four Kimi APIs + the state GET/PUT go through this client so
 * error handling (401 / 409 / 422) is centralized and consistent.
 *
 * BLOCKER 3 rule: every call MUST carry projectId + sourceUnitId scope —
 * the server enforces this but we double-check on the client to fail fast.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrevisScene } from "@/lib/director/previs";
import type { PrevisVersionRecord } from "@/lib/director/previs-version";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  PromptRequest,
  PromptResponse,
  SaveRequest,
  SaveResponse,
  SnapshotRequest,
  SnapshotResponse,
  StoryboardPromptResult,
} from "./contracts";

export class StoryboardRevisionConflictError extends Error {
  readonly code = "REVISION_CONFLICT" as const;
  readonly currentRevision: number;
  constructor(currentRevision: number) {
    super(`REVISION_CONFLICT:${currentRevision}`);
    this.currentRevision = currentRevision;
  }
}

export class StoryboardClientError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    if (details) this.details = details;
  }
}

type SessionSupplier = () => Promise<string | null>;

type StoryboardClientOptions = {
  /** Returns the current access token (or null if logged out). */
  getSessionToken: SessionSupplier;
  /** Optional fetch override (testing / custom transport). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
};

type FetchOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  /** Search params appended to the URL. */
  query?: Record<string, string>;
  /** Accept 409 → throw StoryboardRevisionConflictError. */
  expectConflict?: boolean;
};

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildUrl(path: string, query?: Record<string, string>): string {
  if (!query || Object.keys(query).length === 0) return path;
  const params = new URLSearchParams(query);
  return `${path}?${params.toString()}`;
}

export class StoryboardClient {
  private readonly getSessionToken: SessionSupplier;
  private readonly fetchImpl: typeof fetch;

  constructor(options: StoryboardClientOptions) {
    this.getSessionToken = options.getSessionToken;
    this.fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  }

  static fromSupabase(client: SupabaseClient | null): StoryboardClient {
    const supplier: SessionSupplier = async () => {
      if (!client) return null;
      try {
        const { data } = await client.auth.getSession();
        return data.session?.access_token ?? null;
      } catch {
        return null;
      }
    };
    return new StoryboardClient({ getSessionToken: supplier });
  }

  private async fetchJson<T>(options: FetchOptions): Promise<T> {
    const token = await this.getSessionToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await this.fetchImpl(buildUrl(options.path, options.query), {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const payload = (await readJson(response)) as Record<string, unknown> | null;

    if (response.status === 401) {
      throw new StoryboardClientError("UNAUTHORIZED", "请先登录后再使用分镜功能。");
    }
    if (response.status === 409 && options.expectConflict) {
      const currentRevision = Number(payload?.currentRevision ?? 0);
      throw new StoryboardRevisionConflictError(currentRevision);
    }
    if (!response.ok) {
      const code = (payload?.code as string) || "STORYBOARD_CLIENT_ERROR";
      const message = (payload?.error as string) || `请求失败 (${response.status})。`;
      throw new StoryboardClientError(code, message, payload as Record<string, unknown> | undefined);
    }
    if (!payload || payload.success !== true) {
      throw new StoryboardClientError(
        "STORYBOARD_CLIENT_ERROR",
        (payload?.error as string) || "响应缺少 success 字段。",
      );
    }
    return payload as unknown as T;
  }

  /** GET /api/storyboard/state?projectId=&sourceUnitId= */
  async loadState(projectId: string, sourceUnitId: string): Promise<SaveResponse | null> {
    const payload = await this.fetchJson<{ state: SaveResponse | null }>({
      method: "GET",
      path: "/api/storyboard/state",
      query: { projectId, sourceUnitId },
    });
    return payload.state ?? null;
  }

  /** PUT /api/storyboard/state — atomic save with expectedRevision. */
  async saveState(request: SaveRequest): Promise<SaveResponse> {
    return this.fetchJson<SaveResponse>({
      method: "PUT",
      path: "/api/storyboard/state",
      body: request,
      expectConflict: true,
    });
  }

  /** POST /api/storyboard/analyze — full or scene-mode AI analysis. */
  async analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    return this.fetchJson<AnalyzeResponse>({
      method: "POST",
      path: "/api/storyboard/analyze",
      body: request,
    });
  }

  /** POST /api/storyboard/prompts — build image + jimeng prompts for shots. */
  async generatePrompts(request: PromptRequest): Promise<PromptResponse> {
    return this.fetchJson<PromptResponse>({
      method: "POST",
      path: "/api/storyboard/prompts",
      body: request,
      expectConflict: true,
    });
  }

  /** POST /api/storyboard/assets/generate — 4 candidates for one asset. */
  async generateAssetCandidates(input: {
    projectId: string;
    sourceUnitId: string;
    assetId: string;
    idempotencyKey: string;
    referenceVersionIds?: string[];
    count?: number;
    expectedRevision: number;
  }): Promise<{ assetId: string; candidates: Array<{ imageUrl: string; provider: string; model: string; inputHash: string }> }> {
    return this.fetchJson({
      method: "POST",
      path: "/api/storyboard/assets/generate",
      body: input,
      expectConflict: true,
    });
  }

  /** POST /api/storyboard/shots/:shotId/generate-image — one storyboard frame. */
  async generateShotImage(shotId: string, input: {
    projectId: string;
    sourceUnitId: string;
    idempotencyKey: string;
    referenceVersionIds?: string[];
    expectedRevision: number;
  }): Promise<{ shotId: string; imageUrl: string; provider: string; model: string; inputHash: string }> {
    const encoded = encodeURIComponent(shotId);
    return this.fetchJson({
      method: "POST",
      path: `/api/storyboard/shots/${encoded}/generate-image`,
      body: input,
      expectConflict: true,
    });
  }

  async savePrevisVersion(shotId: string, input: {
    projectId: string;
    workId: string;
    sourceUnitId: string;
    storyboardRevision: number;
    scene: PrevisScene;
    promptInputHash?: string;
    referenceVersionIds?: string[];
  }): Promise<PrevisVersionRecord> {
    const encoded = encodeURIComponent(shotId);
    const payload = await this.fetchJson<{ version: PrevisVersionRecord }>({
      method: "POST",
      path: `/api/storyboard/shots/${encoded}/previs-versions`,
      body: input,
    });
    return payload.version;
  }

  async getPrevisVersion(shotId: string, input: {
    projectId: string;
    sourceUnitId: string;
    versionId?: string;
  }): Promise<PrevisVersionRecord | null> {
    const encoded = encodeURIComponent(shotId);
    const query: Record<string, string> = {
      projectId: input.projectId,
      sourceUnitId: input.sourceUnitId,
    };
    if (input.versionId) query.versionId = input.versionId;
    const payload = await this.fetchJson<{ version: PrevisVersionRecord | null }>({
      method: "GET",
      path: `/api/storyboard/shots/${encoded}/previs-versions`,
      query,
    });
    return payload.version;
  }

  /**
   * POST /api/storyboard/shots/:shotId/generate-video
   *
   * Submits a video generation job (image-to-video with the shot's confirmed
   * firstframe). Returns the jobId; caller polls via queryVideoJob every 5s.
   */
  async generateVideo(shotId: string, input: {
    projectId: string;
    sourceUnitId: string;
    /**
     * 兼容字段（服务端忽略）。幂等由 idempotencyHash 强制：
     * sha256(shotId + prompt + firstframeUrl + duration)，由服务端计算。
     */
    idempotencyKey?: string;
    expectedRevision?: number;
    /** 允许文本覆盖；默认服务端读 shot.jimengPromptZh */
    promptOverride?: string;
    duration?: number;
    /** 画幅，如 "16:9" / "9:16" */
    aspectRatio?: string;
  }): Promise<{ jobId: string; providerTaskId?: string; reused: boolean; status: string }> {
    const encoded = encodeURIComponent(shotId);
    return this.fetchJson({
      method: "POST",
      path: `/api/storyboard/shots/${encoded}/generate-video`,
      body: input,
      expectConflict: false,
    });
  }

  /**
   * GET /api/storyboard/jobs/:jobId
   *
   * Returns the current state of a generation job. If the job is a running
   * video job, the route polls the provider once before returning.
   */
  async queryVideoJob(jobId: string): Promise<{
    job: {
      id: string;
      job_type: string;
      provider: string;
      model: string | null;
      provider_task_id: string | null;
      prompt: string;
      input_params: Record<string, unknown>;
      status: string;
      error: string | null;
      result_url: string | null;
      result_metadata: Record<string, unknown>;
      target_type: string | null;
      target_id: string | null;
      created_at: string;
      updated_at: string;
    };
    warning?: string;
  }> {
    const encoded = encodeURIComponent(jobId);
    return this.fetchJson({
      method: "GET",
      path: `/api/storyboard/jobs/${encoded}`,
      expectConflict: false,
    });
  }

  /**
   * GET /api/storyboard/jobs?projectId=&sourceUnitId=&jobType=video
   *
   * Returns all video jobs for the current project+episode, used to restore
   * progress after a page refresh.
   */
  async listVideoJobs(input: {
    projectId: string;
    sourceUnitId: string;
  }): Promise<{ jobs: Array<{ id: string; status: string; target_id: string | null; result_url: string | null; error: string | null; created_at: string }> }> {
    const query: Record<string, string> = {
      projectId: input.projectId,
      sourceUnitId: input.sourceUnitId,
      jobType: "video",
    };
    return this.fetchJson({
      method: "GET",
      path: "/api/storyboard/jobs",
      query,
      expectConflict: false,
    });
  }

  /**
   * POST /api/storyboard/snapshots
   *
   * P3 BLOCKER v2: 把本地完整内容（scenes + 删除清单）保留为不可变独立版本
   * （storyflow_versions.snapshot_json）。绝不触碰当前工作态——后端不查 current state、
   * 不调 save_storyboard_state RPC、不做 CAS 校验。
   *
   * 用于 409 冲突 "另存快照" 出口：把本地未提交修改存为快照后，loadFromServer()
   * 拉服务端最新到本地继续工作。快照未来可从版本历史恢复。
   */
  async createSnapshot(request: SnapshotRequest): Promise<SnapshotResponse> {
    return this.fetchJson<SnapshotResponse>({
      method: "POST",
      path: "/api/storyboard/snapshots",
      body: request,
      expectConflict: true,
    });
  }
}

export type { AnalyzeRequest, AnalyzeResponse, PromptRequest, PromptResponse, SaveRequest, SaveResponse, SnapshotRequest, SnapshotResponse, StoryboardPromptResult };
