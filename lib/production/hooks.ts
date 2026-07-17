"use client";

import { useCallback, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  ProductionProjectState,
  ProductionShot,
  ProductionSourceFile,
} from "./types";

const AUTH_REQUIRED_MESSAGE = "请先登录后再使用此功能。";

type ProductionSession = Session | null;

function getAccessToken(session: ProductionSession): string {
  const token = session?.access_token;
  if (!token) {
    throw new Error(AUTH_REQUIRED_MESSAGE);
  }
  return token;
}

function buildHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

type TimedController = {
  controller: AbortController;
  cancel: () => void;
};

function createTimeoutController(timeoutMs: number): TimedController {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Allow the timer to be unref'd in Node-like environments without breaking browsers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (timer as any)?.unref?.();
  return {
    controller,
    cancel: () => clearTimeout(timer),
  };
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function friendlyNetworkError(error: unknown, fallback: string): Error {
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Error("请求超时，请稍后再试。");
  }
  if (error instanceof Error) {
    return new Error(fallback || error.message);
  }
  return new Error(fallback);
}

/* ------------------------------------------------------------------ */
/* useProductionSync                                                   */
/* ------------------------------------------------------------------ */

type SaveStateResponse = {
  success: boolean;
  state?: ProductionProjectState;
  error?: string;
};

export function useProductionSync(
  session: ProductionSession,
  projectId: string,
): {
  saveToCloud: (state: ProductionProjectState) => Promise<ProductionProjectState>;
  loadFromCloud: () => Promise<ProductionProjectState | null>;
  saving: boolean;
  loading: boolean;
  error: string | null;
} {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveToCloud = useCallback(
    async (state: ProductionProjectState): Promise<ProductionProjectState> => {
      const token = getAccessToken(session);
      setSaving(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(30_000);
      try {
        const response = await fetch("/api/production/save-state", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ projectId, mode: "save", state }),
        });
        const payload = (await parseJsonSafely(response)) as SaveStateResponse | null;
        if (!response.ok || !payload?.success) {
          const message = payload?.error || "保存失败，请稍后再试。";
          throw new Error(message);
        }
        return payload.state ?? state;
      } catch (err) {
        const friendly = friendlyNetworkError(err, "保存失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setSaving(false);
      }
    },
    [session, projectId],
  );

  const loadFromCloud = useCallback(async (): Promise<ProductionProjectState | null> => {
    const token = getAccessToken(session);
    setLoading(true);
    setError(null);
    const { controller, cancel } = createTimeoutController(30_000);
    try {
      const response = await fetch("/api/production/save-state", {
        method: "POST",
        headers: buildHeaders(token),
        signal: controller.signal,
        body: JSON.stringify({ projectId, mode: "load" }),
      });
      const payload = (await parseJsonSafely(response)) as SaveStateResponse | null;
      if (!response.ok || !payload?.success) {
        const message = payload?.error || "加载失败，请稍后再试。";
        throw new Error(message);
      }
      return payload.state ?? null;
    } catch (err) {
      const friendly = friendlyNetworkError(err, "加载失败，请稍后再试。");
      setError(friendly.message);
      throw friendly;
    } finally {
      cancel();
      setLoading(false);
    }
  }, [session, projectId]);

  return { saveToCloud, loadFromCloud, saving, loading, error };
}

/* ------------------------------------------------------------------ */
/* useProductionChat                                                   */
/* ------------------------------------------------------------------ */

type StoryboardChatResponse = {
  success: boolean;
  reply: string;
  shots: ProductionShot[];
  error?: string;
};

export function useProductionChat(
  session: ProductionSession,
  projectId: string,
): {
  send: (
    message: string,
    currentState: ProductionProjectState,
  ) => Promise<{ reply: string; shots: ProductionShot[] }>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (
      message: string,
      currentState: ProductionProjectState,
    ): Promise<{ reply: string; shots: ProductionShot[] }> => {
      const token = getAccessToken(session);
      setLoading(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(75_000);
      try {
        const response = await fetch("/api/production/storyboard-chat", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ projectId, message, state: currentState }),
        });
        const payload = (await parseJsonSafely(response)) as StoryboardChatResponse | null;
        if (!response.ok || !payload?.success) {
          const errorMessage = payload?.error || "对话失败，请稍后再试。";
          throw new Error(errorMessage);
        }
        return {
          reply: payload.reply ?? "",
          shots: payload.shots ?? [],
        };
      } catch (err) {
        const friendly = friendlyNetworkError(err, "对话失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setLoading(false);
      }
    },
    [session, projectId],
  );

  return { send, loading, error };
}

