/**
 * TRAE-V2-05 Video Gateway — Seedance 直连 Adapter
 *
 * 官方文档：https://www.volcengine.com/docs/82379/1520757
 * 鉴权：Bearer $ARK_API_KEY（火山方舟 API Key）
 *
 * 与 atlas adapter 的区别：
 *   atlas 通过 atlascloud 间接调用 Seedance；本 adapter 直连火山方舟 API
 *
 * 支持模型：doubao-seedance-2-0-* / doubao-seedance-1-5-pro-* / doubao-seedance-1-0-pro-*
 * 首期默认：doubao-seedance-2-0-260128（Seedance 2.0）
 *
 * 安全约束：
 * - API Key 只走环境变量，永不返回浏览器
 * - Provider 临时 URL（content.video_url）24h 后失效，调用方必须及时转存
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

const PROVIDER_NAME: VideoGatewayProviderName = "seedance";
const DEFAULT_MODEL = "doubao-seedance-2-0-260128";
const API_BASE = "https://ark.cn-beijing.volces.com/api/v3";

// ============================================================
// Seedance ratio 映射（内部 9:16/16:9/1:1 → Ark 支持的 ratio）
// ============================================================
const RATIO_MAP: Record<string, string> = {
  "16:9": "16:9",
  "9:16": "9:16",
  "1:1": "1:1",
};

// ============================================================
// Ark 任务状态映射
// ============================================================
const STATUS_MAP: Record<string, VideoGatewayPollStatus> = {
  queued: "queued",
  running: "running",
  succeeded: "done",
  failed: "error",
  cancelled: "cancelled",
  expired: "error", // 超时归为错误
};

// ============================================================
// 行类型
// ============================================================

type ArkContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string }; role?: string }
  | { type: "video_url"; video_url: { url: string }; role?: string }
  | { type: "audio_url"; audio_url: { url: string }; role?: string };

type ArkTaskCreateResponse = {
  id: string;
};

type ArkTaskQueryResponse = {
  id: string;
  model?: string;
  status?: string;
  error?: { code?: string; message?: string } | null;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  seed?: number;
  resolution?: string;
  ratio?: string;
  duration?: number;
  frames?: number;
  framespersecond?: number;
  service_tier?: string;
  usage?: {
    completion_tokens?: number;
    total_tokens?: number;
  };
  created_at?: number;
  updated_at?: number;
};

// ============================================================
// 工具函数
// ============================================================

function getApiKey(): string | undefined {
  return process.env.ARK_API_KEY || process.env.VOLC_ARK_API_KEY;
}

function getDefaultModel(): string {
  return process.env.SEEDANCE_VIDEO_MODEL || process.env.ARK_SEEDANCE_MODEL || DEFAULT_MODEL;
}

function mapStatus(rawStatus: string | undefined): VideoGatewayPollStatus {
  if (!rawStatus) return "queued";
  const mapped = STATUS_MAP[rawStatus.toLowerCase()];
  if (mapped) return mapped;
  return "running";
}

// ============================================================
// Provider 实现
// ============================================================

export function createSeedanceGatewayProvider(): VideoGatewayProvider {
  return {
    name: PROVIDER_NAME,
    defaultModel: getDefaultModel(),
    isAvailable: () => Boolean(getApiKey()),
    get unavailableReason() {
      return getApiKey() ? undefined : "ARK_API_KEY_MISSING";
    },

    async submit(
      input: VideoGatewaySubmitInput,
    ): Promise<VideoGatewaySubmitResult> {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new VideoGatewayError(
          "PROVIDER_UNAVAILABLE",
          "ARK_API_KEY 未配置（火山方舟 API Key）",
          { provider: PROVIDER_NAME },
        );
      }

      const model = getDefaultModel();
      const ratio = RATIO_MAP[input.aspectRatio || "9:16"] || "9:16";
      // Seedance duration 取值 2-10 秒（部分模型支持到 15s，保守用 10）
      const duration = Math.min(10, Math.max(2, Math.round(input.duration || 5)));

      // 构建 content 数组（文本 + 首帧图片）
      const content: ArkContentItem[] = [
        { type: "text", text: input.prompt },
        {
          type: "image_url",
          image_url: { url: input.firstframeUrl },
          role: "first_frame",
        },
      ];

      const body: Record<string, unknown> = {
        model,
        content,
        ratio,
        duration,
        // 默认不生成音频（V2 短剧音轨走 Voice Line TTS，避免重复）
        generate_audio: false,
        // 默认不加水印
        watermark: false,
        // 不返回尾帧（如需连续生成可由调用方在 providerParams 中开启）
        return_last_frame: Boolean(input.providerParams?.return_last_frame),
      };

      // seed 可选
      if (input.providerParams?.seed !== undefined) {
        const seed = Number(input.providerParams.seed);
        if (Number.isInteger(seed) && seed >= 0 && seed <= 4294967295) {
          body.seed = seed;
        }
      }

      // resolution 可选（720p/1080p/480p）
      if (typeof input.providerParams?.resolution === "string") {
        body.resolution = input.providerParams.resolution;
      }

      // service_tier 可选（default/flex）
      if (typeof input.providerParams?.service_tier === "string") {
        body.service_tier = input.providerParams.service_tier;
      }

      // callback_url 可选
      if (typeof input.providerParams?.callback_url === "string") {
        body.callback_url = input.providerParams.callback_url;
      }

      let resp: Response;
      try {
        resp = await fetch(`${API_BASE}/contents/generations/tasks`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("timeout") || msg.includes("Timeout")) {
          throw new VideoGatewayError(
            "PROVIDER_TIMEOUT",
            `Seedance 提交超时：${msg.slice(0, 200)}`,
            { provider: PROVIDER_NAME },
          );
        }
        throw new VideoGatewayError(
          "PROVIDER_CALL_FAILED",
          `Seedance 提交网络错误：${msg.slice(0, 200)}`,
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
          `Seedance 提交失败 HTTP ${resp.status}：${text.slice(0, 300)}`,
          { provider: PROVIDER_NAME, status: resp.status, body: text.slice(0, 500) },
        );
      }

      const data = (await resp.json()) as ArkTaskCreateResponse;
      if (!data.id) {
        throw new VideoGatewayError(
          "PROVIDER_CALL_FAILED",
          "Seedance 返回缺少 task id",
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
          "ARK_API_KEY 未配置",
          { provider: PROVIDER_NAME },
        );
      }

      let resp: Response;
      try {
        resp = await fetch(
          `${API_BASE}/contents/generations/tasks/${encodeURIComponent(providerTaskId)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("timeout") || msg.includes("Timeout")) {
          throw new VideoGatewayError(
            "PROVIDER_TIMEOUT",
            `Seedance 轮询超时：${msg.slice(0, 200)}`,
            { provider: PROVIDER_NAME, providerTaskId },
          );
        }
        throw new VideoGatewayError(
          "PROVIDER_CALL_FAILED",
          `Seedance 轮询网络错误：${msg.slice(0, 200)}`,
          { provider: PROVIDER_NAME, providerTaskId },
        );
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        if (resp.status === 404) {
          throw new VideoGatewayError(
            "JOB_NOT_FOUND",
            `Seedance 任务 ${providerTaskId} 不存在`,
            { provider: PROVIDER_NAME, providerTaskId },
          );
        }
        throw new VideoGatewayError(
          "PROVIDER_CALL_FAILED",
          `Seedance 轮询失败 HTTP ${resp.status}：${text.slice(0, 300)}`,
          { provider: PROVIDER_NAME, providerTaskId, status: resp.status },
        );
      }

      const data = (await resp.json()) as ArkTaskQueryResponse;
      const status = mapStatus(data.status);

      const result: VideoGatewayPollResult = {
        status,
        rawStatus: data.status,
      };

      // succeeded 时提取 video_url
      if (status === "done" && data.content?.video_url) {
        result.videoUrl = data.content.video_url;
        // 附加元信息
        result.metadata = {
          seed: data.seed,
          resolution: data.resolution,
          ratio: data.ratio,
          duration: data.duration,
          frames: data.frames,
          framespersecond: data.framespersecond,
          service_tier: data.service_tier,
          usage: data.usage,
          last_frame_url: data.content.last_frame_url,
        };
      }

      // failed 时附加错误信息
      if (status === "error" && data.error) {
        result.metadata = {
          errorCode: data.error.code,
          errorMessage: data.error.message,
        };
      }

      return result;
    },

    // Seedance 不支持主动 cancel，只能等过期
    // 不实现 cancel 方法，让 VideoGatewayProvider.cancel 为 undefined
  };
}
