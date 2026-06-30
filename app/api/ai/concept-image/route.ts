import { NextResponse } from "next/server";
import { generateMiniMaxImage } from "@/lib/ai/providers/minimax";
import { authenticateRequest, consumeCredits, refundCredits } from "@/lib/supabase/server";

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
    const result = await generateMiniMaxImage(visualPrompt);

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
    const visualPrompt = buildConceptPrompt(body, sourcePrompt);
    const fallback = generateConceptSvg(body.kind || "scene", body.projectTitle || "Kiikis", visualPrompt, toFriendlyError(error));
    return NextResponse.json({
      success: true,
      imageUrl: svgToDataUrl(fallback),
      prompt: visualPrompt,
      provider: "local",
      model: "deterministic-svg",
      fallback: "local_svg",
      error: null,
    });
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

function generateConceptSvg(kind: "character" | "scene", projectTitle: string, prompt: string, note = "") {
  const title = kind === "character" ? "Character Concept" : "Scene Concept";
  const accent = kind === "character" ? "#5eead4" : "#93c5fd";
  const shape = kind === "character"
    ? '<circle cx="512" cy="310" r="110" fill="#e5e7eb"/><path d="M345 750 C370 560 450 465 512 465 C574 465 654 560 679 750Z" fill="#0f766e"/><path d="M420 306 C445 230 580 230 604 306 C570 276 496 262 420 306Z" fill="#111827"/>'
    : '<rect x="168" y="250" width="688" height="352" rx="24" fill="#111827" stroke="#93c5fd" stroke-opacity=".45"/><path d="M202 560 L380 388 L520 492 L650 345 L824 560Z" fill="#1d4ed8" opacity=".58"/><circle cx="724" cy="318" r="46" fill="#fde68a" opacity=".82"/>';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#05070c"/>
        <stop offset=".58" stop-color="#111827"/>
        <stop offset="1" stop-color="#172554"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="768" fill="url(#bg)"/>
    <circle cx="820" cy="110" r="220" fill="${accent}" opacity=".12"/>
    <rect x="72" y="62" width="880" height="644" rx="34" fill="#0b1018" opacity=".86" stroke="${accent}" stroke-opacity=".38"/>
    ${shape}
    <text x="112" y="132" fill="#ffffff" font-size="42" font-weight="900">${escapeXml(title)}</text>
    <text x="112" y="178" fill="${accent}" font-size="22" font-weight="700">${escapeXml(truncate(projectTitle, 28))}</text>
    <text x="112" y="666" fill="#cbd5e1" font-size="18">${escapeXml(truncate(prompt, 88))}</text>
    <text x="112" y="696" fill="#64748b" font-size="14">${escapeXml(truncate(note || "kiikis concept image", 86))}</text>
  </svg>`;
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
  if (message === "MISSING_MINIMAX_API_KEY") return "MiniMax 图片生成尚未完成服务端配置，请在 Vercel 环境变量中添加 MINIMAX_API_KEY 后重新部署。";
  if (message.includes("MINIMAX_IMAGE_API_ERROR:401") || message.includes("MINIMAX_IMAGE_API_ERROR:403")) return "图片生成配置无效或权限不足，请检查 API Key / Token Plan 权限。";
  if (message.includes("MINIMAX_IMAGE_API_ERROR:429")) return "图片生成请求过于频繁，请稍后再试。";
  if (message === "EMPTY_MINIMAX_IMAGE_OUTPUT") return "图片模型没有返回可用图片，请稍后重新生成。";
  return "图片生成失败，已生成本地预览占位。";
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(value = "", max = 20) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
