import { NextResponse } from "next/server";
import { buildArtImagePrompt, type ArtAsset as LegacyArtAsset } from "@/lib/art-workbench";
import { generateArtImages, isAtlasAuthorizedUser, type ArtImageRequest } from "@/lib/art/providers";
import { normalizeCandidateCount } from "@/lib/art/state";
import { persistRemoteArtImage } from "@/lib/supabase/art-storage";
import { authenticateRequest } from "@/lib/supabase/server";

type GenerateImageRequest = Partial<ArtImageRequest> & {
  projectId?: string;
  assetId?: string;
  asset?: LegacyArtAsset;
  mode?: "reference_sheet" | "three_view" | "concept";
  visualStyle?: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: GenerateImageRequest;
  try {
    body = await request.json() as GenerateImageRequest;
  } catch {
    return failure("请求格式不正确，请提交 JSON。", 400);
  }

  try {
    const user = await authenticateRequest(request);
    const normalized = normalizeRequest(body);
    const generated = await generateArtImages(normalized, { atlasAuthorized: isAtlasAuthorizedUser(user) });
    const projectId = body.projectId || "unassigned";
    const assetId = body.assetId || body.asset?.id || "draft";
    const images = await Promise.all(generated.map(async (image, index) => ({
      ...image,
      ...await persistRemoteArtImage({
        userId: user.id,
        projectId,
        assetId,
        remoteUrl: image.imageUrl,
        providerTaskId: image.providerTaskId,
        index,
      }),
    })));

    return NextResponse.json({
      success: true,
      images,
      imageUrl: images[0]?.previewUrl || "",
      provider: images[0]?.provider,
      model: images[0]?.model,
      prompt: normalized.prompt,
      error: null,
    });
  } catch (error) {
    return failure(toFriendlyError(error), isAuthError(error) ? 401 : isForbiddenError(error) ? 403 : 502);
  }
}

function normalizeRequest(body: GenerateImageRequest): ArtImageRequest {
  if (body.prompt?.trim()) {
    return {
      task: body.task || "concept",
      prompt: body.prompt.trim(),
      negativePrompt: body.negativePrompt || "",
      referenceUrls: Array.isArray(body.referenceUrls) ? body.referenceUrls.filter((url): url is string => typeof url === "string" && url.startsWith("http")) : [],
      aspectRatio: body.aspectRatio || (body.task === "reference_sheet" ? "4:3" : "16:9"),
      count: normalizeCandidateCount(body.count),
      seed: typeof body.seed === "number" ? body.seed : undefined,
      selection: body.selection || "smart",
      modelId: body.modelId,
    };
  }
  if (!body.asset?.name?.trim()) throw new Error("ART_ASSET_REQUIRED");
  const task = body.mode === "reference_sheet" || body.mode === "three_view" ? "reference_sheet" : "concept";
  return {
    task,
    prompt: buildArtImagePrompt(body.asset, body.mode || "concept", body.visualStyle || ""),
    negativePrompt: body.asset.negativePrompt,
    referenceUrls: [],
    aspectRatio: task === "reference_sheet" ? "4:3" : "16:9",
    count: 1,
    selection: "smart",
  };
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, images: [], imageUrl: "", error }, { status });
}

function isAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN";
}

function isForbiddenError(error: unknown) {
  return error instanceof Error && error.message === "ART_MODEL_PROVIDER_MISMATCH";
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (isAuthError(error)) return "请先登录后再生成美术图片。";
  if (message === "ART_ASSET_REQUIRED") return "缺少美术资产或提示词。";
  if (message === "MISSING_BFL_API_KEY") return "平台 FLUX 图片服务尚未配置。";
  if (message === "MISSING_ATLASCLOUD_API_KEY") return "Atlas Cloud 图片服务尚未配置。";
  if (message === "ART_MODEL_PROVIDER_MISMATCH") return "当前账号无权使用所选图片模型。";
  if (message.includes("429")) return "图片生成请求过于频繁，请稍后重试。";
  if (message.includes("STORAGE")) return "图片已经生成，但保存到 Kiikis 资产库失败，请重试。";
  return "美术图片生成失败，请稍后重试。";
}
