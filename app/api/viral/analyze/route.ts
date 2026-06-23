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
import {
  analysisToMarkdown,
  callMiniMaxVideoAnalysis,
  createSignedVideoUrl,
  failure,
  parseAnalysisJson,
  patchViralProject,
  readViralProject,
  viralPayload,
} from "../_utils";

const ANALYZE_PROMPT = `你是一个爆款短视频结构分析专家。请分析这个视频的爆款结构，输出严格的JSON格式：
{
  "f1_hook": { "duration": "前X秒", "type": "钩子类型", "emotion": "情绪触发点", "description": "详细描述" },
  "f2_body": { "rhythm": "节奏描述", "emotion_curve": "情绪推进", "description": "详细描述" },
  "f3_action": { "key_actions": ["动作1", "动作2"], "turning_point": "转折描述", "description": "详细描述" },
  "f4_result": { "climax": "高潮描述", "presentation": "结果呈现方式", "description": "详细描述" },
  "f5_memory": { "formula": "可复用结构公式", "tags": ["标签1", "标签2"], "description": "记忆点描述" },
  "raw_storyboard": "原视频分镜拆解（文字描述）"
}
只返回JSON，不要其他文字。`;

export async function POST(request: Request) {
  let body: { projectId?: string };

  try {
    body = (await request.json()) as { projectId?: string };
  } catch {
    return failure("请求格式不正确。", 400);
  }

  if (!body.projectId) return failure("缺少 projectId。", 400);

  let user;
  try {
    user = await authenticateRequest(request);
  } catch {
    return failure("请先登录后再分析视频。", 401);
  }

  const startedAt = Date.now();
  const payload = viralPayload({
    taskType: "viral_video_analysis",
    projectId: body.projectId,
    input: "分析上传视频的爆款结构",
  });
  const creditCost = estimateCreditCost(payload.taskType);
  let taskId: string | null = null;

  try {
    const project = await readViralProject(body.projectId, user.id);
    if (!project) return failure("爆款项目不存在。", 404);
    if (!project.source_video_path) return failure("当前项目还没有上传视频。", 400);

    payload.projectTitle = project.title || project.source_video_name || "爆款创作";
    payload.context = project.source_video_path;

    if (creditCost > 0) await consumeCredits(user.id, creditCost);

    taskId = await createGenerationTask({
      userId: user.id,
      payload,
      status: "running",
    });

    const signedUrl = await createSignedVideoUrl(project.source_video_path);
    const result = await callMiniMaxVideoAnalysis(signedUrl, ANALYZE_PROMPT);
    const analysis = parseAnalysisJson(result.output);
    const markdown = analysisToMarkdown(analysis);

    await patchViralProject(project.id, user.id, {
      analysis_json: analysis,
      analysis_markdown: markdown,
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
      analysis,
      markdown,
      taskStatus: "completed",
    });
  } catch (error) {
    if (creditCost > 0) await refundCredits(user.id, creditCost).catch(() => null);
    await failGenerationTask({
      taskId,
      errorMessage: error instanceof Error ? error.message : "UNKNOWN_VIRAL_ANALYSIS_ERROR",
      latencyMs: Date.now() - startedAt,
    }).catch(() => null);

    return failure(toFriendlyError(error), 500);
  }
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "INSUFFICIENT_CREDITS") return "本月 AI 额度已用完，暂时不能继续分析。";
  if (message === "MISSING_MINIMAX_API_KEY") return "MiniMax 尚未完成服务端配置，请先配置 MINIMAX_API_KEY。";
  if (message === "MINIMAX_TIMEOUT") return "MiniMax 视频分析超时，请稍后重试。";
  if (message === "MINIMAX_NETWORK_ERROR") return "连接 MiniMax 失败，请检查网络后重试。";
  if (message.includes("MINIMAX_API_ERROR")) return "MiniMax 视频分析失败，请检查模型是否支持视频 URL 输入。";
  if (message === "EMPTY_MINIMAX_OUTPUT") return "MiniMax 未返回可用分析结果。";
  if (message === "INVALID_VIRAL_ANALYSIS_JSON" || error instanceof SyntaxError) return "MiniMax 返回格式不是可解析的结构 JSON，请重试。";
  if (message.includes("VIRAL_STORAGE_SIGNED_URL_ERROR")) return "读取视频临时访问地址失败，请检查 viral-assets bucket。";
  if (message.includes("SUPABASE_SERVICE_ERROR")) return "保存分析结果失败，请检查 viral 表结构。";

  return "爆款结构分析失败，请稍后重试。";
}
