/**
 * Shared MiniMax video adapter.
 *
 * Consolidates previously duplicated logic from:
 *   - app/api/video/minimax/route.ts
 *   - app/api/production/generate-shot-video/route.ts
 *   - app/api/production/video-status/route.ts
 *
 * Adds retry with exponential backoff + jitter and configurable timeouts.
 */

export type MiniMaxVideoConfig = {
  apiKey: string;
  baseUrl: string;
  videoModel: string;
  generationUrl: string;
  queryUrl: string;
  fileRetrieveUrl: string;
};

export type VideoTaskInput = {
  prompt: string;
  model?: string;
  duration?: number; // default 5
  resolution?: string; // default "768P"
  promptOptimizer?: boolean; // default true
  imageUrl?: string; // reference image for image-to-video
};

export type VideoTaskResult = {
  taskId: string;
  status: "queued";
};

export type VideoQueryResult = {
  status: "queued" | "running" | "done" | "error";
  videoUrl?: string;
  fileId?: string;
  rawStatus: string;
};

export type VideoProviderError = {
  code: string;
  message: string;
  status?: number;
  retryable: boolean;
};

const DEFAULT_VIDEO_MODEL = "MiniMax-Hailuo-02";
const DEFAULT_DURATION = 5;
const DEFAULT_RESOLUTION = "768P";

const DEFAULT_CREATE_TIMEOUT =
  Number(process.env.VIDEO_CREATE_TIMEOUT_MS) || 90_000;
const DEFAULT_QUERY_TIMEOUT =
  Number(process.env.VIDEO_QUERY_TIMEOUT_MS) || 30_000;
const DEFAULT_RETRIEVE_TIMEOUT =
  Number(process.env.VIDEO_RETRIEVE_TIMEOUT_MS) || 30_000;

export function resolveMiniMaxVideoConfig(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): MiniMaxVideoConfig {
  const apiKey = opts.apiKey;
  if (!apiKey) throw new Error("MISSING_MINIMAX_API_KEY");

  const baseUrl = resolveBaseUrl(apiKey, opts.baseUrl);
  const videoModel =
    opts.model || process.env.MINIMAX_VIDEO_MODEL || DEFAULT_VIDEO_MODEL;

  return {
    apiKey,
    baseUrl,
    videoModel,
    generationUrl:
      process.env.MINIMAX_VIDEO_GENERATION_URL ||
      `${baseUrl}/video_generation`,
    queryUrl:
      process.env.MINIMAX_VIDEO_QUERY_URL ||
      `${baseUrl}/query/video_generation`,
    fileRetrieveUrl:
      process.env.MINIMAX_FILE_RETRIEVE_URL || `${baseUrl}/files/retrieve`,
  };
}

function resolveBaseUrl(apiKey: string, override?: string): string {
  if (override) return override.replace(/\/$/, "");
  if (process.env.MINIMAX_VIDEO_API_BASE_URL) {
    return process.env.MINIMAX_VIDEO_API_BASE_URL.replace(/\/$/, "");
  }
  if (apiKey.startsWith("sk-cp-")) return "https://api.minimax.io/v1";
  return "https://api.minimaxi.com/v1";
}

export async function createVideoTask(
  input: VideoTaskInput,
  config: MiniMaxVideoConfig,
  options: { timeoutMs?: number; maxRetries?: number } = {}
): Promise<VideoTaskResult> {
  if (!config.apiKey) throw new Error("MISSING_MINIMAX_API_KEY");
  if (!input.prompt?.trim()) throw new Error("EMPTY_MINIMAX_VIDEO_PROMPT");

  const timeoutMs = options.timeoutMs ?? DEFAULT_CREATE_TIMEOUT;

  const body: Record<string, unknown> = {
    model: input.model || config.videoModel,
    prompt: input.prompt,
    duration: input.duration ?? DEFAULT_DURATION,
    resolution: input.resolution || DEFAULT_RESOLUTION,
    prompt_optimizer: input.promptOptimizer ?? true,
  };
  if (input.imageUrl) {
    body.first_frame_image = input.imageUrl;
  }

  const data = await withRetry(
    () =>
      miniMaxFetch<unknown>(
        config.generationUrl,
        { method: "POST", body: JSON.stringify(body) },
        config,
        timeoutMs
      ),
    { maxRetries: options.maxRetries }
  );

  const taskId = extractVideoString(data, [
    "task_id",
    "taskId",
    "data.task_id",
    "data.taskId",
  ]);
  if (!taskId) throw new Error("EMPTY_MINIMAX_VIDEO_TASK_ID");

  return { taskId, status: "queued" };
}

