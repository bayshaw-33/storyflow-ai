import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/providers/deepseek";
import { callAtlasLLM, isAtlasLLMConfigured } from "@/lib/ai/providers/atlas-llm";
import { resolveSavedApiConfig } from "@/lib/supabase/api-connections";
import { authenticateRequest } from "@/lib/supabase/server";
import { fallbackExtractArtAssets, type ArtCharacterPriority, type ExtractedArtAssets } from "@/lib/art-workbench";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExtractRequest = {
  title?: string;
  visualStyle?: string;
  sourceText?: string;
};

export async function POST(request: Request) {
  let body: ExtractRequest;
  try {
    body = (await request.json()) as ExtractRequest;
  } catch {
    return failure("请求格式不正确，请提交 JSON。", 400);
  }

  const sourceText = String(body.sourceText || "").trim();
  if (!sourceText) return failure("请先上传或粘贴剧本、项目背景、角色圣经等资料。", 400);

  let user;
  try {
    user = await authenticateRequest(request);
  } catch (error) {
    if (isAuthError(error)) return failure("请先登录后再使用美术资产自动拆解。", 401);
    return failure("认证失败，请重新登录。", 401);
  }

  const savedConfig = await resolveSavedApiConfig(user.id, "deepseek").catch(() => null);
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content:
        "你是 Kiikis 的影视美术统筹。只输出 JSON，不要输出解释。你要根据剧本、项目背景、角色圣经自动拆解项目中的角色、场景和关键道具，并为每个资产生成可编辑的图片提示词。",
    },
    {
      role: "user",
      content: buildExtractionPrompt(body.title || "Kiikis 美术项目", body.visualStyle || "", sourceText),
    },
  ];

  // 尝试顺序：DeepSeek（用户 BYO key 或环境变量）→ Atlas Cloud → 本地规则 fallback
  let lastError: Error | null = null;
  const attempts: Array<{ provider: () => Promise<{ output: string; provider: string; model: string }>; name: string }> = [];

  // 1. DeepSeek（始终尝试，因为有默认模型保护）
  attempts.push({
    name: "DeepSeek",
    provider: () =>
      callDeepSeek({
        apiKeyOverride: savedConfig?.deepseekApiKey,
        modelOverride: savedConfig?.deepseekModel,
        temperature: 0.3,
        maxTokens: 6000,
        messages,
      }),
  });

  // 2. Atlas Cloud fallback（配置了 ATLASCLOUD_API_KEY 时启用）
  if (isAtlasLLMConfigured()) {
    attempts.push({
      name: "Atlas",
      provider: () =>
        callAtlasLLM({
          modelOverride: savedConfig?.atlasModel,
          temperature: 0.3,
          maxTokens: 6000,
          messages,
        }),
    });
  }

  for (const attempt of attempts) {
    try {
      const result = await attempt.provider();
      const parsed = parseExtraction(result.output);
      return NextResponse.json({
        success: true,
        ...parsed,
        provider: result.provider,
        model: result.model,
        degraded: false,
        error: null,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[art/extract-assets] ${attempt.name} failed:`, lastError.message.slice(0, 200));
    }
  }

  // 3. 所有 AI 都失败，使用本地规则 fallback
  const fallback = fallbackExtractArtAssets(sourceText);
  const rawError = lastError ? lastError.message : "UNKNOWN_AI_ERROR";
  console.error("[art/extract-assets] All AI providers failed, using local fallback", { detail: rawError.slice(0, 200) });
  return NextResponse.json({
    success: true,
    ...fallback,
    provider: "local",
    model: "fallback-extractor",
    degraded: true,
    warning: `AI 自动拆解失败，已根据剧本资料生成基础初稿。失败原因：${toFriendlyError(lastError)}`,
    error: rawError.slice(0, 200),
  });
}

function buildExtractionPrompt(title: string, visualStyle: string, sourceText: string) {
  return [
    `项目名称：${title}`,
    visualStyle ? `项目画风：${visualStyle}` : "",
    "请输出严格 JSON，结构如下：",
    `{
  "title": "项目美术设定标题",
  "visualStyle": "统一项目画风",
  "characters": [
    {
      "name": "角色名",
      "priority": "lead|supporting|minor",
      "role": "叙事功能",
      "description": "外貌、年龄感、气质、服装、剧中身份",
      "prompt": "可直接用于生成角色参考表的英文或中英混合提示词",
      "negativePrompt": "负面提示词"
    }
  ],
  "scenes": [
    {
      "name": "场景名",
      "role": "剧情功能",
      "description": "空间、时代、色彩、灯光、关键陈设",
      "prompt": "可直接用于生成场景概念图的提示词",
      "negativePrompt": "负面提示词"
    }
  ],
  "props": [
    {
      "name": "道具名",
      "role": "剧情功能",
      "description": "材质、形态、使用方式、象征意义",
      "prompt": "可直接用于生成关键道具概念图的提示词",
      "negativePrompt": "负面提示词"
    }
  ]
}`,
    "要求：",
    "1. 主角必须排在 characters 第一位，priority 为 lead。",
    "2. 角色、场景、道具数量根据资料完整提取，不要只给示例。",
    "3. prompt 必须适合影视美术设定图、角色参考表、三视图后续生成。",
    "4. 不要输出 markdown，不要包裹代码块。",
    "5. 角色名、场景名、道具名必须使用中文（如果剧本是中文的话）。",
    "",
    "资料：",
    sourceText.slice(0, 28000),
  ].filter(Boolean).join("\n");
}

function parseExtraction(output: string): ExtractedArtAssets {
  const jsonText = extractJsonObject(output);
  const parsed = JSON.parse(jsonText) as Partial<ExtractedArtAssets>;
  return {
    title: String(parsed.title || "美术资产拆解"),
    visualStyle: String(parsed.visualStyle || "cinematic short drama, consistent production design"),
    characters: normalizeAssetList(parsed.characters, "character"),
    scenes: normalizeAssetList(parsed.scenes, "scene"),
    props: normalizeAssetList(parsed.props, "prop"),
  };
}

function extractJsonObject(output: string) {
  const cleaned = output
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
    throw new Error("ART_EXTRACTION_JSON_PARSE_FAILED");
  }
}

function normalizeAssetList(value: unknown, kind: "character" | "scene" | "prop") {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const record = isRecord(item) ? item : {};
    const priority: ArtCharacterPriority = record.priority === "lead" || record.priority === "supporting" || record.priority === "minor"
      ? record.priority
      : kind === "character" && index === 0
        ? "lead"
        : "supporting";
    return {
      name: String(record.name || (kind === "character" ? `角色 ${index + 1}` : kind === "scene" ? `场景 ${index + 1}` : `道具 ${index + 1}`)),
      priority,
      role: String(record.role || ""),
      description: String(record.description || ""),
      prompt: String(record.prompt || record.description || record.name || ""),
      negativePrompt: String(record.negativePrompt || "low quality, blurry, watermark, logo, text"),
    };
  });
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN";
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("ATLAS_LLM") || message.includes("DEEPSEEK")) return "AI 服务暂时不可用，已使用本地规则生成初稿。";
  if (message.includes("TIMEOUT") || message.includes("NETWORK")) return "AI 连接超时，已使用本地规则生成初稿。";
  if (message.includes("JSON_PARSE")) return "AI 返回格式无法解析，已使用本地规则生成初稿。";
  return "AI 拆解失败，已使用本地规则生成初稿。";
}
