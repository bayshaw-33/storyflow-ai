import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { loadProductionState, updateShotStatus } from "@/lib/production/api";
import { getMiniMaxApiKey } from "@/lib/ai/providers/minimax";
import { resolveSavedApiConfig } from "@/lib/supabase/api-connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VideoStatusRequest = {
  taskId?: string;
  projectId?: string;
  shotId?: string;
};

export async function POST(request: Request) {
  let body: VideoStatusRequest;
  try {
    body = (await request.json()) as VideoStatusRequest;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式不正确。" }, { status: 400 });
  }

  const taskId = body.taskId?.trim();
  const projectId = body.projectId?.trim();
  const shotId = body.shotId?.trim();

  if (!taskId) {
    return NextResponse.json({ success: false, error: "缺少 taskId。" }, { status: 400 });
  }

  let userId: string;
  let apiKey: string;
  let baseUrl: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
    const savedConfig = await resolveSavedApiConfig(user.id, "minimax").catch(() => null);
    apiKey = savedConfig?.minimaxApiKey || getMiniMaxApiKey();
    baseUrl =
      savedConfig?.minimaxBaseUrl ||
      process.env.MINIMAX_VIDEO_API_BASE_URL ||
      (apiKey.startsWith("sk-cp-")
        ? "https://api.minimaxi.com/v1"
        : "https://api.minimax.io/v1");
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  try {
    const queryUrl = new URL(
      process.env.MINIMAX_VIDEO_QUERY_URL ||
        `${baseUrl.replace(/\/$/, "")}/query/video_generation`,
    );
    queryUrl.searchParams.set("task_id", taskId);

    const response = await fetch(queryUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`MINIMAX_VIDEO_QUERY_ERROR:${response.status}:${detail.slice(0, 500)}`);
    }

    const data = await response.json();
    const rawStatus = extractString(data, [
      "status",
      "task_status",
      "data.status",
      "data.task_status",
    ]);
    const status = normalizeStatus(rawStatus);
    const fileId = extractString(data, ["file_id", "fileId", "data.file_id", "data.fileId"]);

    let videoUrl = "";

    if (status === "done" && fileId) {
      // Retrieve video URL
      const retrieveUrl = new URL(
        process.env.MINIMAX_FILE_RETRIEVE_URL ||
          `${baseUrl.replace(/\/$/, "")}/files/retrieve`,
      );
      retrieveUrl.searchParams.set("file_id", fileId);

      const retrieveResponse = await fetch(retrieveUrl.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(30000),
      });

      if (retrieveResponse.ok) {
        const retrieveData = await retrieveResponse.json();
        videoUrl = extractString(retrieveData, [
          "download_url",
          "downloadUrl",
          "file.download_url",
          "file.downloadUrl",
          "data.download_url",
          "data.downloadUrl",
        ]);
      }
    }

    // Update shot in database if projectId and shotId provided
    if (projectId && shotId && (status === "done" || status === "error")) {
      try {
        const state = await loadProductionState(userId, projectId);
        if (state) {
          if (status === "done" && videoUrl) {
            await updateShotStatus(userId, state.id, shotId, {
              status: "video_ready",
              video_url: videoUrl,
            });
          } else if (status === "error") {
            await updateShotStatus(userId, state.id, shotId, {
              status: "error",
              error: "Video generation failed",
            });
          }
        }
      } catch {
        // Ignore DB update error
      }
    }

    return NextResponse.json({
      success: true,
      taskId,
      status:
        status === "done"
          ? "video_ready"
          : status === "error"
            ? "error"
            : "video_generating",
      videoUrl: videoUrl || undefined,
      fileId: fileId || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VIDEO_STATUS_ERROR";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function normalizeStatus(
  status: string,
): "draft" | "queued" | "running" | "done" | "error" {
  const value = status.toLowerCase();
  if (["success", "succeeded", "done", "completed"].includes(value)) return "done";
  if (["fail", "failed", "error"].includes(value)) return "error";
  if (["queueing", "queued", "pending", "preparing"].includes(value)) return "queued";
  return "running";
}

function extractString(source: unknown, paths: string[]): string {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
      return (current as Record<string, unknown>)[key];
    }, source);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
