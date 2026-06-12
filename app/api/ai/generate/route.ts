import { NextResponse } from "next/server";
import { generateAIContent, isTaskType, type GenerateFailure } from "@/lib/ai/generate";
import { getProviderStatus } from "@/lib/ai/providers";
import type { GeneratePayload } from "@/lib/ai/prompts";
import {
  authenticateRequest,
  completeGenerationTask,
  consumeCredits,
  createGenerationTask,
  estimateCreditCost,
  failGenerationTask,
  refundCredits,
} from "@/lib/supabase/server";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 8);
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export async function GET() {
  const providers = getProviderStatus();

  return NextResponse.json({
    success: true,
    configured: providers.deepseek.configured || providers.minimax.configured,
    providers,
    model: providers.mode === "minimax" ? providers.minimax.model : providers.mode === "deepseek" ? providers.deepseek.model : "hybrid",
  });
}
export async function POST(request: Request) {
  let body: GeneratePayload;

  try {
    body = (await request.json()) as GeneratePayload;
  } catch {
    return failure("请求格式不正确，请提交 JSON。", 400);
  }

  if (!isTaskType(body.taskType)) {
    return failure("taskType 不合法。", 400);
  }

  let user;
  try {
    user = await authenticateRequest(request);
  } catch (error) {
    return failure(toFriendlyError(error), 401);
  }

  if (!checkRateLimit(user.id)) {
    return failure("请求过于频繁，请稍后再试。", 429);
  }

  const startedAt = Date.now();
  const creditCost = estimateCreditCost(body.taskType);
  let taskId: string | null = null;

  try {
    if (creditCost > 0) await consumeCredits(user.id, creditCost);

    taskId = await createGenerationTask({
      userId: user.id,
      payload: body,
      status: "running",
    });

    const result = await generateAIContent(body);

    await completeGenerationTask({
      taskId,
      userId: user.id,
      payload: body,
      output: result.output,
      provider: result.meta.provider,
      model: result.meta.model,
      usage: result.usage,
      latencyMs: Date.now() - startedAt,
      costEstimate: creditCost,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (creditCost > 0) await refundCredits(user.id, creditCost).catch(() => null);
    await failGenerationTask({
      taskId,
      errorMessage: error instanceof Error ? error.message : "UNKNOWN_AI_ERROR",
      latencyMs: Date.now() - startedAt,
    }).catch(() => null);

    return failure(toFriendlyError(error), 500);
  }
}

function checkRateLimit(userId: string) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(userId);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

function failure(error: string, status: number) {
  const response: GenerateFailure = {
    success: false,
    output: "",
    usage: null,
    error,
  };

  return NextResponse.json(response, { status });
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN") {
    return "请先登录后再调用 AI 生成。";
  }

  if (message === "MISSING_SUPABASE_SERVER_CONFIG") {
    return "Supabase 服务端配置缺失，请检查 Vercel 环境变量。";
  }

  if (message === "MISSING_SUPABASE_SERVICE_ROLE_KEY") {
    return "额度系统尚未完成服务端配置，请在 Vercel 添加 SUPABASE_SERVICE_ROLE_KEY。";
  }

  if (message === "INSUFFICIENT_CREDITS") {
    return "本月 AI 额度已用完，暂时不能继续生成。";
  }

  if (message.includes("SUPABASE_SERVICE_ERROR")) {
    return "云端任务记录或额度更新失败，请检查 Supabase 表结构和 RLS 配置。";
  }

  if (message === "MISSING_DEEPSEEK_API_KEY") {
    return "DeepSeek 尚未完成服务端配置，当前步骤可改用 MiniMax 或先加载示例内容。";
  }

  if (message === "MISSING_MINIMAX_API_KEY") {
    return "MiniMax 尚未完成服务端配置，请先配置 MINIMAX_API_KEY，或将 AI_PROVIDER 临时设为 deepseek。";
  }

  if (message.includes("DEEPSEEK_API_ERROR:401") || message.includes("DEEPSEEK_API_ERROR:403")) {
    return "AI 生成配置无效或权限不足，请检查云端配置。";
  }

  if (message.includes("DEEPSEEK_API_ERROR:429")) {
    return "DeepSeek 请求过于频繁，请稍后再试。";
  }

  if (message === "DEEPSEEK_TIMEOUT") {
    return "DeepSeek 请求超时，请稍后重试。已有内容已保留，也可以先加载本地示例内容继续演示。";
  }

  if (message === "DEEPSEEK_NETWORK_ERROR") {
    return "连接 DeepSeek 失败，请检查网络后重试。已有内容已保留。";
  }

  if (message.includes("DEEPSEEK_API_ERROR")) {
    return "DeepSeek 生成失败，请稍后重试或检查模型配置。";
  }

  if (message === "EMPTY_DEEPSEEK_OUTPUT") {
    return "DeepSeek 未返回可用内容，请重新生成。";
  }

  if (message.includes("MINIMAX_API_ERROR:401") || message.includes("MINIMAX_API_ERROR:403")) {
    return "MiniMax 配置无效或权限不足，请检查 API Key / Token Plan 权限。";
  }

  if (message.includes("MINIMAX_API_ERROR:429")) {
    return "MiniMax 请求过于频繁，请稍后再试。";
  }

  if (message === "MINIMAX_TIMEOUT") {
    return "MiniMax 请求超时，请稍后重试。已有内容已保留。";
  }

  if (message === "MINIMAX_NETWORK_ERROR") {
    return "连接 MiniMax 失败，请检查网络后重试。已有内容已保留。";
  }

  if (message.includes("MINIMAX_API_ERROR")) {
    return "MiniMax 生成失败，请稍后重试或检查模型配置。";
  }

  if (message === "EMPTY_MINIMAX_OUTPUT") {
    return "MiniMax 未返回可用内容，请重新生成。";
  }

  return "AI 生成失败，请稍后重试。";
}
