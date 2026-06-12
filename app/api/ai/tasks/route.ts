import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cancelGenerationTask, listGenerationTasks } from "@/lib/supabase/server";
import { applyGenerationTask, markTaskRetrying } from "@/lib/supabase/phase2";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const projectId = request.nextUrl.searchParams.get("projectId");
    const tasks = await listGenerationTasks({ userId: user.id, projectId, limit: 20 });
    return NextResponse.json({ success: true, tasks });
  } catch (error) {
    return NextResponse.json({ success: false, tasks: [], error: toFriendlyTaskError(error) }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
    const action = typeof body.action === "string" ? body.action : "";

    if (!taskId || !["cancel", "apply", "retry"].includes(action)) {
      return NextResponse.json({ success: false, error: "任务参数不完整。" }, { status: 400 });
    }

    const task =
      action === "apply"
        ? await applyGenerationTask(user.id, taskId)
        : action === "retry"
          ? await markTaskRetrying(user.id, taskId)
          : await cancelGenerationTask({ userId: user.id, taskId });
    return NextResponse.json({ success: true, task });
  } catch (error) {
    return NextResponse.json({ success: false, error: toFriendlyTaskError(error) }, { status: 400 });
  }
}

function toFriendlyTaskError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("MISSING_AUTH_TOKEN") || message.includes("INVALID_AUTH_TOKEN")) return "请先登录后查看 AI 任务。";
  if (message.includes("MISSING_SUPABASE")) return "云端任务系统尚未完成配置。";
  if (message.includes("TASK_NOT_FOUND")) return "没有找到这条任务记录。";
  if (message.includes("PROJECT_FORBIDDEN")) return "无权访问该项目。";
  return "任务状态读取失败，请稍后重试。";
}
