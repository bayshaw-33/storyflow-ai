/**
 * TRAE-V2-05 Video Gateway — MiniMax 兼容 Adapter
 * 包装现有 lib/ai/video/minimax-adapter.ts，符合 VideoGatewayProvider 接口
 */

import { createMiniMaxProvider } from "@/lib/ai/video/minimax-adapter";
import type {
  VideoGatewayProvider,
  VideoGatewayProviderName,
  VideoGatewaySubmitInput,
  VideoGatewaySubmitResult,
  VideoGatewayPollResult,
} from "../types";

const PROVIDER_NAME: VideoGatewayProviderName = "minimax";
const DEFAULT_MODEL = "MiniMax-Hailuo-02";

export function createMiniMaxGatewayProvider(): VideoGatewayProvider {
  return {
    name: PROVIDER_NAME,
    defaultModel: DEFAULT_MODEL,
    isAvailable: () =>
      Boolean(
        process.env.MINIMAX_API_KEY ||
          process.env.MINIMAX_VIDEO_API_KEY ||
          process.env.MINIMAX_TOKEN,
      ),
    get unavailableReason() {
      const has =
        process.env.MINIMAX_API_KEY ||
        process.env.MINIMAX_VIDEO_API_KEY ||
        process.env.MINIMAX_TOKEN;
      return has ? undefined : "MINIMAX_API_KEY_MISSING";
    },

    async submit(
      input: VideoGatewaySubmitInput,
    ): Promise<VideoGatewaySubmitResult> {
      const minimax = createMiniMaxProvider();
      const result = await minimax.submit({
        prompt: input.prompt,
        firstframeUrl: input.firstframeUrl,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
      });
      return {
        providerTaskId: result.providerTaskId,
        provider: {
          name: PROVIDER_NAME,
          model: process.env.MINIMAX_VIDEO_MODEL || DEFAULT_MODEL,
        },
        raw: result.raw,
      };
    },

    async poll(providerTaskId: string): Promise<VideoGatewayPollResult> {
      const minimax = createMiniMaxProvider();
      const result = await minimax.poll(providerTaskId);
      return {
        status: result.status,
        videoUrl: result.videoUrl,
        rawStatus: result.rawStatus,
      };
    },
  };
}
