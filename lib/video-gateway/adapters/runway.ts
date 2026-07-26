/**
 * TRAE-V2-05 Video Gateway — Runway Adapter
 *
 * 官方文档：https://docs.dev.runwayml.com/api/
 * 鉴权：Bearer $RUNWAY_API_KEY + X-Runway-Version: 2024-11-06
 *
 * 支持模型：gen4.5 / gen4_turbo / veo3.1 / veo3.1_fast / seedance2 等
 * 首期默认：gen4_turbo（性价比 + 速度均衡）
 *
 * 安全约束：
 * - API Key 只走环境变量，永不返回浏览器
 * - Provider 临时 URL 不入库，只在 poll 结果中返回 videoUrl 由调用方转存
 */

import type {
  VideoGatewayProvider,
  VideoGatewayProviderName,
  VideoGatewaySubmitInput,
  VideoGatewaySubmitResult,
  VideoGatewayPollResult,
  VideoGatewayPollStatus,
} from "../types.ts";
import { VideoGatewayError } from "../types.ts";

const PROVIDER_NAME: VideoGatewayProviderName = "runway";
const DEFAULT_MODEL = "gen4_turbo";
const API_BASE = "https://api.dev.runwayml.com/v1";
const API_VERSION = "2024-11-06";

// ============================================================
// Runway ratio 映射（我们内部的 9:16/16:9/1:1 → Runway ratio）
// ============================================================
const RATIO_MAP: Record<string, string> = {
  "16:9": "1280:720",
  "9:16": "720:1280",
  "1:1": "960:960",
};

// ============================================================
// Runway 状态映射
// ============================================================
const STATUS_MAP: Record<string, VideoGatewayPollStatus> = {
  PENDING: "queued",
  THROTTLED: "queued",
  RUNNING: "running",
  SUCCEEDED: "done",
  FAILED: "error",
  CANCELLED: "cancelled",
};

// ============================================================
// 行类型
// ============================================================
type RunwayTaskResponse = {
  id: string;
  status?: string;
  failureCode?: string;
  failure?: string;
  output?: string[];
  progressText?: string;
  createdAt?: string;
  updatedAt?: string;
};

// ============================================================
// 工具函数
// ============================================================

function getApiKey(): string | undefined {
  return process.env.RUNWAY_API_KEY;
}

function getDefaultModel(): string {
  return process.env.RUNWAY_VIDEO_MODEL || DEFAULT_MODEL;
}

function mapStatus(rawStatus: string | undefined): VideoGatewayPollStatus {
  if (!rawStatus) return "queued";
  const mapped = STATUS_MAP[rawStatus.toUpperCase()];
  if (mapped) return mapped;
  // 未知状态保守归为 running（避免误判为失败）
  return "running";
}

// ============================================================
// Provider 实现
// ============================================================

