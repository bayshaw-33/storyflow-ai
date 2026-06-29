import { NextResponse } from "next/server";
import { getMiniMaxApiKey } from "@/lib/ai/providers/minimax";
import { authenticateRequest } from "@/lib/supabase/server";

type MiniMaxVideoRequest = {
  action?: "create" | "status";
  model?: string;
  prompt?: string;
  duration?: string;
  resolution?: string;
  taskId?: string;
};

type MiniMaxVideoStatus = "draft" | "queued" | "running" | "done" | "error";

export async function POST(request: Request) {
  let body: MiniMaxVideoRequest;

  try {
    body = (await request.json()) as MiniMaxVideoRequest;
  } catch {
    return failure("请求格式不正确，请提交 JSON。", 400);
  }

  try {
    await authenticateRequest(request);
  } catch {
    return failure("请先登录后再调用 MiniMax 视频生成。", 401);
  }

  try {
    if (body.action === "create") {
      if (!body.prompt?.trim()) return failure("缺少视频 prompt。", 400);
      const result = await createVideoTask({
        prompt: body.prompt.trim(),
        model: body.model?.trim() || process.env.MINIMAX_VIDEO_MODEL || "MiniMax-Hailuo-02",
        duration: Number.parseInt(body.duration || "5", 10) || 5,
        resolution: body.resolution?.trim() || "768P",
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (body.action === "status") {
      if (!body.taskId?.trim()) return failure("缺少 taskId。", 400);
      const result = await queryVideoTask(body.taskId.trim());
      return NextResponse.json({ success: true, ...result });
    }

    return failure("不支持的视频任务操作。", 400);
  } catch (error) {
    return failure(toFriendlyError(error), 502);
  }
}

async function createVideoTask({
  prompt,
  model,
  duration,
  resolution,
}: {
  prompt: string;
  model: string;
  duration: number;
  resolution: string;
}) {
  const data = await miniMaxFetch(getVideoGenerationUrl(), {
    method: "POST",
    body: JSON.stringify({
      model,
      prompt,
      duration,
      resolution,
      prompt_optimizer: true,
    }),
  });

  const taskId = getString(data, ["task_id", "taskId", "data.task_id", "data.taskId"]);
  if (!taskId) throw new Error("EMPTY_MINIMAX_VIDEO_TASK_ID");

  return { taskId, status: "queued" as MiniMaxVideoStatus, model };
}

async function queryVideoTask(taskId: string) {
  const queryUrl = new URL(getVideoQueryUrl());
  queryUrl.searchParams.set("task_id", taskId);
  const data = await miniMaxFetch(queryUrl.toString(), { method: "GET" });
  const rawStatus = getString(data, ["status", "task_status", "data.status", "data.task_status"]);
  const status = normalizeStatus(rawStatus);
  const fileId = getString(data, ["file_id", "fileId", "data.file_id", "data.fileId"]);

  if (status === "done" && fileId) {
    const videoUrl = await retrieveVideoUrl(fileId);
    return { taskId, status, fileId, videoUrl };
  }

  return { taskId, status, fileId };
}

async function retrieveVideoUrl(fileId: string) {
  const retrieveUrl = new URL(getFileRetrieveUrl());
  retrieveUrl.searchParams.set("file_id", fileId);
  const data = await miniMaxFetch(retrieveUrl.toString(), { method: "GET" });
  const videoUrl = getString(data, [
    "download_url",
    "downloadUrl",
    "file.download_url",
    "file.downloadUrl",
    "data.download_url",
    "data.downloadUrl",
    "data.file.download_url",
    "data.file.downloadUrl",
  ]);
  if (!videoUrl) throw new Error("EMPTY_MINIMAX_VIDEO_URL");
  return videoUrl;
}

async function miniMaxFetch(url: string, init: RequestInit) {
  const apiKey = getMiniMaxApiKey();
  if (!apiKey) throw new Error("MISSING_MINIMAX_API_KEY");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("MINIMAX_VIDEO_TIMEOUT");
    throw new Error("MINIMAX_VIDEO_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`MINIMAX_VIDEO_API_ERROR:${response.status}:${detail.slice(0, 500)}`);
  }

  return response.json();
}

function getMiniMaxBaseUrl() {
  const apiKey = getMiniMaxApiKey();
  if (process.env.MINIMAX_VIDEO_API_BASE_URL) return process.env.MINIMAX_VIDEO_API_BASE_URL.replace(/\/$/, "");
  return apiKey.startsWith("sk-cp-") ? "https://api.minimaxi.com/v1" : "https://api.minimax.io/v1";
}

function getVideoGenerationUrl() {
  return process.env.MINIMAX_VIDEO_GENERATION_URL || `${getMiniMaxBaseUrl()}/video_generation`;
}

function getVideoQueryUrl() {
  return process.env.MINIMAX_VIDEO_QUERY_URL || `${getMiniMaxBaseUrl()}/query/video_generation`;
}

function getFileRetrieveUrl() {
  return process.env.MINIMAX_FILE_RETRIEVE_URL || `${getMiniMaxBaseUrl()}/files/retrieve`;
}

function normalizeStatus(status: string): MiniMaxVideoStatus {
  const value = status.toLowerCase();
  if (["success", "succeeded", "done", "completed"].includes(value)) return "done";
  if (["fail", "failed", "error"].includes(value)) return "error";
  if (["queueing", "queued", "pending", "preparing"].includes(value)) return "queued";
  return "running";
}

function getString(source: unknown, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (!isRecord(current)) return undefined;
      return current[key];
    }, source);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN_MINIMAX_VIDEO_ERROR";
  if (message === "MISSING_MINIMAX_API_KEY") return "MiniMax 尚未配置 API Key，请先设置 MINIMAX_API_KEY。";
  if (message === "EMPTY_MINIMAX_VIDEO_TASK_ID") return "MiniMax 没有返回 task_id。";
  if (message === "EMPTY_MINIMAX_VIDEO_URL") return "MiniMax 没有返回可用视频下载链接。";
  if (message === "MINIMAX_VIDEO_TIMEOUT") return "MiniMax 视频任务请求超时，请稍后刷新状态。";
  if (message === "MINIMAX_VIDEO_NETWORK_ERROR") return "连接 MiniMax 失败，请检查网络后重试。";
  if (message.includes("MINIMAX_VIDEO_API_ERROR:401") || message.includes("MINIMAX_VIDEO_API_ERROR:403")) {
    return "MiniMax 配置无效或视频生成权限不足，请检查 API Key / Token Plan。";
  }
  if (message.includes("MINIMAX_VIDEO_API_ERROR:429")) return "MiniMax 请求过于频繁，请稍后重试。";
  if (message.includes("MINIMAX_VIDEO_API_ERROR")) return "MiniMax 视频生成失败，请检查模型、prompt 或账号权限。";
  return message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