/* ------------------------------------------------------------------ */
/* useShotImage                                                        */
/* ------------------------------------------------------------------ */

type GenerateShotImageResponse = {
  success: boolean;
  imageUrl: string;
  status: string;
  provider: string;
  model: string;
  error?: string;
};

export function useShotImage(
  session: ProductionSession,
  projectId: string,
): {
  generate: (
    shotId: string,
  ) => Promise<{ imageUrl: string; status: string; provider: string; model: string }>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (
      shotId: string,
    ): Promise<{ imageUrl: string; status: string; provider: string; model: string }> => {
      const token = getAccessToken(session);
      setLoading(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(75_000);
      try {
        const response = await fetch("/api/production/generate-shot-image", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ projectId, shotId }),
        });
        const payload = (await parseJsonSafely(response)) as GenerateShotImageResponse | null;
        if (!response.ok || !payload?.success) {
          const message = payload?.error || "图片生成失败，请稍后再试。";
          throw new Error(message);
        }
        return {
          imageUrl: payload.imageUrl,
          status: payload.status,
          provider: payload.provider,
          model: payload.model,
        };
      } catch (err) {
        const friendly = friendlyNetworkError(err, "图片生成失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setLoading(false);
      }
    },
    [session, projectId],
  );

  return { generate, loading, error };
}

/* ------------------------------------------------------------------ */
/* useShotVideo                                                        */
/* ------------------------------------------------------------------ */

type GenerateShotVideoResponse = {
  success: boolean;
  taskId: string;
  status: string;
  error?: string;
};

type VideoStatusResponse = {
  success: boolean;
  status: string;
  videoUrl?: string;
  error?: string;
};

export function useShotVideo(
  session: ProductionSession,
  projectId: string,
): {
  generate: (shotId: string) => Promise<{ taskId: string; status: string }>;
  pollStatus: (shotId: string, taskId: string) => Promise<{ status: string; videoUrl?: string }>;
  pollUntilDone: (shotId: string, taskId: string, options?: { maxAttempts?: number; onProgress?: (status: string) => void }) => Promise<{ status: string; videoUrl?: string }>;
  generating: boolean;
  polling: boolean;
  loading: boolean;
  error: string | null;
} {
  const [generating, setGenerating] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (shotId: string): Promise<{ taskId: string; status: string }> => {
      const token = getAccessToken(session);
      setGenerating(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(75_000);
      try {
        const response = await fetch("/api/production/generate-shot-video", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ projectId, shotId }),
        });
        const payload = (await parseJsonSafely(response)) as GenerateShotVideoResponse | null;
        if (!response.ok || !payload?.success) {
          const message = payload?.error || "视频生成请求失败，请稍后再试。";
          throw new Error(message);
        }
        return { taskId: payload.taskId, status: payload.status };
      } catch (err) {
        const friendly = friendlyNetworkError(err, "视频生成请求失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setGenerating(false);
      }
    },
    [session, projectId],
  );

  const pollStatus = useCallback(
    async (shotId: string, taskId: string): Promise<{ status: string; videoUrl?: string }> => {
      const token = getAccessToken(session);
      setPolling(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(30_000);
      try {
        const response = await fetch("/api/production/video-status", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ projectId, shotId, taskId }),
        });
        const payload = (await parseJsonSafely(response)) as VideoStatusResponse | null;
        if (!response.ok || !payload?.success) {
          const message = payload?.error || "视频状态查询失败，请稍后再试。";
          throw new Error(message);
        }
        return {
          status: payload.status,
          videoUrl: payload.videoUrl,
        };
      } catch (err) {
        const friendly = friendlyNetworkError(err, "视频状态查询失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setPolling(false);
      }
    },
    [session, projectId],
  );

  const pollUntilDone = useCallback(
    async (
      shotId: string,
      taskId: string,
      options?: { maxAttempts?: number; onProgress?: (status: string) => void },
    ): Promise<{ status: string; videoUrl?: string }> => {
      const maxAttempts = options?.maxAttempts ?? 30;
      const baseDelayMs = 5000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await pollStatus(shotId, taskId);
          options?.onProgress?.(result.status);

          if (result.status === "video_ready" || result.status === "done") {
            return result;
          }
          if (result.status === "error") {
            return result;
          }

          // Exponential backoff with jitter, capped at 30s
          const delay = Math.min(baseDelayMs * Math.pow(1.4, attempt) + Math.random() * 2000, 30_000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } catch (err) {
          // On poll error, wait and continue (transient failures shouldn't abort)
          if (attempt === maxAttempts - 1) throw err;
          const delay = Math.min(baseDelayMs * Math.pow(1.4, attempt) + Math.random() * 2000, 30_000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      return { status: "error" };
    },
    [pollStatus],
  );

  return { generate, pollStatus, pollUntilDone, generating, polling, loading: generating || polling, error };
}

/* ------------------------------------------------------------------ */
/* useSourceFileUpload                                                 */
/* ------------------------------------------------------------------ */

type SourceFileResponse = {
  success: boolean;
  sourceFile: ProductionSourceFile;
  error?: string;
};

export function useSourceFileUpload(
  session: ProductionSession,
  projectId: string,
): {
  upload: (file: File) => Promise<ProductionSourceFile>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<ProductionSourceFile> => {
      const token = getAccessToken(session);
      setLoading(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(75_000);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const url = `/api/production/source-file?projectId=${encodeURIComponent(projectId)}`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
          body: formData,
        });
        const payload = (await parseJsonSafely(response)) as SourceFileResponse | null;
        if (!response.ok || !payload?.success) {
          const message = payload?.error || "文件上传失败，请稍后再试。";
          throw new Error(message);
        }
        return payload.sourceFile;
      } catch (err) {
        const friendly = friendlyNetworkError(err, "文件上传失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setLoading(false);
      }
    },
    [session, projectId],
  );

  return { upload, loading, error };
}



