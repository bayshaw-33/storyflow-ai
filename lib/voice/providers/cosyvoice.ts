/**
 * KIIKIS V2.2 CosyVoice HTTP provider adapter — Phase 5 Task 5.4.
 *
 * 只暴露 KIIKIS 领域输入输出；服务地址和凭证仅从服务端环境变量读取
 * （COSYVOICE_BASE_URL / COSYVOICE_API_TOKEN），绝不入库、不进日志。
 *
 * 适配官方 FastAPI/gRPC 风格 HTTP 服务：
 *   POST /api/v1/tasks   → { task_id, status }
 *   GET  /api/v1/tasks/:id → { status: running|completed|failed, audio_url?, error? }
 *   GET  /health
 *
 * 超时/失败/重试映射为类型化错误；临时 URL 只用于 ingestion。
 */

import type { VoiceProviderName } from "../types.ts";

export interface VoiceProviderInput {
  text: string;
  language: string;
  emotion?: string;
  speed?: number;
  voiceRef?: string;
}

export interface VoiceProviderSubmitResult {
  providerTaskId: string;
}

export interface VoiceProviderPollResult {
  status: "running" | "completed" | "failed";
  temporaryUrl?: string;
  error?: string;
}

export interface VoiceProvider {
  readonly name: VoiceProviderName;
  submit(input: VoiceProviderInput): Promise<VoiceProviderSubmitResult>;
  poll(providerTaskId: string): Promise<VoiceProviderPollResult>;
  cancel?(providerTaskId: string): Promise<void>;
  health(): Promise<boolean>;
  readonly lastMetadata?: Record<string, unknown>;
}

export class CosyVoiceProviderError extends Error {
  readonly code: "timeout" | "unauthorized" | "service_unavailable" | "validation_failed" | "network";
  constructor(code: CosyVoiceProviderError["code"], message: string) {
    super(message);
    this.name = "CosyVoiceProviderError";
    this.code = code;
  }
}

export interface CosyVoiceProviderOptions {
  baseUrl: string;
  token?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface TaskResponse {
  task_id?: string;
  status?: string;
  audio_url?: string;
  error?: string;
  model?: string;
}

export function createCosyVoiceProvider(options: CosyVoiceProviderOptions): VoiceProvider {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const token = options.token ?? "";
  const model = options.model ?? "";
  const timeoutMs = options.timeoutMs ?? 30_000;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  let lastMetadata: Record<string, unknown> | undefined;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const effectiveInit: RequestInit = { ...init };
    if (controller) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
      effectiveInit.signal = controller.signal;
    }
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...effectiveInit,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
      if (response.status === 401 || response.status === 403) {
        throw new CosyVoiceProviderError("unauthorized", `CosyVoice auth failed (${response.status}).`);
      }
      if (!response.ok) {
        throw new CosyVoiceProviderError("service_unavailable", `CosyVoice returned ${response.status}.`);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (controller?.signal.aborted) {
        throw new CosyVoiceProviderError("timeout", `CosyVoice request timed out after ${timeoutMs}ms.`);
      }
      const err = error as Error;
      if (err.name === "TimeoutError" || err.message.includes("timeout")) {
        throw new CosyVoiceProviderError("timeout", `CosyVoice request timed out after ${timeoutMs}ms.`);
      }
      if (error instanceof CosyVoiceProviderError) throw error;
      throw new CosyVoiceProviderError("network", `CosyVoice unreachable: ${err.message}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    name: "cosyvoice" as VoiceProviderName,

    async submit(input: VoiceProviderInput): Promise<VoiceProviderSubmitResult> {
      const body: Record<string, unknown> = {
        text: input.text,
        language: input.language,
      };
      if (input.emotion) body.emotion = input.emotion;
      if (input.speed !== undefined) body.speed = input.speed;
      if (input.voiceRef) body.voice_ref = input.voiceRef;
      if (model) body.model = model;
      const task = await request<TaskResponse>("/api/v1/tasks", { method: "POST", body: JSON.stringify(body) });
      if (!task.task_id) {
        throw new CosyVoiceProviderError("service_unavailable", "CosyVoice did not return a task id.");
      }
      lastMetadata = { model: model || task.model || null, params: { ...body }, taskStatus: task.status ?? null };
      return { providerTaskId: task.task_id };
    },

    async poll(providerTaskId: string): Promise<VoiceProviderPollResult> {
      const task = await request<TaskResponse>(`/api/v1/tasks/${encodeURIComponent(providerTaskId)}`);
      if (task.status === "completed") {
        return { status: "completed", temporaryUrl: task.audio_url };
      }
      if (task.status === "failed") {
        return { status: "failed", error: task.error ?? "CosyVoice synthesis failed." };
      }
      return { status: "running" };
    },

    async cancel(providerTaskId: string): Promise<void> {
      await request<unknown>(`/api/v1/tasks/${encodeURIComponent(providerTaskId)}`, { method: "DELETE" });
    },

    async health(): Promise<boolean> {
      try {
        await request<{ ok?: boolean }>("/health");
        return true;
      } catch {
        return false;
      }
    },

    get lastMetadata() {
      return lastMetadata;
    },
  };
}
