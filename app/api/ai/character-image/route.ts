import { NextResponse } from "next/server";
import { callMiniMax, generateMiniMaxImage } from "@/lib/ai/providers/minimax";
import { authenticateRequest, consumeCredits, refundCredits } from "@/lib/supabase/server";

type CharacterInput = {
  name?: string;
  role?: string;
  identity?: string;
  goal?: string;
  weakness?: string;
  secret?: string;
  arc?: string;
  conflict?: string;
  entrance?: string;
  line?: string;
  appearancePrompt?: string;
};

type CharacterImageRequest = {
  projectTitle?: string;
  market?: string;
  genre?: string;
  character?: CharacterInput;
  context?: string;
};

export async function POST(request: Request) {
  let body: CharacterImageRequest;
  let userId = "";
  const creditCost = 2;

  try {
    body = (await request.json()) as CharacterImageRequest;
  } catch {
    return failure("请求格式不正确，请提交 JSON。", 400);
  }

  const character = body.character;
  if (!character?.name?.trim() && !character?.appearancePrompt?.trim()) {
    return failure("请先填写角色名称或人物形象提示词。", 400);
  }

  try {
    const user = await authenticateRequest(request);
    userId = user.id;
    await consumeCredits(user.id, creditCost);
    const visualPrompt = await buildVisualPrompt(body);
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
    const visualPrompt = buildLocalVisualPrompt(body);
    const fallback = generateCharacterSvg(body, visualPrompt, toFriendlyError(error));
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

async function buildVisualPrompt(body: CharacterImageRequest) {
  const fallbackPrompt = buildLocalVisualPrompt(body);

  try {
    const promptResult = await callMiniMax({
      temperature: 0.6,
      maxTokens: 900,
      messages: [
        {
          role: "system",
          content:
            "你是 kiikis 的角色视觉提示词设计师。只输出一段可直接用于图片生成的提示词，不要解释，不要 Markdown。",
        },
        {
          role: "user",
          content: [
            "请把以下角色卡整理成 MiniMax 图片生成提示词。",
            "要求：保留角色气质和戏剧功能；避免多人同框；输出单人角色概念图；画面适合海外漫剧/竖屏短剧；包含年龄、性别、发型、服装、表情、姿态、镜头、光线、色彩、背景。",
            "不要生成血腥、色情、过度暴力内容。",
            `项目：${body.projectTitle || "kiikis project"}`,
            `市场：${body.market || "未选择"}`,
            `题材：${body.genre || "未选择"}`,
            body.context ? `项目上下文：${body.context.slice(0, 1200)}` : "",
            "角色卡：",
            JSON.stringify(body.character || {}, null, 2),
            "",
            "如果角色卡信息不足，请基于题材补全一个高辨识度但不俗套的视觉方案。",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    return promptResult.output.trim() || fallbackPrompt;
  } catch {
    return fallbackPrompt;
  }
}

function buildLocalVisualPrompt(body: CharacterImageRequest) {
  const character = body.character || {};
  return [
    character.appearancePrompt || "",
    `${character.name || "角色"}，${character.role || "戏剧角色"}，${character.identity || ""}`,
    character.entrance ? `首次登场画面：${character.entrance}` : "",
    "vertical drama character concept art, cinematic lighting, high-end comic drama style, clean background, expressive eyes, half-body portrait",
  ]
    .filter(Boolean)
    .join("，");
}

function generateCharacterSvg(body: CharacterImageRequest, visualPrompt: string, note = "") {
  const character = body.character || {};
  const name = character.name || "未命名角色";
  const role = character.role || character.identity || "角色";
  const line = character.line || character.goal || character.conflict || "推动故事冲突";
  const accent = pickAccent(body.genre || character.role || "");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#06080f"/>
        <stop offset="0.58" stop-color="#111821"/>
        <stop offset="1" stop-color="${accent.dark}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="34%" r="55%">
        <stop offset="0" stop-color="${accent.light}" stop-opacity="0.42"/>
        <stop offset="1" stop-color="${accent.light}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="768" height="1024" fill="url(#bg)"/>
    <circle cx="384" cy="350" r="320" fill="url(#glow)"/>
    <rect x="64" y="68" width="640" height="888" rx="36" fill="#0e151d" opacity="0.78" stroke="${accent.light}" stroke-opacity="0.42"/>
    <circle cx="384" cy="316" r="138" fill="${accent.mid}" opacity="0.72"/>
    <path d="M248 330 C270 202 498 202 520 330 C500 450 268 450 248 330Z" fill="#f0efe7" opacity="0.92"/>
    <path d="M255 315 C292 200 475 190 520 316 C482 275 411 258 330 282 C294 292 272 305 255 315Z" fill="#111827"/>
    <circle cx="342" cy="340" r="8" fill="#101820"/>
    <circle cx="426" cy="340" r="8" fill="#101820"/>
    <path d="M350 392 C372 410 402 410 424 392" fill="none" stroke="#101820" stroke-width="7" stroke-linecap="round"/>
    <path d="M210 762 C235 588 305 494 384 494 C463 494 533 588 558 762Z" fill="${accent.mid}" opacity="0.92"/>
    <path d="M273 760 L384 516 L495 760Z" fill="#0b1017" opacity="0.82"/>
    <text x="384" y="118" text-anchor="middle" fill="#ffffff" font-size="44" font-weight="900">${escapeXml(truncate(name, 12))}</text>
    <text x="384" y="162" text-anchor="middle" fill="${accent.light}" font-size="23" font-weight="800">${escapeXml(truncate(role, 18))}</text>
    <text x="384" y="835" text-anchor="middle" fill="#ffffff" font-size="24" font-weight="800">${escapeXml(truncate(line, 24))}</text>
    <text x="384" y="876" text-anchor="middle" fill="#9aa7b7" font-size="16">${escapeXml(truncate(visualPrompt, 44))}</text>
    <text x="384" y="920" text-anchor="middle" fill="#647186" font-size="13">${escapeXml(truncate(note || "kiikis character", 58))}</text>
  </svg>`;
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, imageUrl: "", prompt: "", error }, { status });
}

function pickAccent(seed: string) {
  if (seed.includes("狼人") || seed.toLowerCase().includes("alpha")) return { dark: "#14251f", mid: "#356b55", light: "#78e0ae" };
  if (seed.includes("黑帮") || seed.includes("犯罪")) return { dark: "#241416", mid: "#7f2c35", light: "#f07f86" };
  if (seed.includes("恐怖") || seed.includes("异能")) return { dark: "#1d1730", mid: "#54378a", light: "#b997ff" };
  if (seed.includes("神话")) return { dark: "#28210f", mid: "#8a6926", light: "#f0d27a" };
  return { dark: "#172b23", mid: "#2d7257", light: "#59d6a6" };
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
    return "请先登录后再生成角色图片。";
  }

  if (message === "MISSING_SUPABASE_SERVICE_ROLE_KEY") {
    return "额度系统尚未完成服务端配置，请在 Vercel 添加 SUPABASE_SERVICE_ROLE_KEY。";
  }

  if (message === "INSUFFICIENT_CREDITS") {
    return "本月 AI 额度已用完，暂时不能继续生成角色图片。";
  }

  if (message === "MISSING_MINIMAX_API_KEY") {
    return "MiniMax 尚未完成服务端配置，请在 Vercel 环境变量中添加 MINIMAX_API_KEY 后重新部署。";
  }

  if (message.includes("MINIMAX_API_ERROR:401") || message.includes("MINIMAX_API_ERROR:403") || message.includes("MINIMAX_IMAGE_API_ERROR:401") || message.includes("MINIMAX_IMAGE_API_ERROR:403")) {
    return "MiniMax 配置无效或权限不足，请检查 API Key / Token Plan 权限。";
  }

  if (message.includes("MINIMAX_API_ERROR:429") || message.includes("MINIMAX_IMAGE_API_ERROR:429")) {
    return "MiniMax 请求过于频繁，请稍后再试。";
  }

  if (message === "MINIMAX_TIMEOUT" || message === "MINIMAX_NETWORK_ERROR") {
    return "连接 MiniMax 失败或超时，请稍后重试。已有角色内容已保留。";
  }

  if (message === "EMPTY_MINIMAX_OUTPUT" || message === "EMPTY_MINIMAX_IMAGE_OUTPUT") {
    return "MiniMax 未返回可用图片，请重新生成。";
  }

  return "角色图片生成失败，请稍后重试。";
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