/* ------------------------------------------------------------------ */
/* useCardDraw (抽卡 system)                                           */
/* ------------------------------------------------------------------ */

export type DrawnCard = {
  assetId: string;
  kind: string;
  name: string;
  description: string;
  narrativeRole: string;
  status: string;
  rarity: string;
  imageUrl: string | null;
  drawnAt: string;
};

export type CardDrawRecord = {
  id: string;
  drawType: string;
  poolCount: number;
  drawnCount: number;
  drawnCards: DrawnCard[];
  label: string;
  createdAt: string;
};

type CardDrawApiResponse = {
  success: boolean;
  drawId?: string;
  cards?: DrawnCard[];
  poolCount?: number;
  draws?: Array<Record<string, unknown>>;
  deletedCount?: number;
  error?: string;
};

function parseDrawRecord(raw: Record<string, unknown>): CardDrawRecord {
  return {
    id: String(raw.id || ""),
    drawType: String(raw.draw_type || "mixed"),
    poolCount: Number(raw.pool_count || 0),
    drawnCount: Number(raw.drawn_count || 0),
    drawnCards: Array.isArray(raw.drawn_cards) ? (raw.drawn_cards as DrawnCard[]) : [],
    label: raw.label ? String(raw.label) : "",
    createdAt: String(raw.created_at || ""),
  };
}

