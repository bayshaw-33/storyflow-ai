/**
 * TRAE-V2-05 Video Gateway — Runway Adapter (STUB)
 *
 * 首期：仅提供接口框架，submit 时抛 PROVIDER_UNAVAILABLE
 * 后续接入：实现 Runway Gen-3/Gen-4 API 调用
 *
 * 官方文档：https://docs.runwayml.com/
 * 鉴权：Bearer $RUNWAY_API_KEY（环境变量）
 */

import type {
  VideoGatewayProvider,
  VideoGatewayProviderName,
  VideoGatewaySubmitInput,
  VideoGatewaySubmitResult,
  VideoGatewayPollResult,
} from "../types";
import { VideoGatewayError } from "../types";

const PROVIDER_NAME: VideoGatewayProviderName = "runway";
const DEFAULT_MODEL = "gen3a_turbo";

export function createRunwayGatewayProvider(): VideoGatewayProvider {
  return {
    name: PROVIDER_NAME,
    defaultModel: DEFAULT_MODEL,
    isAvailable: () => false,
    unavailableReason: "RUNWAY_ADAPTER_NOT_IMPLEMENTED",

    async submit(
      _input: VideoGatewaySubmitInput,
    ): Promise<VideoGatewaySubmitResult> {
      throw new VideoGatewayError(
        "PROVIDER_UNAVAILABLE",
        "Runway Adapter 首期仅作为框架占位，尚未实际接入。请使用 Atlas 或 MiniMax。",
        { provider: PROVIDER_NAME },
      );
    },

    async poll(
      _providerTaskId: string,
    ): Promise<VideoGatewayPollResult> {
      throw new VideoGatewayError(
        "PROVIDER_UNAVAILABLE",
        "Runway Adapter 首期仅作为框架占位，尚未实际接入。",
        { provider: PROVIDER_NAME },
      );
    },
  };
}
