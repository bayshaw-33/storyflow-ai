import { NextResponse } from "next/server";
import {
  authenticateRequest,
  completeGenerationTask,
  consumeCredits,
  createGenerationTask,
  estimateCreditCost,
  failGenerationTask,
  refundCredits,
} from "@/lib/supabase/server";
import { callMiniMaxText, failure, patchViralProject, readViralProject, viralPayload } from "../_utils";

export async function POST(request: Request) {
  let body: { projectId?: string; rewriteInput?: string };

  try {
    body = (await request.json()) as { projectId?: string; rewriteInput?: string };
  } catch {
    return failure("请求格式不正确。", 400);
  }

  if (!body.projectId) return failure("缺少 projectId。", 400);
  if (!body.rewriteInput?.trim()) return failure("请先填写改写要求。", 400);

  let user;
  try {
    user = await authenticateRequest(request);
  } catch {
    return failure("请先登录后再改写。", 401);
  }

  const startedAt = Date.now();
  const payload = viralPayload({
    taskType: "viral_structure_remake",
    projectId: body.projectId,
    input: body.rewriteInput,
  });
  const creditCost = estimateCreditCost(payload.taskType);
  let taskId: string | null = null;

  try {
    const project = await readViralProject(body.projectId, user.id);
    if (!project) return failure("爆款项目不存在。", 404);
    if (!project.analysis_json) return failure("请先完成爆款结构分析。", 400);

    payload.projectTitle = project.title || project.source_video_name || "爆款创作";
    payload.context = JSON.stringify(project.analysis_json, null, 2);

    if (creditCost > 0) await consumeCredits(user.id, creditCost);

    taskId = await createGenerationTask({
      userId: user.id,
      payload,
      status: "running",
    });

    const prompt = buildRemakePrompt(project.analysis_json, body.rewriteInput.trim());
    const result = await callMiniMaxText(prompt);
    const markdown = result.output;

    await patchViralProject(project.id, user.id, {
      remake_json: {
        rewriteInput: body.rewriteInput.trim(),
        markdown,
      },
      remake_markdown: markdown,
    });

    await completeGenerationTask({
      taskId,
      userId: user.id,
      payload,
      output: markdown,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      latencyMs: Date.now() - startedAt,
      costEstimate: creditCost,
    });

    return NextResponse.json({
      success: true,
      remake: markdown,
      taskStatus: "completed",
    });
  } catch (error) {
    if (creditCost > 0) await refundCredits(user.id, creditCost).catch(() => null);
    await failGenerationTask({
      taskId,
      errorMessage: error instanceof Error ? error.message : "UNKNOWN_VIRAL_REMAKE_ERROR",
      latencyMs: Date.now() - startedAt,
    }).catch(() => null);

    return failure(toFriendlyError(error), 500);
  }
}

function buildRemakePrompt(analysisJson: unknown, rewriteInput: string) {
  return `你是爆款短视频改写专家。基于以下爆款结构分析，按照用户的改写要求，生成同结构的改写分镜脚本。

原视频结构：${JSON.stringify(analysisJson, null, 2)}
改写要求：${rewriteInput}

输出格式：
## F6 同结构改写分镜
### 开场（0-3秒）
[改写内容]
### 主体
[改写内容]
### 结尾记忆点
[改写内容]

同时输出旁白/字幕建议和拍摄执行建议。`;
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "INSUFFICIENT_CREDITS") return "本月 AI 额度已用完，暂时不能继续改写。";
  if (message === "MISSING_MINIMAX_API_KEY") return "MiniMax 尚未完成服务端配置，请先配置 MINIMAX_API_KEY。";
  if (message === "MINIMAX_TIMEOUT") return "MiniMax 改写超时，请稍后重试。";
  if (message === "MINIMAX_NETWORK_ERROR") return "连接 MiniMax 失败，请检查网络后重试。";
  if (message.includes("MINIMAX_API_ERROR")) return "MiniMax 改写失败，请检查模型配置。";
  if (message === "EMPTY_MINIMAX_OUTPUT") return "MiniMax 未返回可用改写结果。";
  if (message.includes("SUPABASE_SERVICE_ERROR")) return "保存改写结果失败，请检查 viral 表结构。";

  return "同结构改写失败，请稍后重试。";
}
