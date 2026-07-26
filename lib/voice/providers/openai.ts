/**
 * OpenAI TTS Provider（TRAE-V2-03 V1.5）
 *
 * 同步 Provider：POST /v1/audio/speech 直接返回 audio bytes。
 *
 * 安全约束：
 * - API Key 只读 env（OPENAI_API_KEY 或 OPENAI_TTS_API_KEY），不入库
 * - 临时 URL 永不返回（同步返回 bytes）
 * - 失败抛错，不允许假成功
 *
 * 环境变量：
 * - OPENAI_API_KEY 或 OPENAI_TTS_API_KEY
 * - OPENAI_TTS_MODEL（默认 'tts-1'）
 */
import type { TTSProvider, TTSSubmitInput, TTSSubmitResult } from "../provider";

export function createOpenAITTSProvider(): TTSProvider {
  return {
    name: "openai",
    isAvailable: () =>
      Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_TTS_API_KEY),
    async submit(input: TTSSubmitInput): Promise<TTSSubmitResult> {
      const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_TTS_API_KEY;
      if (!apiKey) {
        throw new Error("PROVIDER_UNAVAILABLE:OPENAI_TTS_API_KEY not configured");
      }

      const model = process.env.OPENAI_TTS_MODEL || "tts-1";
      const voice = input.voiceProviderVoiceId || "alloy"; // alloy/echo/fable/onyx/nova/shimmer
      const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com";

      const response = await fetch(`${baseUrl}/v1/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: input.text,
          voice,
          response_format: "mp3",
          speed: input.speed,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const reason = detail.slice(0, 200);
        if (response.status === 401 || response.status === 403) {
          throw new Error(`PROVIDER_UNAVAILABLE:OpenAI auth failed (${response.status})`);
        }
        if (response.status === 429) {
          throw new Error(`PROVIDER_TIMEOUT:OpenAI rate limited (429)`);
        }
        throw new Error(`OPENAI_TTS_HTTP_${response.status}:${reason}`);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0) {
        throw new Error("OPENAI_TTS_EMPTY_RESPONSE");
      }

      return {
        kind: "sync_done",
        audioBytes: bytes,
        contentType: "audio/mpeg",
        providerMetadata: {
          model,
          voice,
          provider: "openai",
          byteLength: bytes.byteLength,
        },
      };
    },
  };
}
