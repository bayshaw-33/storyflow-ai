/**
 * Placeholder TTS Provider（TRAE-V2-03）
 *
 * 默认 Provider，isAvailable() 永远返回 false。
 * 所有 submit 调用抛 PROVIDER_UNAVAILABLE。
 *
 * 符合 PRD："不允许假成功"+"Provider 不可用时禁用按钮"。
 */
import type { TTSProvider, TTSSubmitInput, TTSSubmitResult } from "../provider";

export function createPlaceholderProvider(): TTSProvider {
  return {
    name: "placeholder",
    isAvailable: () => false,
    async submit(_input: TTSSubmitInput): Promise<TTSSubmitResult> {
      throw new Error(
        "PROVIDER_UNAVAILABLE:TTS provider not configured. Set TTS_PROVIDER env var (e.g. 'openai').",
      );
    },
  };
}
