/**
 * TRAE-V2-05 Video Model Gateway V1
 * Job Lifecycle：状态机 + 幂等 + 转存
 *
 * 复用现有 storyflow_generation_jobs 表（不新建 video_jobs）
 * 细粒度子状态通过 result_metadata.sub_status 承载
 *
 * 状态流转：
 *   queued (sub=draft) → queued (sub=pending_confirm)
 *   → queued (sub=queued) → running (sub=generating)
 *   → running (sub=result_ingesting) → completed (sub=completed)
 *   失败分支：→ failed (sub=partial_failure/failed/moderation_blocked/expired/provider_timeout)
 *   取消分支：→ cancelled (sub=cancel_requested → cancelled)
 */

import { createHash } from "node:crypto";
import type {
  VideoGatewayPollResult,
  VideoJobStatus,
  VideoJobSubStatus,
} from "./types";
import { VideoGatewayError } from "./types";

/** 主状态 → 是否终态 */
export function isTerminalStatus(status: VideoJobStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

/** 主状态 → 是否可取消 */
export function isCancellableStatus(status: VideoJobStatus): boolean {
  return status === "queued" || status === "running";
}

/** 主状态 → 是否可重试 */
export function isRetryableStatus(status: VideoJobStatus): boolean {
  return status === "failed" || status === "cancelled";
}

/** 主状态 → 是否可查询 */
export function isQueryableStatus(status: VideoJobStatus): boolean {
  return status === "queued" || status === "running";
}

/**
 * 将 provider poll 结果映射为 generation_jobs 主状态
 */
export function mapPollToJobStatus(
  poll: VideoGatewayPollResult,
): { status: VideoJobStatus; subStatus: VideoJobSubStatus } {
  switch (poll.status) {
    case "queued":
      return { status: "queued", subStatus: "queued" };
    case "running":
      return { status: "running", subStatus: "generating" };
    case "done":
      // done 不直接到 completed，需要先 result_ingesting
      return { status: "running", subStatus: "result_ingesting" };
    case "cancelled":
      return { status: "cancelled", subStatus: "cancelled" };
    case "error":
      // 区分 timeout vs moderation vs generic failure
      const raw = (poll.rawStatus || "").toLowerCase();
      if (raw.includes("timeout") || raw.includes("expired")) {
        return { status: "failed", subStatus: "provider_timeout" };
      }
      if (raw.includes("moderation") || raw.includes("blocked")) {
        return { status: "failed", subStatus: "moderation_blocked" };
      }
      return { status: "failed", subStatus: "failed" };
    default:
      throw new VideoGatewayError(
        "INVALID_INPUT",
        `未知的 provider poll status: ${poll.status as string}`,
      );
  }
}

/**
 * 计算视频生成幂等键 hash
 * sha256(ownerId + projectId + shotId + prompt + firstframeUrl + duration + provider)
 * 用于 DB 唯一约束，防止重复提交
 */
export function computeVideoJobIdempotencyHash(input: {
  ownerId: string;
  projectId: string;
  shotId: string;
  prompt: string;
  firstframeUrl: string;
  duration: number;
  provider: string;
}): string {
  const parts = [
    input.ownerId,
    input.projectId,
    input.shotId,
    input.prompt,
    input.firstframeUrl,
    String(input.duration),
    input.provider,
  ];
  return createHash("sha256").update(parts.join("\u0001")).digest("hex");
}

/** 判断是否为重复 in-flight job（未终态） */
export function isInFlight(status: VideoJobStatus): boolean {
  return status === "queued" || status === "running";
}

/**
 * 估算视频生成时长（秒），仅用于 UI 显示
 * 实际时长取决于 provider，这里给一个保守上限
 */
export function estimateDurationSeconds(provider: string): number {
  switch (provider) {
    case "atlas":
      return 120; // 2 min
    case "minimax":
      return 90; // 1.5 min
    case "runway":
      return 180; // 3 min
    case "seedance":
      return 120;
    default:
      return 120;
  }
}
