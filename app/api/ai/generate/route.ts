import { NextResponse } from "next/server";
import { generateAIContent, isTaskType, type GenerateFailure } from "@/lib/ai/generate";
import type { GeneratePayload } from "@/lib/ai/prompts";

export async function GET() {
  return NextResponse.json({
    success: true,
    configured: Boolean(process.env.DEEPSEEK_API_KEY),
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
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

  try {
    const result = await generateAIContent(body);
    return NextResponse.json(result);
  } catch (error) {
    return failure(toFriendlyError(error), 500);
  }
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

  if (message === "MISSING_DEEPSEEK_API_KEY") {
    return "服务端尚未配置 DEEPSEEK_API_KEY，请先在 .env.local 或 Vercel 环境变量中配置。";
  }

  if (message.includes("DEEPSEEK_API_ERROR:401") || message.includes("DEEPSEEK_API_ERROR:403")) {
    return "DeepSeek API Key 无效或权限不足，请检查服务端环境变量。";
  }

  if (message.includes("DEEPSEEK_API_ERROR:429")) {
    return "DeepSeek 请求过于频繁，请稍后再试。";
  }

  if (message === "DEEPSEEK_TIMEOUT") {
    return "DeepSeek 请求超时，请稍后重试。已有内容已保留，你也可以先加载本地示例内容继续演示。";
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

  return "AI 生成失败，请稍后重试。";
}