export function createRunwayGatewayProvider(): VideoGatewayProvider {
  return {
    name: PROVIDER_NAME,
    defaultModel: getDefaultModel(),
    isAvailable: () => Boolean(getApiKey()),
    get unavailableReason() {
      return getApiKey() ? undefined : "RUNWAY_API_KEY_MISSING";
    },

    async submit(
      input: VideoGatewaySubmitInput,
    ): Promise<VideoGatewaySubmitResult> {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new VideoGatewayError(
          "PROVIDER_UNAVAILABLE",
          "RUNWAY_API_KEY 未配置",
          { provider: PROVIDER_NAME },
        );
      }

      const model = process.env.RUNWAY_VIDEO_MODEL || DEFAULT_MODEL;
      const ratio = RATIO_MAP[input.aspectRatio || "9:16"] || "720:1280";
      // Runway duration 取值 2-10 秒（整数）
      const duration = Math.min(10, Math.max(2, Math.round(input.duration || 5)));

      const body: Record<string, unknown> = {
        model,
        promptText: input.prompt,
        promptImage: input.firstframeUrl,
        ratio,
        duration,
        position: "first", // 首帧驱动
      };

      // seed 可选
      if (input.providerParams?.seed !== undefined) {
        const seed = Number(input.providerParams.seed);
        if (Number.isInteger(seed) && seed >= 0 && seed <= 4294967295) {
          body.seed = seed;
        }
      }

      let resp: Response;
      try {
        resp = await fetch(`${API_BASE}/image_to_video`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-Runway-Version": API_VERSION,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("timeout") || msg.includes("Timeout")) {
          throw new VideoGatewayError(
            "PROVIDER_TIMEOUT",
            `Runway 提交超时：${msg.slice(0, 200)}`,
            { provider: PROVIDER_NAME },
          );
        }
        throw new VideoGatewayError(
          "PROVIDER_CALL_FAILED",
          `Runway 提交网络错误：${msg.slice(0, 200)}`,
          { provider: PROVIDER_NAME },
        );
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const errorCode = resp.status === 401 || resp.status === 403
          ? "PROVIDER_UNAVAILABLE"
          : resp.status === 429
            ? "PROVIDER_UNAVAILABLE"
            : "PROVIDER_CALL_FAILED";
        throw new VideoGatewayError(
          errorCode,
          `Runway 提交失败 HTTP ${resp.status}：${text.slice(0, 300)}`,
          { provider: PROVIDER_NAME, status: resp.status, body: text.slice(0, 500) },
        );
      }

      const data = (await resp.json()) as { id?: string };
      if (!data.id) {
        throw new VideoGatewayError(
          "PROVIDER_CALL_FAILED",
          "Runway 返回缺少 task id",
          { provider: PROVIDER_NAME, raw: data },
        );
      }

      return {
        providerTaskId: data.id,
        provider: {
          name: PROVIDER_NAME,
          model,
        },
        raw: data as Record<string, unknown>,
      };
    },

    async poll(providerTaskId: string): Promise<VideoGatewayPollResult> {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new VideoGatewayError(
          "PROVIDER_UNAVAILABLE",
          "RUNWAY_API_KEY 未配置",
          { provider: PROVIDER_NAME },
        );
      }

      let resp: Response;
      try {
        resp = await fetch(`${API_BASE}/tasks/${providerTaskId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "X-Runway-Version": API_VERSION,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("timeout") || msg.includes("Timeout")) {
          throw new VideoGatewayError(
            "PROVIDER_TIMEOUT",
            `Runway 轮询超时：${msg.slice(0, 200)}`,
            { provider: PROVIDER_NAME, providerTaskId },
          );
        }
        throw new VideoGatewayError(
          "PROVIDER_CALL_FAILED",
          `Runway 轮询网络错误：${msg.slice(0, 200)}`,
          { provider: PROVIDER_NAME, providerTaskId },
        );
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        if (resp.status === 404) {
          throw new VideoGatewayError(
            "JOB_NOT_FOUND",
            `Runway 任务 ${providerTaskId} 不存在`,
            { provider: PROVIDER_NAME, providerTaskId },
          );
        }
        throw new VideoGatewayError(
          "PROVIDER_CALL_FAILED",
          `Runway 轮询失败 HTTP ${resp.status}：${text.slice(0, 300)}`,
          { provider: PROVIDER_NAME, providerTaskId, status: resp.status },
        );
      }

      const data = (await resp.json()) as RunwayTaskResponse;
      const status = mapStatus(data.status);

      const result: VideoGatewayPollResult = {
        status,
        rawStatus: data.status,
      };

      // succeeded 时提取 output video URL
      if (status === "done" && Array.isArray(data.output) && data.output.length > 0) {
        result.videoUrl = data.output[0];
      }

      // failed 时附加错误信息到 metadata
      if (status === "error" && (data.failureCode || data.failure)) {
        result.metadata = {
          failureCode: data.failureCode,
          failure: data.failure,
        };
      }

      return result;
    },

    async cancel(providerTaskId: string): Promise<boolean> {
      const apiKey = getApiKey();
      if (!apiKey) return false;

      try {
        const resp = await fetch(`${API_BASE}/tasks/${providerTaskId}/cancel`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "X-Runway-Version": API_VERSION,
            "Content-Type": "application/json",
          },
        });
        return resp.ok || resp.status === 409; // 409 = 已是终态
      } catch {
        return false;
      }
    },
  };
}
