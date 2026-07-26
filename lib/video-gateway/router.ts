/**
 * TRAE-V2-05 Video Model Gateway V1
 * Provider Router：根据用户选择或 auto 路由选择 adapter
 *
 * "auto" 路由策略：按 AUTO_ROUTE_ORDER 选第一个可用的 provider
 */

import type { VideoGatewayProvider, VideoGatewayProviderName } from "./types";
import { VideoGatewayError } from "./types";
import { AUTO_ROUTE_ORDER, getProviderEntry } from "./catalog";

/**
 * 解析 provider。
 * - 传入具体 name：返回该 provider（不可用时抛 PROVIDER_UNAVAILABLE）
 * - 传入 "auto"：按 AUTO_ROUTE_ORDER 返回第一个可用的 provider
 */
export async function resolveVideoProvider(
  name: VideoGatewayProviderName | "auto",
): Promise<VideoGatewayProvider> {
  if (name === "auto") {
    for (const candidate of AUTO_ROUTE_ORDER) {
      const entry = getProviderEntry(candidate);
      if (entry?.available) {
        return await loadProvider(candidate);
      }
    }
    throw new VideoGatewayError(
      "PROVIDER_UNAVAILABLE",
      "当前没有任何可用的视频生成 Provider，请检查服务端配置。",
    );
  }

  const entry = getProviderEntry(name);
  if (!entry) {
    throw new VideoGatewayError(
      "INVALID_INPUT",
      `未知的 Provider: ${name}`,
    );
  }
  if (!entry.available) {
    throw new VideoGatewayError(
      "PROVIDER_UNAVAILABLE",
      `Provider ${entry.displayName} 当前不可用${
        entry.unavailableReason ? `（${entry.unavailableReason}）` : ""
      }。`,
      { provider: name, reason: entry.unavailableReason },
    );
  }
  return await loadProvider(name);
}

/** 动态加载 adapter 实现 */
async function loadProvider(
  name: VideoGatewayProviderName,
): Promise<VideoGatewayProvider> {
  switch (name) {
    case "atlas": {
      const mod = await import("./adapters/atlas");
      return mod.createAtlasGatewayProvider();
    }
    case "minimax": {
      const mod = await import("./adapters/minimax");
      return mod.createMiniMaxGatewayProvider();
    }
    case "runway": {
      const mod = await import("./adapters/runway");
      return mod.createRunwayGatewayProvider();
    }
    case "seedance": {
      const mod = await import("./adapters/seedance");
      return mod.createSeedanceGatewayProvider();
    }
    default:
      throw new VideoGatewayError(
        "INVALID_INPUT",
        `不支持的 Provider: ${name as string}`,
      );
  }
}
