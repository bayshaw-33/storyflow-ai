/**
 * TRAE-V2-05 Video Gateway — Atlas 兼容 Adapter
 * 包装现有 lib/ai/video/atlas.ts，符合 VideoGatewayProvider 接口
 */

import { createAtlasProvider } from "@/lib/ai/video/atlas";
import type {
  VideoGatewayProvider,
  VideoGatewayProviderName,
  VideoGatewaySubmitInput,
  VideoGatewaySubmitResult,
  VideoGatewayPollResult,
} from "../types";

const PROVIDER_NAME: VideoGatewayProviderName = "atlas";
const DEFAULT_MODEL = "bytedance/seedance-2.0/image-to-video";

export function createAtlasGatewayProvider(): VideoGatewayProvider {
  return {
    name: PROVIDER_NAME,
    defaultModel: DEFAULT_MODEL,
    isAvailable: () => Boolean(process.env.ATLASCLOUD_API_KEY),
    get unavailableReason() {
      return process.env.ATLASCLOUD_API_KEY
        ? undefined
        : "ATLASCLOUD_API_KEY_MISSING";
    },

    async submit(
      input: VideoGatewaySubmitInput,
    ): Promise<VideoGatewaySubmitResult> {
      const atlas = createAtlasProvider();
      const result = await atlas.submit({
        prompt: input.prompt,
        firstframeUrl: input.firstframeUrl,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
      });
      return {
        providerTaskId: result.providerTaskId,
        provider: {
          name: PROVIDER_NAME,
          model:
            process.env.ATLASCLOUD_VIDEO_MODEL || DEFAULT_MODEL,
        },
        raw: result.raw,
      };
    },

    async poll(providerTaskId: string): Promise<VideoGatewayPollResult> {
      const atlas = createAtlasProvider();
      const result = await atlas.poll(providerTaskId);
      return {
        status: result.status,
        videoUrl: result.videoUrl,
        rawStatus: result.rawStatus,
      };
    },
  };
}