export function useCardDraw(
  session: ProductionSession,
  projectId: string,
): {
  draw: (drawType: "character" | "scene" | "prop" | "mixed", count?: number) => Promise<{ cards: DrawnCard[]; poolCount: number; drawId: string }>;
  history: (limit?: number) => Promise<CardDrawRecord[]>;
  clearHistory: () => Promise<number>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draw = useCallback(
    async (
      drawType: "character" | "scene" | "prop" | "mixed",
      count?: number,
    ): Promise<{ cards: DrawnCard[]; poolCount: number; drawId: string }> => {
      const token = getAccessToken(session);
      setLoading(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(30_000);
      try {
        const response = await fetch("/api/production/draw-cards", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ action: "draw", drawType, count: count || 3, projectId }),
        });
        const payload = (await parseJsonSafely(response)) as CardDrawApiResponse | null;
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "抽卡失败，请稍后再试。");
        }
        return {
          cards: payload.cards || [],
          poolCount: payload.poolCount || 0,
          drawId: payload.drawId || "",
        };
      } catch (err) {
        const friendly = friendlyNetworkError(err, "抽卡失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setLoading(false);
      }
    },
    [session, projectId],
  );

  const history = useCallback(async (limit?: number): Promise<CardDrawRecord[]> => {
    const token = getAccessToken(session);
    setLoading(true);
    setError(null);
    const { controller, cancel } = createTimeoutController(30_000);
    try {
      const response = await fetch("/api/production/draw-cards", {
        method: "POST",
        headers: buildHeaders(token),
        signal: controller.signal,
        body: JSON.stringify({ action: "history", limit: limit || 20 }),
      });
      const payload = (await parseJsonSafely(response)) as CardDrawApiResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "查询抽卡历史失败。");
      }
      return (payload.draws || []).map(parseDrawRecord);
    } catch (err) {
      const friendly = friendlyNetworkError(err, "查询抽卡历史失败。");
      setError(friendly.message);
      throw friendly;
    } finally {
      cancel();
      setLoading(false);
    }
  }, [session, projectId]);

  const clearHistory = useCallback(async (): Promise<number> => {
    const token = getAccessToken(session);
    setLoading(true);
    setError(null);
    const { controller, cancel } = createTimeoutController(30_000);
    try {
      const response = await fetch("/api/production/draw-cards", {
        method: "POST",
        headers: buildHeaders(token),
        signal: controller.signal,
        body: JSON.stringify({ action: "clear" }),
      });
      const payload = (await parseJsonSafely(response)) as CardDrawApiResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "清除抽卡历史失败。");
      }
      return payload.deletedCount || 0;
    } catch (err) {
      const friendly = friendlyNetworkError(err, "清除抽卡历史失败。");
      setError(friendly.message);
      throw friendly;
    } finally {
      cancel();
      setLoading(false);
    }
  }, [session, projectId]);

  return { draw, history, clearHistory, loading, error };
}

/* ------------------------------------------------------------------ */
/* useGenerationJobs (unified job queue)                               */
/* ------------------------------------------------------------------ */

export type GenerationJobType = "image" | "video" | "audio";
export type GenerationJobStatus =
  | "draft" | "pending_confirm" | "queued" | "generating" | "result_ingesting"
  | "completed" | "partial_failure" | "failed" | "cancel_requested" | "cancelled"
  | "moderation_blocked" | "expired" | "needs_user_action" | "provider_timeout";

export const GENERATION_JOB_STATUS_LABELS: Record<GenerationJobStatus, string> = {
  draft: "草稿",
  pending_confirm: "待确认",
  queued: "排队中",
  generating: "生成中",
  result_ingesting: "结果入库",
  completed: "已完成",
  partial_failure: "部分失败",
  failed: "已失败",
  cancel_requested: "取消请求中",
  cancelled: "已取消",
  moderation_blocked: "审核拦截",
  expired: "已过期",
  needs_user_action: "需用户操作",
  provider_timeout: "提供商超时",
};

export const ACTIVE_JOB_STATUSES: GenerationJobStatus[] = [
  "queued",
  "generating",
  "result_ingesting",
  "cancel_requested",
];

