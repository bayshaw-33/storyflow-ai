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
  pollStatus: (shotId: string) => Promise<{ status: string; videoUrl?: string }>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (shotId: string): Promise<{ taskId: string; status: string }> => {
      const token = getAccessToken(session);
      setLoading(true);
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
        setLoading(false);
      }
    },
    [session, projectId],
  );

  const pollStatus = useCallback(
    async (shotId: string): Promise<{ status: string; videoUrl?: string }> => {
      const token = getAccessToken(session);
      setLoading(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(30_000);
      try {
        const response = await fetch("/api/production/video-status", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ projectId, shotId }),
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
        setLoading(false);
      }
    },
    [session, projectId],
  );

  return { generate, pollStatus, loading, error };
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
/* useGenerationJobs (unified job queue)                               */
/* ------------------------------------------------------------------ */

export type GenerationJobType = "image" | "video" | "audio";
export type GenerationJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

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

type UpdateJobInput = {
  status?: GenerationJobStatus;
  providerTaskId?: string;
  resultUrl?: string;
  resultMetadata?: Record<string, unknown>;
  error?: string | null;
};

export function useGenerationJobs(
  session: ProductionSession,
  projectId: string,
): {
  createJob: (input: CreateJobInput) => Promise<GenerationJob>;
  listJobs: (filters?: { status?: GenerationJobStatus; targetType?: string; targetId?: string; limit?: number }) => Promise<GenerationJob[]>;
  getJob: (jobId: string) => Promise<GenerationJob>;
  updateJob: (jobId: string, patch: UpdateJobInput) => Promise<GenerationJob>;
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

  const updateJob = useCallback(async (jobId: string, patch: UpdateJobInput): Promise<GenerationJob> => {
    setLoading(true);
    setError(null);
    try {
      const payload = await callApi({ action: "update", jobId, patch });
      if (!payload.job) throw new Error("更新任务失败。");
      return parseJob(payload.job);
    } catch (err) {
      const friendly = friendlyNetworkError(err, "更新任务失败，请稍后再试。");
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
      const payload = await callApi({ action: "list", status: "running", limit: 50 });
      const running = (payload.jobs || []).map(parseJob);
      const queuedPayload = await callApi({ action: "list", status: "queued", limit: 50 });
      const queued = (queuedPayload.jobs || []).map(parseJob);
      return [...running, ...queued];
    } catch (err) {
      const friendly = friendlyNetworkError(err, "轮询任务失败。");
      setError(friendly.message);
      throw friendly;
    } finally {
      setLoading(false);
    }
  }, [callApi]);

  return { createJob, listJobs, getJob, updateJob, cancelJob, pollActiveJobs, loading, error };
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
} {
  const sync = useProductionSync(session, projectId);
  const chat = useProductionChat(session, projectId);
  const image = useShotImage(session, projectId);
  const video = useShotVideo(session, projectId);
  const upload = useSourceFileUpload(session, projectId);
  const jobs = useGenerationJobs(session, projectId);

  return { sync, chat, image, video, upload, jobs };
}
