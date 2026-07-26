/**
 * TRAE-V2-05 Video Gateway — Seedance 直连 Adapter (STUB)
 *
 * 首期：仅提供接口框架，submit 时抛 PROVIDER_UNAVAILABLE
 * 与 atlas adapter 的区别：atlas 通过 atlascloud 间接调用 Seedance；
 *   本 adapter 直连火山引擎 API
 *
 * 官方文档：https://www.volcengine.com/docs/6791
 * 鉴权：Volc Engine AK/SK（环境变量 VOLC_ACCESS_KEY / VOLC_SECRET_KEY）
 */

import type {
  VideoGatewayProvider,
  VideoGatewayProviderName,
  VideoGatewaySubmitInput,
  VideoGatewaySubmitResult,
  VideoGatewayPollResult,
} from "../types";
import { VideoGatewayError } from "../types";

const PROVIDER_NAME: VideoGatewayProviderName = "seedance";
const DEFAULT_MODEL = "seedance-2.0";

export function createSeedanceGatewayProvider(): VideoGatewayProvider {
  return {
    name: PROVIDER_NAME,
    defaultModel: DEFAULT_MODEL,
    isAvailable: () => false,
    unavailableReason: "SEEDANCE_DIRECT_ADAPTER_NOT_IMPLEMENTED",

    async submit(
      _input: VideoGatewaySubmitInput,
    ): Promise<VideoGatewaySubmitResult> {
      throw new VideoGatewayError(
        "PROVIDER_UNAVAILABLE",
        "火山引擎 Seedance 直连 Adapter 首期仅作为框架占位。如需使用 Seedance，请选择 Atlas（通过 atlascloud 间接调用）。",
        { provider: PROVIDER_NAME },
      );
    },

    async poll(
      _providerTaskId: string,
    ): Promise<VideoGatewayPollResult> {
      throw new VideoGatewayError(
        "PROVIDER_UNAVAILABLE",
        "火山引擎 Seedance 直连 Adapter 首期仅作为框架占位。",
        { provider: PROVIDER_NAME },
      );
    },
  };
}
