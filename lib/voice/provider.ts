/**
 * TTS Provider 抽象（TRAE-V2-03）
 *
 * 参考 lib/ai/video/provider.ts 的设计模式。
 * 安全约束（PRD §9）：
 * - API Key 只走环境变量，不入库、不进日志
 * - Provider 不可用时 isAvailable() 返回 false，UI 禁用按钮
 * - 不允许假成功：placeholder provider 必须抛 PROVIDER_UNAVAILABLE
 * - 临时 Provider URL 不进数据库长期字段
 */
import type { VoiceProviderName } from "./types";

// ============================================================
// 类型
// ============================================================

export type TTSSubmitInput = {
  text: string;
  voiceProviderVoiceId: string | null;
  language: string;
  speed: number;
  pitch: number;
  stability: number;
  stylePrompt: string;
  ssml?: string | null;
};

export type TTSSubmitResult =
  | {
      kind: "sync_done";
      audioBytes: Uint8Array;
      contentType: string;
      providerMetadata: Record<string, unknown>;
    }
  | {
      kind: "async_submitted";
      providerTaskId: string;
    };

export type TTSPollResult = {
  status: "queued" | "running" | "done" | "error";
  audioBytes?: Uint8Array;
  contentType?: string;
  providerMetadata?: Record<string, unknown>;
  error?: string;
};

export type TTSProvider = {
  readonly name: VoiceProviderName;
  isAvailable(): boolean;
  submit(input: TTSSubmitInput): Promise<TTSSubmitResult>;
  poll?(providerTaskId: string): Promise<TTSPollResult>;
};

// ============================================================
// Resolver
// ============================================================

/**
 * 解析当前配置的 TTS Provider。
 * - env TTS_PROVIDER 未设或为 'placeholder' 时返回 placeholder（不可用）
 * - env TTS_PROVIDER=openai 时返回 OpenAI TTS（V1.5 增量）
 *
 * 安全：本函数只在服务端调用，env 读取不进日志。
 */
export async function resolveTTSProvider(): Promise<TTSProvider> {
  const name = (process.env.TTS_PROVIDER || "placeholder").toLowerCase() as VoiceProviderName;

  if (name === "openai") {
    const mod = await import("./providers/openai");
    return mod.createOpenAITTSProvider();
  }

  // CosyVoice HTTP adapter（Phase 5 Task 5.4）：服务地址/凭证仅服务端环境变量
  if (name === "cosyvoice") {
    const mod = await import("./providers/cosyvoice");
    const baseUrl = process.env.COSYVOICE_BASE_URL || "";
    if (!baseUrl) {
      return (await import("./providers/placeholder")).createPlaceholderProvider();
    }
    return mod.createCosyVoiceProvider({
      baseUrl,
      token: process.env.COSYVOICE_API_TOKEN,
      model: process.env.COSYVOICE_MODEL,
    }) as unknown as TTSProvider;
  }

  // 默认 placeholder
  const mod = await import("./providers/placeholder");
  return mod.createPlaceholderProvider();
}

/**
 * 同步检查 TTS Provider 是否可用（不抛错）。
 * 用于 GET API 中返回 voiceProviderAvailable 给前端。
 */
export function isTTSProviderAvailable(): boolean {
  const name = (process.env.TTS_PROVIDER || "placeholder").toLowerCase();
  if (name === "placeholder" || !name) return false;
  if (name === "openai") {
    return Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_TTS_API_KEY);
  }
  if (name === "cosyvoice") {
    return Boolean(process.env.COSYVOICE_BASE_URL);
  }
  return false;
}

/**
 * 返回当前配置的 Provider 名称（不返回 key）。
 */
export function getCurrentTTSProviderName(): VoiceProviderName {
  const name = (process.env.TTS_PROVIDER || "placeholder").toLowerCase() as VoiceProviderName;
  return name;
}