export async function queryVideoTask(
  taskId: string,
  config: MiniMaxVideoConfig,
  options: { timeoutMs?: number; maxRetries?: number } = {}
): Promise<VideoQueryResult> {
  if (!taskId) throw new Error("EMPTY_MINIMAX_VIDEO_TASK_ID");
  if (!config.apiKey) throw new Error("MISSING_MINIMAX_API_KEY");

  const timeoutMs = options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT;

  const queryUrl = new URL(config.queryUrl);
  queryUrl.searchParams.set("task_id", taskId);

  const data = await withRetry(
    () =>
      miniMaxFetch<unknown>(
        queryUrl.toString(),
        { method: "GET" },
        config,
        timeoutMs
      ),
    { maxRetries: options.maxRetries }
  );

  const rawStatus = extractVideoString(data, [
    "status",
    "task_status",
    "data.status",
    "data.task_status",
  ]);
  const status = normalizeVideoStatus(rawStatus);
  const fileId = extractVideoString(data, [
    "file_id",
    "fileId",
    "data.file_id",
    "data.fileId",
  ]);

  if (status === "done" && fileId) {
    try {
      const videoUrl = await retrieveVideoUrl(fileId, config, {
        timeoutMs: DEFAULT_RETRIEVE_TIMEOUT,
      });
      return { status, fileId, videoUrl, rawStatus };
    } catch {
      return { status, fileId, rawStatus };
    }
  }

  return { status, fileId: fileId || undefined, rawStatus };
}

export async function retrieveVideoUrl(
  fileId: string,
  config: MiniMaxVideoConfig,
  options: { timeoutMs?: number } = {}
): Promise<string> {
  if (!fileId) throw new Error("EMPTY_MINIMAX_VIDEO_URL");
  if (!config.apiKey) throw new Error("MISSING_MINIMAX_API_KEY");

  const timeoutMs = options.timeoutMs ?? DEFAULT_RETRIEVE_TIMEOUT;

  const retrieveUrl = new URL(config.fileRetrieveUrl);
  retrieveUrl.searchParams.set("file_id", fileId);

  const data = await withRetry(
    () =>
      miniMaxFetch<unknown>(
        retrieveUrl.toString(),
        { method: "GET" },
        config,
        timeoutMs
      ),
    { maxRetries: 1 }
  );

  const videoUrl = extractVideoString(data, [
    "download_url",
    "downloadUrl",
    "file.download_url",
    "file.downloadUrl",
    "data.download_url",
    "data.downloadUrl",
    "data.file.download_url",
    "data.file.downloadUrl",
  ]);
  if (!videoUrl) throw new Error("EMPTY_MINIMAX_VIDEO_URL");
  return videoUrl;
}

export function normalizeVideoStatus(
  raw: unknown
): "queued" | "running" | "done" | "error" {
  const value = String(raw ?? "").toLowerCase();
  if (["success", "succeeded", "done", "completed"].includes(value)) {
    return "done";
  }
  if (["fail", "failed", "error"].includes(value)) return "error";
  if (["queueing", "queued", "pending", "preparing"].includes(value)) {
    return "queued";
  }
  return "running";
}

export function extractVideoString(obj: unknown, paths: string[]): string {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (!isRecord(current)) return undefined;
      return current[key];
    }, obj);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

export function toVideoFriendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("MISSING_MINIMAX_API_KEY")) {
    return "平台视频服务尚未配置。";
  }
  if (message.includes("TIMEOUT")) return "视频请求超时，请稍后重试。";
  if (message.includes("NETWORK")) return "网络连接异常，请稍后重试。";
  if (message.includes("401") || message.includes("403")) {
    return "API Key 权限不足或已过期。";
  }
  if (message.includes("429")) return "视频请求过于频繁，请稍后重试。";
  if (message.includes("EMPTY_MINIMAX_VIDEO_TASK_ID")) {
    return "视频任务创建失败，未获取到任务 ID。";
  }
  if (message.includes("EMPTY_MINIMAX_VIDEO_URL")) {
    return "视频已生成，但获取下载地址失败。";
  }
  return "视频生成失败，请稍后重试。";
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;

      const message = error instanceof Error ? error.message : "";
      const shouldRetry =
        message.includes("429") ||
        message.includes("500") ||
        message.includes("502") ||
        message.includes("503") ||
        message.includes("504") ||
        message.includes("NETWORK") ||
        message.includes("TIMEOUT");
      if (!shouldRetry) break;

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function miniMaxFetch<T>(
  url: string,
  init: RequestInit,
  config: MiniMaxVideoConfig,
  timeoutMs: number
): Promise<T> {
  if (!config.apiKey) throw new Error("MISSING_MINIMAX_API_KEY");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("MINIMAX_VIDEO_TIMEOUT");
    }
    throw new Error("MINIMAX_VIDEO_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `MINIMAX_VIDEO_API_ERROR:${response.status}:${detail.slice(0, 500)}`
    );
  }

  return response.json() as Promise<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
