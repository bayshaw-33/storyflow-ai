import { NextResponse } from "next/server";
import { generateMiniMaxImage } from "@/lib/ai/providers/minimax";

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
    const result = await generateMiniMaxImage(buildRelationshipPrompt(body.projectTitle, characters, body.relationshipDiagram || ""));
    return NextResponse.json({
      success: true,
      imageUrl: result.imageUrl,
      provider: result.provider,
      model: result.model,
      error: null,
    });
  } catch (error) {
    return failure(toFriendlyError(error), 500);
  }
}

function buildRelationshipPrompt(projectTitle = "StoryFlow 项目", characters: CharacterInput[], relationshipDiagram: string) {
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

  if (message === "MISSING_MINIMAX_API_KEY") {
    return "MiniMax 图片生成尚未完成服务端配置，请在 Vercel 环境变量中添加 MINIMAX_API_KEY 后重新部署。";
  }

  if (message.includes("MINIMAX_IMAGE_API_ERROR:401") || message.includes("MINIMAX_IMAGE_API_ERROR:403")) {
    return "MiniMax 图片生成配置无效或权限不足，请检查 API Key / Token Plan 权限。";
  }

  if (message.includes("MINIMAX_IMAGE_API_ERROR:429")) {
    return "MiniMax 图片生成请求过于频繁，请稍后再试。";
  }

  if (message === "EMPTY_MINIMAX_IMAGE_OUTPUT") {
    return "MiniMax 没有返回可用图片，请稍后重新生成。";
  }

  return "MiniMax 图片生成失败，请稍后重试。";
}
