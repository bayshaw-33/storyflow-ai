/**
 * TRAE-V2-05 Video Model Gateway V1
 * Provider Catalog：UI 展示用元信息
 *
 * 不暴露 API Key、Secret 或内部端点
 */

import type { ProviderCatalogEntry, VideoGatewayProviderName } from "./types";

/** 所有支持的 Provider 元信息（静态） */
export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    name: "atlas",
    displayName: "Atlas Cloud",
    description: "通过 Atlas Cloud 调用 Seedance 等模型（兼容路径）",
    capabilities: ["image-to-video", "first-frame"],
    available: false, // 运行时根据 env 动态填充
    defaultModel: "bytedance/seedance-2.0/image-to-video",
    tags: ["9:16", "5s/10s", "兼容"],
  },
  {
    name: "minimax",
    displayName: "MiniMax Hailuo",
    description: "MiniMax Hailuo-02 视频生成",
    capabilities: ["text-to-video", "image-to-video"],
    available: false,
    defaultModel: "MiniMax-Hailuo-02",
    tags: ["9:16", "5s", "国产"],
  },
  {
    name: "runway",
    displayName: "Runway",
    description: "Runway Gen-4 / Gen-4.5 视频生成（支持图生视频、首帧驱动）",
    capabilities: ["image-to-video", "text-to-video", "first-frame"],
    available: false,
    defaultModel: "gen4_turbo",
    tags: ["海外", "高质感", "gen4"],
  },
  {
    name: "seedance",
    displayName: "火山引擎 Seedance",
    description: "火山引擎 Seedance 2.0 直连（Ark API，支持图生视频首帧）",
    capabilities: ["image-to-video", "text-to-video", "first-frame"],
    available: false,
    defaultModel: "doubao-seedance-2-0-260128",
    tags: ["国产", "直连", "Ark"],
  },
];

/** 获取 catalog（available 字段运行时填充） */
export function getProviderCatalog(): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG.map((entry) => ({
    ...entry,
    available: computeAvailability(entry.name),
  }));
}

/** 获取单个 provider 的 catalog entry */
export function getProviderEntry(
  name: VideoGatewayProviderName,
): ProviderCatalogEntry | null {
  const entry = PROVIDER_CATALOG.find((e) => e.name === name);
  if (!entry) return null;
  return { ...entry, available: computeAvailability(entry.name) };
}

/** 运行时根据环境变量判断 provider 是否可用 */
function computeAvailability(name: VideoGatewayProviderName): boolean {
  switch (name) {
    case "atlas":
      return Boolean(process.env.ATLASCLOUD_API_KEY);
    case "minimax":
      return Boolean(
        process.env.MINIMAX_API_KEY ||
          process.env.MINIMAX_VIDEO_API_KEY ||
          process.env.MINIMAX_TOKEN,
      );
    case "runway":
      return Boolean(process.env.RUNWAY_API_KEY);
    case "seedance":
      return Boolean(process.env.ARK_API_KEY || process.env.VOLC_ARK_API_KEY);
    default:
      return false;
  }
}

/** 推荐顺序（"auto" 路由时按此顺序选择第一个可用的） */
export const AUTO_ROUTE_ORDER: VideoGatewayProviderName[] = [
  "atlas",
  "minimax",
  "seedance",
  "runway",
];