export type GenerationJob = {
  id: string;
  jobType: GenerationJobType;
  provider: string;
  model: string | null;
  providerTaskId: string | null;
  prompt: string;
  inputParams: Record<string, unknown>;
  status: GenerationJobStatus;
  error: string | null;
  resultUrl: string | null;
  resultMetadata: Record<string, unknown>;
  targetType: string;
  targetId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type JobsApiResponse = {
  success: boolean;
  job?: Record<string, unknown>;
  jobs?: Array<Record<string, unknown>>;
  error?: string;
};

function parseJob(raw: Record<string, unknown>): GenerationJob {
  return {
    id: String(raw.id || ""),
    jobType: String(raw.job_type || "image") as GenerationJobType,
    provider: String(raw.provider || ""),
    model: raw.model ? String(raw.model) : null,
    providerTaskId: raw.provider_task_id ? String(raw.provider_task_id) : null,
    prompt: String(raw.prompt || ""),
    inputParams: (raw.input_params as Record<string, unknown>) || {},
    status: String(raw.status || "queued") as GenerationJobStatus,
    error: raw.error ? String(raw.error) : null,
    resultUrl: raw.result_url ? String(raw.result_url) : null,
    resultMetadata: (raw.result_metadata as Record<string, unknown>) || {},
    targetType: String(raw.target_type || "standalone"),
    targetId: raw.target_id ? String(raw.target_id) : null,
    projectId: raw.project_id ? String(raw.project_id) : null,
    createdAt: String(raw.created_at || ""),
    updatedAt: String(raw.updated_at || ""),
    completedAt: raw.completed_at ? String(raw.completed_at) : null,
  };
}

type CreateJobInput = {
  jobType: GenerationJobType;
  provider: string;
  model?: string;
  prompt: string;
  inputParams?: Record<string, unknown>;
  targetType?: string;
  targetId?: string;
};

export function useGenerationJobs(
  session: ProductionSession,
  projectId: string,
): {
  createJob: (input: CreateJobInput) => Promise<GenerationJob>;
  listJobs: (filters?: { status?: GenerationJobStatus; targetType?: string; targetId?: string; limit?: number }) => Promise<GenerationJob[]>;
  getJob: (jobId: string) => Promise<GenerationJob>;
  cancelJob: (jobId: string) => Promise<void>;
  pollActiveJobs: () => Promise<GenerationJob[]>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callApi = useCallback(async (body: Record<string, unknown>): Promise<JobsApiResponse> => {
    const token = getAccessToken(session);
    const { controller, cancel } = createTimeoutController(30_000);
    try {
      const response = await fetch("/api/production/jobs", {
        method: "POST",
        headers: buildHeaders(token),
        signal: controller.signal,
        body: JSON.stringify({ ...body, projectId }),
      });
      const payload = (await parseJsonSafely(response)) as JobsApiResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "操作失败，请稍后再试。");
      }
      return payload;
    } finally {
      cancel();
    }
  }, [session, projectId]);

  const createJob = useCallback(async (input: CreateJobInput): Promise<GenerationJob> => {
    setLoading(true);
    setError(null);
    try {
      const payload = await callApi({
        action: "create",
        jobType: input.jobType,
        provider: input.provider,
        model: input.model || null,
        prompt: input.prompt,
        inputParams: input.inputParams || {},
        targetType: input.targetType || "standalone",
        targetId: input.targetId || null,
      });
      if (!payload.job) throw new Error("创建任务失败。");
      return parseJob(payload.job);
    } catch (err) {
      const friendly = friendlyNetworkError(err, "创建任务失败，请稍后再试。");
      setError(friendly.message);
      throw friendly;
    } finally {
      setLoading(false);
    }
  }, [callApi]);

  const listJobs = useCallback(async (filters?: {
    status?: GenerationJobStatus;
    targetType?: string;
    targetId?: string;
    limit?: number;
  }): Promise<GenerationJob[]> => {
    setLoading(true);
    setError(null);
    try {
      const payload = await callApi({
        action: "list",
        status: filters?.status,
        targetType: filters?.targetType,
        targetId: filters?.targetId,
        limit: filters?.limit || 50,
      });
      return (payload.jobs || []).map(parseJob);
    } catch (err) {
      const friendly = friendlyNetworkError(err, "查询任务列表失败，请稍后再试。");
      setError(friendly.message);
      throw friendly;
    } finally {
      setLoading(false);
    }
  }, [callApi]);

  const getJob = useCallback(async (jobId: string): Promise<GenerationJob> => {
    setLoading(true);
    setError(null);
    try {
      const payload = await callApi({ action: "get", jobId });
      if (!payload.job) throw new Error("任务不存在。");
      return parseJob(payload.job);
    } catch (err) {
      const friendly = friendlyNetworkError(err, "查询任务失败，请稍后再试。");
      setError(friendly.message);
      throw friendly;
    } finally {
      setLoading(false);
    }
  }, [callApi]);

  const cancelJob = useCallback(async (jobId: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await callApi({ action: "cancel", jobId });
    } catch (err) {
      const friendly = friendlyNetworkError(err, "取消任务失败，请稍后再试。");
      setError(friendly.message);
      throw friendly;
    } finally {
      setLoading(false);
    }
  }, [callApi]);

  const pollActiveJobs = useCallback(async (): Promise<GenerationJob[]> => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        ACTIVE_JOB_STATUSES.map((status) =>
          callApi({ action: "list", status, limit: 50 }),
        ),
      );
      return results.flatMap((payload) => (payload.jobs || []).map(parseJob));
    } catch (err) {
      const friendly = friendlyNetworkError(err, "轮询任务失败。");
      setError(friendly.message);
      throw friendly;
    } finally {
      setLoading(false);
    }
  }, [callApi]);

  return { createJob, listJobs, getJob, cancelJob, pollActiveJobs, loading, error };
}


