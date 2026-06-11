import { NextResponse } from "next/server";
import { callMiniMax, generateMiniMaxImage } from "@/lib/ai/providers/minimax";

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
    if (isImagePermissionError(error)) {
      try {
        const fallback = await generateRelationshipSvg(body.projectTitle, characters, body.relationshipDiagram || "");
        return NextResponse.json({
          success: true,
          imageUrl: svgToDataUrl(fallback),
          provider: "minimax",
          model: "MiniMax-M3",
          fallback: "svg",
          error: null,
        });
      } catch {
        return failure("MiniMax 图片生成权限不足，且 SVG 兜底生成失败。请检查 MiniMax 文本模型和 image-01 权限。", 500);
      }
    }

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

async function generateRelationshipSvg(projectTitle = "StoryFlow 项目", characters: CharacterInput[], relationshipDiagram: string) {
  const result = await callMiniMax({
    temperature: 0.45,
    maxTokens: 2500,
    messages: [
      {
        role: "system",
        content:
          "你是 StoryFlow AI 的信息图设计师。只输出一个完整 SVG，不要 Markdown，不要解释。SVG 必须安全：禁止 script、foreignObject、外链图片、事件属性。",
      },
      {
        role: "user",
        content: [
          "请生成一张深色专业风格的人物关系图 SVG。",
          "尺寸固定为 1280x720，背景深色，文字白色和绿色，高级创作后台风格。",
          "每个角色用卡片节点表示，节点内包含中文角色名和角色功能。",
          "用箭头线表示爱情、亲属、敌对、秘密盟友、背叛等关系，线条旁写短标签。",
          "文本必须清晰可读，不要拥挤，不要输出代码块。",
          `项目：${projectTitle}`,
          "角色：",
          JSON.stringify(characters, null, 2),
          "关系描述：",
          relationshipDiagram || "请根据角色目标和冲突推断。",
        ].join("\n"),
      },
    ],
  });

  return sanitizeSvg(result.output);
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, imageUrl: "", error }, { status });
}

function isImagePermissionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("MINIMAX_IMAGE_API_ERROR:401") || message.includes("MINIMAX_IMAGE_API_ERROR:403");
}

function sanitizeSvg(raw: string) {
  const match = raw.match(/<svg[\s\S]*<\/svg>/i);
  const svg = (match?.[0] || raw)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");

  if (!/<svg[\s\S]*<\/svg>/i.test(svg)) {
    throw new Error("EMPTY_SVG_OUTPUT");
  }

  return svg;
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
