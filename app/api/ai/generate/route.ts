import { NextResponse } from "next/server";
import { generateAIContent, isTaskType, type GenerateFailure } from "@/lib/ai/generate";
import { getProviderStatus } from "@/lib/ai/providers";
import type { ByoApiConfig, GeneratePayload } from "@/lib/ai/prompts";
import { getPlanEntitlement } from "@/lib/billing/plans";
import { resolveSavedApiConfig, resolveSavedApiConfigById } from "@/lib/supabase/api-connections";
import {
  authenticateRequest,
  completeGenerationTask,
  consumeCredits,
  createGenerationTask,
  estimateCreditCost,
  failGenerationTask,
  refundCredits,
  serviceFetch,
} from "@/lib/supabase/server";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 8);
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

// 创作文档 Provider 链总预算提升到 500s，保留时间完成任务记录和额度收尾。
export const maxDuration = 500;

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
  const requestId = request.headers.get("x-vercel-id") || "local";
  const creditCost = estimateCreditCost(body.taskType);
  let taskId: string | null = null;
  const recordPayload = stripByoApi(body);
  console.info(JSON.stringify({
    level: "info",
    event: "ai_generate_start",
    route: "/api/ai/generate",
    requestId,
    taskType: body.taskType,
  }));

  try {
    const byoApi = await resolveByoApi(body.byoApi, user.id);
    const generationPayload = byoApi ? { ...recordPayload, byoApi } : recordPayload;

    if (creditCost > 0) await consumeCredits(user.id, creditCost);

    taskId = await createGenerationTask({
      userId: user.id,
      payload: recordPayload,
      status: "running",
    });

    const result = await generateAIContent(generationPayload);

    await completeGenerationTask({
      taskId,
      userId: user.id,
      payload: recordPayload,
      output: result.output,
      provider: result.meta.provider,
      model: result.meta.model,
      usage: result.usage,
      latencyMs: Date.now() - startedAt,
      costEstimate: creditCost,
    });

    console.info(JSON.stringify({
      level: "info",
      event: "ai_generate_success",
      route: "/api/ai/generate",
      requestId,
      taskType: body.taskType,
      provider: result.meta.provider,
      latencyMs: Date.now() - startedAt,
    }));
    return NextResponse.json(result);
  } catch (error) {
    const errorCode = error instanceof Error
      ? error.message.split(":").slice(0, 2).join(":")
      : "UNKNOWN_AI_ERROR";
    if (creditCost > 0) await refundCredits(user.id, creditCost).catch(() => null);
    await failGenerationTask({
      taskId,
      errorMessage: error instanceof Error ? error.message : "UNKNOWN_AI_ERROR",
      latencyMs: Date.now() - startedAt,
    }).catch(() => null);

    console.error(JSON.stringify({
      level: "error",
      event: "ai_generate_failure",
      route: "/api/ai/generate",
      requestId,
      taskType: body.taskType,
      errorCode,
      latencyMs: Date.now() - startedAt,
    }));
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

function stripByoApi(payload: GeneratePayload): GeneratePayload {
  if (!payload.byoApi) return payload;
  const { byoApi: _byoApi, ...safePayload } = payload;
  return safePayload;
}

async function resolveByoApi(config: ByoApiConfig | undefined, userId: string): Promise<ByoApiConfig | null> {
  if (!config) {
    return resolveSavedApiConfig(userId).catch(() => null);
  }

  if (config.connectionId?.trim()) {
    return resolveSavedApiConfigById(userId, config.connectionId.trim()).catch(() => null);
  }

  const cleanConfig: ByoApiConfig = {
    provider: config.provider || "auto",
    connectionId: config.connectionId?.trim() || undefined,
    deepseekApiKey: config.deepseekApiKey?.trim() || undefined,
    deepseekModel: config.deepseekModel?.trim() || undefined,
    minimaxApiKey: config.minimaxApiKey?.trim() || undefined,
    minimaxModel: config.minimaxModel?.trim() || undefined,
    minimaxBaseUrl: config.minimaxBaseUrl?.trim() || undefined,
    customProviderName: config.customProviderName?.trim() || undefined,
    customApiKey: config.customApiKey?.trim() || undefined,
    customModel: config.customModel?.trim() || undefined,
    customBaseUrl: config.customBaseUrl?.trim() || undefined,
    atlasModel: config.atlasModel?.trim() || undefined,
  };

  // Atlas 模型不需要 API key（用服务端 ATLASCLOUD_API_KEY），所以单独处理
  const hasKey = Boolean(cleanConfig.deepseekApiKey || cleanConfig.minimaxApiKey || cleanConfig.customApiKey || cleanConfig.atlasModel);
  if (!hasKey) return resolveSavedApiConfig(userId, cleanConfig.provider).catch(() => null);

  const rows = await serviceFetch<Array<{ plan: string | null }>>(
    `/rest/v1/storyflow_profiles?user_id=eq.${encodeURIComponent(userId)}&select=plan&limit=1`,
  );
  const plan = getPlanEntitlement(rows[0]?.plan);
  if (!plan.features.byoApi) {
    throw new Error("BYO_API_PLAN_REQUIRED");
  }

  if (cleanConfig.provider === "deepseek" && !cleanConfig.deepseekApiKey) {
    throw new Error("MISSING_BYO_DEEPSEEK_API_KEY");
  }
  if (cleanConfig.provider === "minimax" && !cleanConfig.minimaxApiKey) {
    throw new Error("MISSING_BYO_MINIMAX_API_KEY");
  }
  if (cleanConfig.provider === "custom" && (!cleanConfig.customApiKey || !cleanConfig.customBaseUrl || !cleanConfig.customModel)) {
    throw new Error("MISSING_BYO_CUSTOM_API_CONFIG");
  }

  return cleanConfig;
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

  if (message === "BYO_API_PLAN_REQUIRED") {
    return "当前套餐暂不支持自接 API，请升级到 Pro 或 Ultra 后再使用。";
  }

  if (message === "MISSING_BYO_DEEPSEEK_API_KEY") {
    return "已选择 DeepSeek 自接 API，但未填写 DeepSeek API Key。";
  }

  if (message === "MISSING_BYO_MINIMAX_API_KEY") {
    return "已选择 MiniMax 自接 API，但未填写 MiniMax API Key。";
  }

  if (message === "MISSING_BYO_CUSTOM_API_CONFIG") {
    return "已选择自定义 API，但 API Key、Base URL 或模型名称不完整。";
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

  if (message === "MISSING_CUSTOM_API_KEY" || message === "MISSING_CUSTOM_BASE_URL" || message === "MISSING_CUSTOM_MODEL") {
    return "自定义 API 配置不完整，请在设置页补全 Key、Base URL 和模型。";
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

  if (message.includes("DEEPSEEK_API_ERROR:400")) {
    return "DeepSeek 模型配置错误（如模型名不存在），请检查 DEEPSEEK_MODEL 环境变量。";
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
