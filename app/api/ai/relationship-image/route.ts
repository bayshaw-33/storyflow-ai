import { NextResponse } from "next/server";
import { generateMiniMaxImage } from "@/lib/ai/providers/minimax";
import { authenticateRequest, consumeCredits, refundCredits } from "@/lib/supabase/server";

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
    const result = await generateMiniMaxImage(buildRelationshipPrompt(body.projectTitle, characters, body.relationshipDiagram || ""));
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
    const fallback = generateRelationshipSvg(body.projectTitle, characters, body.relationshipDiagram || "", toFriendlyError(error));
    return NextResponse.json({
      success: true,
      imageUrl: svgToDataUrl(fallback),
      provider: "local",
      model: "deterministic-svg",
      fallback: "local_svg",
      error: null,
    });
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

function generateRelationshipSvg(projectTitle = "StoryFlow 项目", characters: CharacterInput[], relationshipDiagram: string, note = "") {
  const cards = (characters.length ? characters : [{ name: "核心角色", role: "主角", goal: relationshipDiagram || "推动主线冲突" }]).slice(0, 8);
  const positions = cards.map((_, index) => {
    const columns = Math.min(4, Math.max(1, cards.length));
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: 80 + col * 300,
      y: 150 + row * 250,
    };
  });
  const relationLines = relationshipDiagram
    .split(/[；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  const nodeMarkup = cards
    .map((card, index) => {
      const pos = positions[index];
      return `
        <g>
          <rect x="${pos.x}" y="${pos.y}" width="240" height="136" rx="18" fill="#101820" stroke="#59d6a6" stroke-opacity="0.55"/>
          <text x="${pos.x + 22}" y="${pos.y + 42}" fill="#ffffff" font-size="27" font-weight="800">${escapeXml(truncate(card.name || "未命名角色", 9))}</text>
          <text x="${pos.x + 22}" y="${pos.y + 75}" fill="#59d6a6" font-size="18">${escapeXml(truncate(card.role || card.identity || "角色", 16))}</text>
          <text x="${pos.x + 22}" y="${pos.y + 105}" fill="#aeb8c8" font-size="16">${escapeXml(truncate(card.goal || card.conflict || card.secret || "", 19))}</text>
        </g>`;
    })
    .join("");

  const lineMarkup = positions.slice(0, -1)
    .map((pos, index) => {
      const next = positions[index + 1];
      const label = relationLines[index] || "关系推进";
      const x1 = pos.x + 240;
      const y1 = pos.y + 68;
      const x2 = next.x;
      const y2 = next.y + 68;
      const labelX = (x1 + x2) / 2 - 52;
      const labelY = (y1 + y2) / 2 - 10;
      return `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d6b46a" stroke-width="3" stroke-opacity="0.72" marker-end="url(#arrow)"/>
        <rect x="${labelX}" y="${labelY}" width="104" height="30" rx="15" fill="#1a241f" stroke="#d6b46a" stroke-opacity="0.45"/>
        <text x="${labelX + 52}" y="${labelY + 20}" text-anchor="middle" fill="#f5d992" font-size="13">${escapeXml(truncate(label, 12))}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#07090f"/>
        <stop offset="0.55" stop-color="#101820"/>
        <stop offset="1" stop-color="#172b23"/>
      </linearGradient>
      <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
        <path d="M2,2 L10,6 L2,10 Z" fill="#d6b46a"/>
      </marker>
    </defs>
    <rect width="1280" height="720" fill="url(#bg)"/>
    <circle cx="1090" cy="110" r="180" fill="#59d6a6" opacity="0.08"/>
    <text x="70" y="78" fill="#ffffff" font-size="34" font-weight="900">${escapeXml(truncate(projectTitle, 24))}</text>
    <text x="70" y="114" fill="#8fa29b" font-size="17">人物关系图 · StoryFlow</text>
    ${lineMarkup}
    ${nodeMarkup}
    <text x="70" y="660" fill="#7f8b99" font-size="14">${escapeXml(truncate(note || relationLines.join(" / ") || "由角色卡生成", 72))}</text>
  </svg>`;
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, imageUrl: "", error }, { status });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value = "", max = 20) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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

function isAuthOrCreditError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return [
    "MISSING_AUTH_TOKEN",
    "INVALID_AUTH_TOKEN",
    "MISSING_SUPABASE_SERVICE_ROLE_KEY",
    "INSUFFICIENT_CREDITS",
  ].includes(message);
}
