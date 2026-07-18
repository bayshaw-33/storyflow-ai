import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/providers/deepseek";
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
    const generated = await generateArtImages(
      buildActorTextToImageRequest({ prompt: visualPrompt, aspectRatio: "9:16" }),
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

async function buildVisualPrompt(body: CharacterImageRequest) {
  const fallbackPrompt = buildLocalVisualPrompt(body);

  try {
    const promptResult = await callDeepSeek({
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
            "请把以下角色卡整理成 AI 图片生成提示词。",
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

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, imageUrl: "", prompt: "", error }, { status });
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
    return "图片生成超时，请稍后重试。已有角色内容已保留。";
  }

  if (message === "ATLAS_EMPTY_OUTPUT" || message === "ATLAS_GENERATION_FAILED" || message === "BFL_GENERATION_FAILED" || message === "EMPTY_ART_IMAGE_OUTPUT") {
    return "图片模型未返回可用图片，请重新生成。";
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
