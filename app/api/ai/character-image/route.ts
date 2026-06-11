import { NextResponse } from "next/server";
import { callMiniMax, generateMiniMaxImage } from "@/lib/ai/providers/minimax";

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
    if (isImagePermissionError(error)) {
      try {
        const visualPrompt = await buildVisualPrompt(body);
        const fallback = await generateCharacterSvg(body, visualPrompt);
        return NextResponse.json({
          success: true,
          imageUrl: svgToDataUrl(fallback),
          prompt: visualPrompt,
          provider: "minimax",
          model: "MiniMax-M3",
          fallback: "svg",
          error: null,
        });
      } catch {
        return failure("MiniMax 图片生成权限不足，且 SVG 角色图兜底生成失败。请检查 MiniMax 文本模型和 image-01 权限。", 500);
      }
    }

    return failure(toFriendlyError(error), 500);
  }
}

async function buildVisualPrompt(body: CharacterImageRequest) {
  const character = body.character || {};
  const fallbackPrompt = [
    character.appearancePrompt || "",
    `${character.name || "角色"}，${character.role || "戏剧角色"}，${character.identity || ""}`,
    character.entrance ? `首次登场画面：${character.entrance}` : "",
    "vertical drama character concept art, cinematic lighting, high-end comic drama style, clean background, expressive eyes, half-body portrait",
  ]
    .filter(Boolean)
    .join("，");

  const promptResult = await callMiniMax({
    temperature: 0.6,
    maxTokens: 900,
    messages: [
      {
        role: "system",
        content:
          "你是 StoryFlow AI 的角色视觉提示词设计师。只输出一段可直接用于图片生成的提示词，不要解释，不要 Markdown。",
      },
      {
        role: "user",
        content: [
          "请把以下角色卡整理成 MiniMax 图片生成提示词。",
          "要求：保留角色气质和戏剧功能；避免多人同框；输出单人角色概念图；画面适合海外漫剧/竖屏短剧；包含年龄、性别、发型、服装、表情、姿态、镜头、光线、色彩、背景。",
          "不要生成血腥、色情、过度暴力内容。",
          `项目：${body.projectTitle || "StoryFlow 项目"}`,
          `市场：${body.market || "未选择"}`,
          `题材：${body.genre || "未选择"}`,
          body.context ? `项目上下文：${body.context.slice(0, 1200)}` : "",
          "角色卡：",
          JSON.stringify(character, null, 2),
          "",
          "如果角色卡信息不足，请基于题材补全一个高辨识度但不俗套的视觉方案。",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  return promptResult.output.trim() || fallbackPrompt;
}

async function generateCharacterSvg(body: CharacterImageRequest, visualPrompt: string) {
  const result = await callMiniMax({
    temperature: 0.45,
    maxTokens: 2200,
    messages: [
      {
        role: "system",
        content:
          "你是 StoryFlow AI 的角色概念图设计师。只输出一个完整 SVG，不要 Markdown，不要解释。SVG 必须安全：禁止 script、foreignObject、外链图片、事件属性。",
      },
      {
        role: "user",
        content: [
          "请生成一张 768x1024 的单人角色概念图 SVG。",
          "风格：深色高级漫剧角色卡，半身肖像感，清晰轮廓，戏剧化光线。",
          "可以用抽象插画、几何剪影、服装色块和文字标签表达角色，不要追求照片真实。",
          "顶部显示角色名，底部显示一句短标签；整体必须是图片构图，不要像表格。",
          `项目：${body.projectTitle || "StoryFlow 项目"}`,
          `题材：${body.genre || "未选择"}`,
          "角色卡：",
          JSON.stringify(body.character || {}, null, 2),
          "视觉提示词：",
          visualPrompt,
        ].join("\n"),
      },
    ],
  });

  return sanitizeSvg(result.output);
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, imageUrl: "", prompt: "", error }, { status });
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
