import { NextResponse } from "next/server";
import { generateMiniMaxImage } from "@/lib/ai/providers/minimax";
import { authenticateRequest } from "@/lib/supabase/server";
import { buildArtImagePrompt, type ArtAsset } from "@/lib/art-workbench";

type GenerateImageRequest = {
  asset?: ArtAsset;
  mode?: "reference_sheet" | "three_view" | "concept";
  visualStyle?: string;
  provider?: "minimax" | "seedream" | "openai" | "local";
};

export async function POST(request: Request) {
  let body: GenerateImageRequest;
  try {
    body = (await request.json()) as GenerateImageRequest;
  } catch {
    return failure("请求格式不正确，请提交 JSON。", 400);
  }

  if (!body.asset?.name?.trim()) return failure("缺少美术资产。", 400);
  const mode = body.mode || "concept";

  try {
    await authenticateRequest(request);
    if (body.provider && body.provider !== "minimax") {
      return failure("当前版本暂时只启用 MiniMax 图片生成；接口已预留 provider，后续可替换。", 400);
    }
    const prompt = buildArtImagePrompt(body.asset, mode, body.visualStyle || "");
    const result = await generateMiniMaxImage(prompt);
    return NextResponse.json({
      success: true,
      imageUrl: result.imageUrl,
      prompt,
      provider: result.provider,
      model: result.model,
      error: null,
    });
  } catch (error) {
    return failure(toFriendlyError(error), isAuthError(error) ? 401 : 502);
  }
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, imageUrl: "", error }, { status });
}

function isAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN";
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (isAuthError(error)) return "请先登录后再生成美术图片。";
  if (message === "MISSING_MINIMAX_API_KEY") return "MiniMax 图片生成尚未配置，请检查 MINIMAX_API_KEY。";
  if (message.includes("MINIMAX_IMAGE_API_ERROR:401") || message.includes("MINIMAX_IMAGE_API_ERROR:403")) return "MiniMax 图片生成权限不足，请检查 API Key / Token Plan。";
  if (message.includes("MINIMAX_IMAGE_API_ERROR:429")) return "MiniMax 图片生成请求过于频繁，请稍后再试。";
  if (message === "EMPTY_MINIMAX_IMAGE_OUTPUT") return "MiniMax 没有返回可用图片。";
  return "美术图片生成失败，请稍后重试。";
}
