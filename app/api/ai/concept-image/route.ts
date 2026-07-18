import { NextResponse } from "next/server";
import { generateArtImages, isAtlasAuthorizedUser } from "@/lib/art/providers";
import { buildActorTextToImageRequest, firstArtImageResult } from "@/lib/art/providers/actor-image";
import { authenticateRequest, consumeCredits, refundCredits } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConceptImageRequest = {
  kind?: "character" | "scene";
  projectTitle?: string;
  prompt?: string;
  context?: string;
  referenceName?: string;
};

export async function POST(request: Request) {
  let body: ConceptImageRequest;
  let userId = "";
  const creditCost = 2;

  try {
    body = (await request.json()) as ConceptImageRequest;
  } catch {
    return failure("请求格式不正确，请提交 JSON。", 400);
  }

  const sourcePrompt = [body.prompt, body.context, body.referenceName ? `参考图文件名：${body.referenceName}` : ""]
    .filter(Boolean)
    .join("\n");

  if (!sourcePrompt.trim()) {
    return failure("请先填写关键词、设计说明或上传参考图。", 400);
  }

  try {
    const user = await authenticateRequest(request);
    userId = user.id;
    await consumeCredits(user.id, creditCost);
    const visualPrompt = buildConceptPrompt(body, sourcePrompt);
    const generated = await generateArtImages(
      buildActorTextToImageRequest({
        prompt: visualPrompt,
        aspectRatio: body.kind === "character" ? "3:4" : "16:9",
      }),
      { atlasAuthorized: isAtlasAuthorizedUser(user) },
    );
    const result = firstArtImageResult(generated);

    return NextResponse.json({
      success: true,
      imageUrl: result.imageUrl,
      prompt: visualPrompt,
      provider: result.provider,
      model: result.model,
      error: null,
    });
  } catch (error) {
    if (userId) await refundCredits(userId, creditCost).catch(() => null);
    if (isAuthOrCreditError(error)) return failure(toFriendlyError(error), 401);
    return failure(toFriendlyError(error), 502);
  }
}

function buildConceptPrompt(body: ConceptImageRequest, sourcePrompt: string) {
  const kindText = body.kind === "character" ? "character appearance design" : "environment and scene concept design";
  return [
    `Create a professional ${kindText} image for a short drama storyboard workflow.`,
    "Use cinematic composition, clear production design, high-end streaming drama quality, readable visual details.",
    body.kind === "character"
      ? "Single character, consistent face and body proportion, wardrobe and silhouette clearly visible, no extra people."
      : "Production-ready environment concept, spatial layout clear, key props and lighting direction visible, no text labels.",
    "Avoid gore, explicit sexual content, unreadable UI text, watermark, logo, collage artifacts.",
    `Project: ${body.projectTitle || "Kiikis project"}`,
    sourcePrompt,
  ].join("\n");
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, imageUrl: "", prompt: "", error }, { status });
}

function isAuthOrCreditError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return ["MISSING_AUTH_TOKEN", "INVALID_AUTH_TOKEN", "MISSING_SUPABASE_SERVICE_ROLE_KEY", "INSUFFICIENT_CREDITS"].includes(message);
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN") return "请先登录后再生成概念图。";
  if (message === "MISSING_SUPABASE_SERVICE_ROLE_KEY") return "额度系统尚未完成服务端配置，请在 Vercel 添加 SUPABASE_SERVICE_ROLE_KEY。";
  if (message === "INSUFFICIENT_CREDITS") return "本月 AI 额度已用完，暂时不能继续生成概念图。";
  if (message === "MISSING_ATLASCLOUD_API_KEY") return "Atlas Cloud 图片生成尚未完成服务端配置，请在环境变量中添加 ATLASCLOUD_API_KEY 后重新部署。";
  if (message === "MISSING_BFL_API_KEY") return "FLUX 图片生成尚未完成服务端配置，请检查 BFL_API_KEY。";
  if (message === "ART_MODEL_NOT_FOUND" || message === "ART_MODEL_NOT_AVAILABLE") return "当前没有可用的图片生成模型。";
  if (message === "ART_MODEL_PROVIDER_MISMATCH") return "当前账号无权使用所选图片模型。";
  if (message.includes("ATLAS_API_ERROR:401") || message.includes("ATLAS_API_ERROR:403") || message.includes("BFL_API_ERROR:401") || message.includes("BFL_API_ERROR:403")) return "图片生成配置无效或权限不足，请检查 API Key 权限。";
  if (message.includes("ATLAS_API_ERROR:429") || message.includes("BFL_API_ERROR:429")) return "图片生成请求过于频繁，请稍后再试。";
  if (message === "ATLAS_GENERATION_TIMEOUT" || message === "BFL_GENERATION_TIMEOUT") return "图片生成超时，请稍后重试。";
  if (message === "ATLAS_EMPTY_OUTPUT" || message === "ATLAS_GENERATION_FAILED" || message === "BFL_GENERATION_FAILED" || message === "EMPTY_ART_IMAGE_OUTPUT") return "图片模型没有返回可用图片，请重新生成。";
  return "图片生成失败，请稍后重试。";
}