/* ------------------------------------------------------------------ */
/* useVersions (version history & restore)                             */
/* ------------------------------------------------------------------ */

export type VersionRecord = {
  id: string;
  versionNo: number | null;
  source: string;
  entityType: string;
  entityId: string;
  stepKey: string | null;
  snapshotText: string | null;
  snapshotJson: unknown;
  diffJson: unknown;
  createdAt: string;
};

type VersionApiResponse = {
  success: boolean;
  versions?: Array<Record<string, unknown>>;
  version?: Record<string, unknown>;
  diff?: {
    text: { changeCount: number; changes: Array<Record<string, unknown>> };
    json: { changeCount: number; changes: Array<Record<string, unknown>> };
  };
  error?: string;
};

function parseVersion(raw: Record<string, unknown>): VersionRecord {
  return {
    id: String(raw.id || ""),
    versionNo: raw.version_no != null ? Number(raw.version_no) : null,
    source: String(raw.source || raw.version_type || "manual"),
    entityType: String(raw.entity_type || ""),
    entityId: String(raw.entity_id || ""),
    stepKey: raw.step_key ? String(raw.step_key) : null,
    snapshotText: raw.snapshot_text ? String(raw.snapshot_text) : null,
    snapshotJson: raw.snapshot_json ?? raw.content_snapshot ?? {},
    diffJson: raw.diff_json ?? raw.diff_snapshot ?? {},
    createdAt: String(raw.created_at || ""),
  };
}

