import { NextResponse } from "next/server";
import { generateArtImages, isAtlasAuthorizedUser } from "@/lib/art/providers";
import { buildActorTextToImageRequest, firstArtImageResult } from "@/lib/art/providers/actor-image";
import { authenticateRequest, consumeCredits, refundCredits } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CharacterInput = {
  name?: string;
  role?: string;
  identity?: string;
  goal?: string;
  conflict?: string;
  secret?: string;
  arc?: string;
};

type RelationshipImageRequest = {
  projectTitle?: string;
  relationshipDiagram?: string;
  characters?: CharacterInput[];
};

export async function POST(request: Request) {
  let body: RelationshipImageRequest;
  let userId = "";
  const creditCost = 2;

  try {
    body = (await request.json()) as RelationshipImageRequest;
  } catch {
    return failure("请求格式不正确，请提交 JSON。", 400);
  }

  const characters = Array.isArray(body.characters) ? body.characters.filter((card) => card.name?.trim()) : [];

  if (!characters.length && !body.relationshipDiagram?.trim()) {
    return failure("请先生成或填写角色卡，再生成图片关系图。", 400);
  }

  try {
    const user = await authenticateRequest(request);
    userId = user.id;
    await consumeCredits(user.id, creditCost);
    const generated = await generateArtImages(
      buildActorTextToImageRequest({
        prompt: buildRelationshipPrompt(body.projectTitle, characters, body.relationshipDiagram || ""),
        aspectRatio: "16:9",
      }),
      { atlasAuthorized: isAtlasAuthorizedUser(user) },
    );
    const result = firstArtImageResult(generated);
    return NextResponse.json({
      success: true,
      imageUrl: result.imageUrl,
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

function buildRelationshipPrompt(projectTitle = "kiikis project", characters: CharacterInput[], relationshipDiagram: string) {
  const characterText = characters
    .map((card, index) =>
      [
        `${index + 1}. ${card.name || "未命名角色"}`,
        card.role ? `功能：${card.role}` : "",
        card.identity ? `身份：${card.identity}` : "",
        card.goal ? `目标：${card.goal}` : "",
        card.conflict ? `冲突关系：${card.conflict}` : "",
        card.secret ? `秘密：${card.secret}` : "",
        card.arc ? `人物弧线：${card.arc}` : "",
      ].filter(Boolean).join("；"),
    )
    .join("\n");

  return [
    "Create a clean professional character relationship diagram for a drama writing workspace.",
    "The image must be an information design diagram, not a realistic portrait scene.",
    "Use a dark premium SaaS style background, white and muted green text, thin connection lines, readable node cards, cinematic but minimal.",
    "Show character nodes as rounded rectangular cards with Chinese names, role labels, and short relationship labels on connecting lines.",
    "Use arrows and color-coded line types: romance, family, rivalry, secret alliance, betrayal.",
    "Avoid tiny unreadable text. Keep the composition spacious, investor-demo quality.",
    `Project title: ${projectTitle}`,
    "Characters:",
    characterText || "No structured character cards provided.",
    "Existing relationship description:",
    relationshipDiagram || "Infer relationships from character goals and conflicts.",
    "Output only the diagram image.",
  ].join("\n");
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, imageUrl: "", error }, { status });
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN") {
    return "请先登录后再生成人物关系图。";
  }

  if (message === "MISSING_SUPABASE_SERVICE_ROLE_KEY") {
    return "额度系统尚未完成服务端配置，请在 Vercel 添加 SUPABASE_SERVICE_ROLE_KEY。";
  }

  if (message === "INSUFFICIENT_CREDITS") {
    return "本月 AI 额度已用完，暂时不能继续生成人物关系图。";
  }

  if (message === "MISSING_ATLASCLOUD_API_KEY") {
    return "Atlas Cloud 图片生成尚未完成服务端配置，请在环境变量中添加 ATLASCLOUD_API_KEY 后重新部署。";
  }

  if (message === "MISSING_BFL_API_KEY") {
    return "FLUX 图片生成尚未完成服务端配置，请检查 BFL_API_KEY。";
  }

  if (message === "ART_MODEL_NOT_FOUND" || message === "ART_MODEL_NOT_AVAILABLE") {
    return "当前没有可用的图片生成模型。";
  }

  if (message === "ART_MODEL_PROVIDER_MISMATCH") {
    return "当前账号无权使用所选图片模型。";
  }

  if (message.includes("ATLAS_API_ERROR:401") || message.includes("ATLAS_API_ERROR:403") || message.includes("BFL_API_ERROR:401") || message.includes("BFL_API_ERROR:403")) {
    return "图片生成配置无效或权限不足，请检查 API Key 权限。";
  }

  if (message.includes("ATLAS_API_ERROR:429") || message.includes("BFL_API_ERROR:429")) {
    return "图片生成请求过于频繁，请稍后再试。";
  }

  if (message === "ATLAS_GENERATION_TIMEOUT" || message === "BFL_GENERATION_TIMEOUT") {
    return "图片生成超时，请稍后重试。";
  }

  if (message === "ATLAS_EMPTY_OUTPUT" || message === "ATLAS_GENERATION_FAILED" || message === "BFL_GENERATION_FAILED" || message === "EMPTY_ART_IMAGE_OUTPUT") {
    return "图片模型没有返回可用图片，请重新生成。";
  }

  return "人物关系图生成失败，请稍后重试。";
}

function isAuthOrCreditError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return [
    "MISSING_AUTH_TOKEN",
    "INVALID_AUTH_TOKEN",
    "MISSING_SUPABASE_SERVICE_ROLE_KEY",
    "INSUFFICIENT_CREDITS",
  ].includes(message);
}
