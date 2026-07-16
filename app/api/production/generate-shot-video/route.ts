import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { loadProductionState, updateShotStatus } from "@/lib/production/api";
import { getMiniMaxApiKey } from "@/lib/ai/providers/minimax";
import { resolveSavedApiConfig } from "@/lib/supabase/api-connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenerateShotVideoRequest = {
  projectId?: string;
  shotId?: string;
  provider?: string;
  model?: string;
};

type MiniMaxVideoConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
};

export async function POST(request: Request) {
  let body: GenerateShotVideoRequest;
  try {
    body = (await request.json()) as GenerateShotVideoRequest;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式不正确。" }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const shotId = body.shotId?.trim();
  if (!projectId || !shotId) {
    return NextResponse.json({ success: false, error: "缺少 projectId 或 shotId。" }, { status: 400 });
  }

  let userId: string;
  let minimaxConfig: MiniMaxVideoConfig;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
    const savedConfig = await resolveSavedApiConfig(user.id, "minimax").catch(() => null);
    minimaxConfig = {
      apiKey: savedConfig?.minimaxApiKey || getMiniMaxApiKey(),
      model: savedConfig?.minimaxModel,
      baseUrl: savedConfig?.minimaxBaseUrl,
    };
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  try {
    const state = await loadProductionState(userId, projectId);
    if (!state) {
      return NextResponse.json({ success: false, error: "项目状态未找到。" }, { status: 404 });
    }

    const shot = state.shots.find((s) => s.id === shotId);
    if (!shot) {
      return NextResponse.json({ success: false, error: "分镜未找到。" }, { status: 404 });
    }

    if (!shot.videoPrompt?.trim()) {
      return NextResponse.json({ success: false, error: "分镜缺少 videoPrompt。" }, { status: 400 });
    }

    // Update status to video_generating
    await updateShotStatus(userId, state.id, shotId, {
      status: "video_generating",
      error: null,
    });

    // Call MiniMax video generation API directly
    const model =
      body.model?.trim() ||
      minimaxConfig.model ||
      process.env.MINIMAX_VIDEO_MODEL ||
      "MiniMax-Hailuo-02";
    const baseUrl =
      minimaxConfig.baseUrl ||
      process.env.MINIMAX_VIDEO_API_BASE_URL ||
      (minimaxConfig.apiKey.startsWith("sk-cp-")
        ? "https://api.minimaxi.com/v1"
        : "https://api.minimax.io/v1");
    const generationUrl =
      process.env.MINIMAX_VIDEO_GENERATION_URL ||
      `${baseUrl.replace(/\/$/, "")}/video_generation`;

    const response = await fetch(generationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${minimaxConfig.apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: shot.videoPrompt,
        duration: 5,
        resolution: "768P",
        prompt_optimizer: true,
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`MINIMAX_VIDEO_API_ERROR:${response.status}:${detail.slice(0, 500)}`);
    }

    const data = await response.json();
    const taskId = extractString(data, ["task_id", "taskId", "data.task_id", "data.taskId"]);

    if (!taskId) {
      throw new Error("EMPTY_MINIMAX_VIDEO_TASK_ID");
    }

    // Update shot with task ID
    await updateShotStatus(userId, state.id, shotId, {
      status: "video_generating",
      video_task_id: taskId,
      video_provider: "minimax",
    });

    return NextResponse.json({
      success: true,
      taskId,
      status: "video_generating",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VIDEO_GENERATION_ERROR";

    // Update shot status to error if we have state
    try {
      const state = await loadProductionState(userId, projectId);
      if (state) {
        await updateShotStatus(userId, state.id, shotId, {
          status: "error",
          error: message,
        });
      }
    } catch {
      // Ignore update error
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
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
