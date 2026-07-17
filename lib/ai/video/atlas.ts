/**
 * Atlas Cloud video provider.
 *
 * 任务卡：KIIKIS-P3-TRAE-003 §1
 *
 * 链路：
 *   1. POST /model/uploadMedia（首帧）→ 拿 mediaId
 *   2. POST /model/generateVideo (model="bytedance/seedance-2.0/image-to-video",
 *      duration 5/10, aspect_ratio 跟项目画幅) → 拿 prediction id
 *   3. GET /model/prediction/{id} 每 5s 轮询，done 时取 data.outputs[0] 或 data.output.video_url
 *
 * Base URL: https://api.atlascloud.ai/api/v1
 * Auth: Bearer $ATLASCLOUD_API_KEY（只走环境变量，不入库/不进仓库/不打日志）
 *
 * 响应字段兼容：
 *   - submit: data.id | data.request_id | request_id | id
 *   - poll:    data.outputs[0] | data.output.video_url | data.video_url | output_url
 */

import type {
  VideoProvider,
  VideoSubmitInput,
  VideoSubmitResult,
  VideoPollResult,
} from "./provider";

const ATLAS_BASE_URL = "https://api.atlascloud.ai/api/v1";
const DEFAULT_MODEL = "bytedance/seedance-2.0/image-to-video";
const DEFAULT_TIMEOUT_MS = 90_000;

type AtlasConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

function resolveConfig(): AtlasConfig {
  const apiKey = process.env.ATLASCLOUD_API_KEY;
  if (!apiKey) {
    throw new Error("ATLASCLOUD_API_KEY 未配置（环境变量缺失）。");
  }
  return {
    apiKey,
    baseUrl: process.env.ATLASCLOUD_BASE_URL || ATLAS_BASE_URL,
    model: process.env.ATLASCLOUD_VIDEO_MODEL || DEFAULT_MODEL,
  };
}

async function atlasFetch(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${resolveConfig().apiKey}`,
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      const rawError =
        typeof body === "object" && body && typeof (body as Record<string, unknown>).error === "string"
          ? (body as Record<string, unknown>).error as string
          : `Atlas HTTP ${response.status}`;
      const message = typeof rawError === "string" ? rawError.slice(0, 200) : String(rawError).slice(0, 200);
      throw new Error(`ATLAS_HTTP_ERROR:${response.status}:${message}`);
    }
    return (body || {}) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function extractString(obj: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const key of path) {
      if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[key];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === "string" && cur) return cur;
  }
  return undefined;
}

function mapStatus(raw: unknown): VideoPollResult["status"] {
  if (typeof raw !== "string") return "running";
  const s = raw.toLowerCase();
  if (s === "succeeded" || s === "completed" || s === "done") return "done";
  if (s === "failed" || s === "error" || s === "canceled") return "error";
  if (s === "processing" || s === "running" || s === "queued") return "running";
  return "running";
}

export function createAtlasProvider(): VideoProvider {
  return {
    name: "atlas",

    async submit(input: VideoSubmitInput): Promise<VideoSubmitResult> {
      const cfg = resolveConfig();
      if (!input.prompt?.trim()) throw new Error("ATLAS_SUBMIT_NO_PROMPT");
      if (!input.firstframeUrl?.trim()) throw new Error("ATLAS_SUBMIT_NO_FIRSTFRAME");

      // 1. upload firstframe → mediaId
      //    POST /model/uploadMedia, body: { type: "image", url: firstframeUrl }
      const uploadBody = { type: "image", url: input.firstframeUrl };
      const uploadResp = await atlasFetch(`${cfg.baseUrl}/model/uploadMedia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(uploadBody),
      });
      const mediaId =
        extractString(uploadResp, [["data", "id"], ["data", "mediaId"], ["id"], ["mediaId"]]) ||
        extractString(uploadResp, [["data", "request_id"], ["request_id"]]);
      if (!mediaId) {
        throw new Error("ATLAS_UPLOAD_NO_MEDIA_ID");
      }

      // 2. generateVideo
      const duration = input.duration === 10 ? 10 : 5;
      const aspectRatio = input.aspectRatio || "16:9";
      const genBody = {
        model: cfg.model,
        image: mediaId,
        prompt: input.prompt,
        duration,
        aspect_ratio: aspectRatio,
      };
      const genResp = await atlasFetch(`${cfg.baseUrl}/model/generateVideo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(genBody),
      });
      const providerTaskId =
        extractString(genResp, [["data", "id"], ["data", "request_id"], ["id"], ["request_id"]]);
      if (!providerTaskId) {
        throw new Error("ATLAS_GENERATE_NO_TASK_ID");
      }
      return { providerTaskId, raw: genResp };
    },

    async poll(providerTaskId: string): Promise<VideoPollResult> {
      const cfg = resolveConfig();
      const resp = await atlasFetch(
        `${cfg.baseUrl}/model/prediction/${encodeURIComponent(providerTaskId)}`,
        { method: "GET" },
        30_000,
      );
      const rawStatus = extractString(resp, [["data", "status"], ["status"]]) || "running";
      const status = mapStatus(rawStatus);
      if (status === "done") {
        // 兼容多种响应字段，优先级：data.outputs[0] → data.output.video_url → data.video_url → output_url → video_url
        const data = resp.data as Record<string, unknown> | undefined;
        // 1. data.outputs[0] 可能是 string 或 { url } 或 { video_url }
        if (Array.isArray(data?.outputs) && data!.outputs.length > 0) {
          const first = (data!.outputs as unknown[])[0];
          if (typeof first === "string" && first) {
            return { status, videoUrl: first, rawStatus };
          }
          if (first && typeof first === "object") {
            const u = extractString(first, [["url"], ["video_url"]]);
            if (u) return { status, videoUrl: u, rawStatus };
          }
        }
        // 2. 其他字段路径
        const videoUrl =
          extractString(resp, [["data", "output", "video_url"]]) ||
          extractString(resp, [["data", "video_url"]]) ||
          extractString(resp, [["output_url"]]) ||
          extractString(resp, [["video_url"]]);
        if (videoUrl) {
          return { status, videoUrl, rawStatus };
        }
        // 3. done 但没拿到 URL，视作 error
        return { status: "error", rawStatus: `${rawStatus}:NO_VIDEO_URL` };
      }
      return { status, rawStatus };
    },

    async download(videoUrl: string): Promise<{ bytes: Uint8Array; contentType: string }> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        const response = await fetch(videoUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`ATLAS_DOWNLOAD_HTTP_${response.status}`);
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