export function useVersions(
  session: ProductionSession,
  projectId: string,
): {
  listVersions: (entityType?: string, entityId?: string) => Promise<VersionRecord[]>;
  createVersion: (input: { entityType: string; entityId?: string; snapshotText?: string; snapshotJson?: unknown; source?: string }) => Promise<VersionRecord | null>;
  restoreVersion: (versionId: string) => Promise<VersionRecord | null>;
  compareVersions: (versionA: string, versionB: string) => Promise<{ text: { changeCount: number; changes: unknown[] }; json: { changeCount: number; changes: unknown[] } } | null>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listVersions = useCallback(async (entityType?: string, entityId?: string): Promise<VersionRecord[]> => {
    const token = getAccessToken(session);
    setLoading(true);
    setError(null);
    const { controller, cancel } = createTimeoutController(30_000);
    try {
      const params = new URLSearchParams({ projectId });
      if (entityType) params.set("entityType", entityType);
      if (entityId) params.set("entityId", entityId);
      const response = await fetch(`/api/versions?${params.toString()}`, {
        method: "GET",
        headers: buildHeaders(token),
        signal: controller.signal,
      });
      const payload = (await parseJsonSafely(response)) as VersionApiResponse | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "查询版本列表失败。");
      }
      return (payload.versions || []).map(parseVersion);
    } catch (err) {
      const friendly = friendlyNetworkError(err, "查询版本列表失败。");
      setError(friendly.message);
      return [];
    } finally {
      cancel();
      setLoading(false);
    }
  }, [session, projectId]);

  const createVersion = useCallback(async (input: {
    entityType: string;
    entityId?: string;
    snapshotText?: string;
    snapshotJson?: unknown;
    source?: string;
  }): Promise<VersionRecord | null> => {
    const token = getAccessToken(session);
    setLoading(true);
    setError(null);
    const { controller, cancel } = createTimeoutController(30_000);
    try {
      const response = await fetch("/api/versions", {
        method: "POST",
        headers: buildHeaders(token),
        signal: controller.signal,
        body: JSON.stringify({
          projectId,
          entityType: input.entityType,
          entityId: input.entityId || "",
          snapshotText: input.snapshotText || "",
          snapshotJson: input.snapshotJson || {},
          source: input.source || "manual",
        }),
      });
      const payload = (await parseJsonSafely(response)) as VersionApiResponse | null;
      if (!response.ok || !payload?.version) {
        throw new Error(payload?.error || "创建版本失败。");
      }
      return parseVersion(payload.version);
    } catch (err) {
      const friendly = friendlyNetworkError(err, "创建版本失败。");
      setError(friendly.message);
      return null;
    } finally {
      cancel();
      setLoading(false);
    }
  }, [session, projectId]);

  const restoreVersion = useCallback(async (versionId: string): Promise<VersionRecord | null> => {
    const token = getAccessToken(session);
    setLoading(true);
    setError(null);
    const { controller, cancel } = createTimeoutController(30_000);
    try {
      const response = await fetch("/api/versions", {
        method: "PATCH",
        headers: buildHeaders(token),
        signal: controller.signal,
        body: JSON.stringify({ action: "restore", versionId }),
      });
      const payload = (await parseJsonSafely(response)) as VersionApiResponse | null;
      if (!response.ok || !payload?.version) {
        throw new Error(payload?.error || "恢复版本失败。");
      }
      return parseVersion(payload.version);
    } catch (err) {
      const friendly = friendlyNetworkError(err, "恢复版本失败。");
      setError(friendly.message);
      throw friendly;
    } finally {
      cancel();
      setLoading(false);
    }
  }, [session, projectId]);

  const compareVersions = useCallback(async (versionA: string, versionB: string): Promise<{
    text: { changeCount: number; changes: unknown[] };
    json: { changeCount: number; changes: unknown[] };
  } | null> => {
    const token = getAccessToken(session);
    setLoading(true);
    setError(null);
    const { controller, cancel } = createTimeoutController(30_000);
    try {
      const params = new URLSearchParams({ projectId, versionA, versionB });
      const response = await fetch(`/api/versions?${params.toString()}`, {
        method: "GET",
        headers: buildHeaders(token),
        signal: controller.signal,
      });
      const payload = (await parseJsonSafely(response)) as VersionApiResponse | null;
      if (!response.ok || !payload?.diff) {
        throw new Error(payload?.error || "对比版本失败。");
      }
      return {
        text: { changeCount: payload.diff.text?.changeCount ?? 0, changes: payload.diff.text?.changes ?? [] },
        json: { changeCount: payload.diff.json?.changeCount ?? 0, changes: payload.diff.json?.changes ?? [] },
      };
    } catch (err) {
      const friendly = friendlyNetworkError(err, "对比版本失败。");
      setError(friendly.message);
      return null;
    } finally {
      cancel();
      setLoading(false);
    }
  }, [session, projectId]);

  return { listVersions, createVersion, restoreVersion, compareVersions, loading, error };
}

/* ------------------------------------------------------------------ */
/* useProductionApi (combined)                                         */
/* ------------------------------------------------------------------ */

export function useProductionApi(
  session: ProductionSession,
  projectId: string,
): {
  sync: ReturnType<typeof useProductionSync>;
  chat: ReturnType<typeof useProductionChat>;
  image: ReturnType<typeof useShotImage>;
  video: ReturnType<typeof useShotVideo>;
  upload: ReturnType<typeof useSourceFileUpload>;
  jobs: ReturnType<typeof useGenerationJobs>;
  cardDraw: ReturnType<typeof useCardDraw>;
  versions: ReturnType<typeof useVersions>;
} {
  const sync = useProductionSync(session, projectId);
  const chat = useProductionChat(session, projectId);
  const image = useShotImage(session, projectId);
  const video = useShotVideo(session, projectId);
  const upload = useSourceFileUpload(session, projectId);
  const jobs = useGenerationJobs(session, projectId);
  const cardDraw = useCardDraw(session, projectId);
  const versions = useVersions(session, projectId);

  return { sync, chat, image, video, upload, jobs, cardDraw, versions };
}
