/**
 * Video provider 薄抽象层。
 *
 * 任务卡：KIIKIS-P3-TRAE-003 §1（视频 Provider 切换 Atlas Cloud）
 *
 * 三个能力：
 *   - submit: 提交视频生成任务，返回 provider task id
 *   - poll:   查询任务状态，done 时返回视频下载 URL（provider 临时 URL）
 *   - download: 把 provider 临时 URL 内容下载为 bytes，用于转存到自有 Storage
 *
 * 切换：env var VIDEO_PROVIDER=atlas|minimax（默认 atlas）
 * API key 只走环境变量，不入库、不进仓库、不打日志。
 */

import { createHash } from "node:crypto";

export type VideoProviderName = "atlas" | "minimax";

export type VideoSubmitInput = {
  prompt: string;
  /** 首帧图引用（已确认的分镜示意图 URL，由服务端解析） */
  firstframeUrl: string;
  /** 时长秒数，5 或 10 */
  duration?: number;
  /** 画幅，如 "16:9" / "9:16" / "1:1" */
  aspectRatio?: string;
};

export type VideoSubmitResult = {
  providerTaskId: string;
  /** 原始 provider 响应（仅用于调试日志，不含敏感字段） */
  raw: Record<string, unknown>;
};

export type VideoPollStatus = "queued" | "running" | "done" | "error";

export type VideoPollResult = {
  status: VideoPollStatus;
  /** done 时 provider 返回的视频临时 URL（需后续 download+转存） */
  videoUrl?: string;
  /** error 时的 provider 原始状态字符串 */
  rawStatus?: string;
};

export type VideoProvider = {
  readonly name: VideoProviderName;
  /** 提交任务 */
  submit(input: VideoSubmitInput): Promise<VideoSubmitResult>;
  /** 查询任务 */
  poll(providerTaskId: string): Promise<VideoPollResult>;
  /** 下载视频 bytes（用于转存到自有 Storage） */
  download(videoUrl: string): Promise<{ bytes: Uint8Array; contentType: string }>;
};

/**
 * 解析当前启用的 video provider。
 * 优先 env VIDEO_PROVIDER，默认 atlas。
 * API key 从对应 env var 读取，缺失时抛错（不入库）。
 */
export async function resolveVideoProvider(): Promise<VideoProvider> {
  const name = (process.env.VIDEO_PROVIDER || "atlas").toLowerCase() as VideoProviderName;
  if (name === "minimax") {
    const mod = await import("./minimax-adapter.ts");
    return mod.createMiniMaxProvider();
  }
  const mod = await import("./atlas.ts");
  return mod.createAtlasProvider();
}

/**
 * 计算 video job 幂等键 hash：sha256(shotId + prompt + firstframeUrl + duration)
 * 用于 DB 唯一约束（任务 2a），不依赖应用层 read-before-insert。
 */
export function computeVideoIdempotencyHash(input: {
  shotId: string;
  prompt: string;
  firstframeUrl: string;
  duration: number;
  provenanceHash?: string;
}): string {
  const parts = [input.shotId, input.prompt, input.firstframeUrl, String(input.duration), input.provenanceHash ?? ""];
  return createHash("sha256").update(parts.join("\u0001")).digest("hex");
}
