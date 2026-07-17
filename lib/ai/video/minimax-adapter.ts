/**
 * MiniMax video provider adapter.
 *
 * 任务卡：KIIKIS-P3-TRAE-003 §1
 *
 * 把现有 lib/ai/video/minimax.ts（createVideoTask / queryVideoTask）包装为
 * VideoProvider 接口实现，作为可切换 provider 保留。
 * 对外 API 契约不变，前端零改动。
 */

import type {
  VideoProvider,
  VideoSubmitInput,
  VideoSubmitResult,
  VideoPollResult,
} from "./provider.ts";
import { getMiniMaxApiKey } from "../providers/minimax.ts";
import {
  createVideoTask,
  queryVideoTask,
  resolveMiniMaxVideoConfig,
} from "./minimax.ts";

async function resolveConfig() {
  // 复用 P2 已有的配置解析逻辑；apiKey 仍可来自 DB 或 env
  // 注意：env MINIMAX_API_KEY 是默认 fallback，DB 配置优先
  const dummyUserId = ""; // MiniMax adapter 在 server-side 调用，userId 由 route 层解析
  // 这里不做 DB 查询（adapter 不持有 userId），由 caller 通过 env 提供 MINIMAX_API_KEY
  void dummyUserId;
  const apiKey = getMiniMaxApiKey();
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY 未配置（环境变量缺失）。");
  }
  const model = process.env.MINIMAX_VIDEO_MODEL;
  const baseUrl = process.env.MINIMAX_BASE_URL;
  return resolveMiniMaxVideoConfig({ apiKey, model, baseUrl });
}

export function createMiniMaxProvider(): VideoProvider {
  return {
    name: "minimax",

    async submit(input: VideoSubmitInput): Promise<VideoSubmitResult> {
      const config = await resolveConfig();
      const result = await createVideoTask(
        {
          prompt: input.prompt,
          imageUrl: input.firstframeUrl,
          duration: input.duration,
        },
        config,
      );
      return {
        providerTaskId: result.taskId,
        raw: { status: result.status },
      };
    },

    async poll(providerTaskId: string): Promise<VideoPollResult> {
      const config = await resolveConfig();
      const result = await queryVideoTask(providerTaskId, config);
      return {
        status: result.status,
        videoUrl: result.videoUrl,
        rawStatus: result.rawStatus,
      };
    },

    async download(videoUrl: string): Promise<{ bytes: Uint8Array; contentType: string }> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        const response = await fetch(videoUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`MINIMAX_DOWNLOAD_HTTP_${response.status}`);
        }
        const contentType = response.headers.get("content-type") || "video/mp4";
        const buf = await response.arrayBuffer();
        return { bytes: new Uint8Array(buf), contentType };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
