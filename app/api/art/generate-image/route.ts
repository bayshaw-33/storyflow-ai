import { NextResponse } from "next/server";
import { buildArtImagePrompt, type ArtAsset as LegacyArtAsset } from "@/lib/art-workbench";
import { generateArtImages, isAtlasAuthorizedUser, type ArtImageRequest } from "@/lib/art/providers";
import { normalizeCandidateCount } from "@/lib/art/state";
import { persistRemoteArtImage, signStoredArtImage } from "@/lib/supabase/art-storage";
import { authenticateRequest } from "@/lib/supabase/server";
import { ART_JOB_TIMEOUT_MS, artCloudErrorStatus, assertArtCloudImagePath, readArtCloudJob, refreshArtCloudJobImages, resolveArtCloudScope, writeArtCloudJob, type ArtCloudJob, type ArtCloudScope } from "@/lib/art/cloud-store";

type GenerateImageRequest = Partial<ArtImageRequest> & {
  projectId?: string;
  assetId?: string;
  asset?: LegacyArtAsset;
  mode?: "reference_sheet" | "three_view" | "concept";
  visualStyle?: string;
  scope?: ArtCloudScope;
  jobId?: string;
  referencePaths?: string[];
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

  let claimedJob: ArtCloudJob | null = null;
  let userId = "";
  let cloudScope: ArtCloudScope | undefined;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("ART_SCOPE_INVALID");
    cloudScope = body.scope;
    if (body.jobId !== undefined && !cloudScope) throw new Error("ART_JOB_SCOPE_REQUIRED");
    const prefix = cloudScope !== undefined ? resolveArtCloudScope(user.id, cloudScope) : null;
    const jobId = prefix ? body.jobId ?? crypto.randomUUID() : null;
    if (jobId !== null) {
      const existing = await readArtCloudJob(user.id, cloudScope!, jobId);
      if (existing) return jobResponse(await refreshArtCloudJobImages(user.id, existing));
    }
    const normalized = normalizeRequest(body);
    normalized.referenceUrls = await resolveReferences(user.id, body);
    const projectId = prefix ? prefix.slice(user.id.length + 1) : body.projectId || "unassigned";
    const assetId = body.assetId || body.asset?.id || "draft";
    assertArtCloudImagePath(user.id, `${user.id}/${projectId}/generated/${assetId}/probe.png`);
    if (jobId !== null) {
      const now = new Date().toISOString();
      const running: ArtCloudJob = {
        jobId, status: "running", createdAt: now, updatedAt: now,
        expiresAt: new Date(Date.now() + ART_JOB_TIMEOUT_MS).toISOString(), images: [], prompt: normalized.prompt, error: null,
      };
      const claimed = await writeArtCloudJob(user.id, cloudScope!, running, { createOnly: true });
      if (!claimed) {
        const existing = await readArtCloudJob(user.id, cloudScope!, jobId);
        if (!existing) throw new Error("ART_STORAGE_JOB_CLAIM_ERROR");
        return jobResponse(await refreshArtCloudJobImages(user.id, existing));
      }
      claimedJob = running;
    }
    const generated = await generateArtImages(normalized, { atlasAuthorized: isAtlasAuthorizedUser(user) });
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

    if (claimedJob) {
      const completed: ArtCloudJob = { ...claimedJob, status: "completed", images, updatedAt: new Date().toISOString() };
      await writeArtCloudJob(user.id, cloudScope!, completed);
      return jobResponse(completed);
    }
    return NextResponse.json({
      success: true,
      images,
      imageUrl: images[0]?.previewUrl || "",
      provider: images[0]?.provider,
      model: images[0]?.model,
      prompt: normalized.prompt,
      jobId: null,
      error: null,
    });
  } catch (error) {
    const message = toFriendlyError(error);
    if (claimedJob && cloudScope) {
      const failed: ArtCloudJob = { ...claimedJob, status: "failed", updatedAt: new Date().toISOString(), error: message };
      try { await writeArtCloudJob(userId, cloudScope, failed); } catch {
        return failure("生成任务状态保存失败，请查询原任务；请勿自动重新生成。", 502, claimedJob.jobId);
      }
    }
    const status = isForbiddenError(error) ? 403 : error instanceof Error && error.message === "ART_ASSET_REQUIRED" ? 400 : artCloudErrorStatus(error);
    return failure(message, status, claimedJob?.jobId ?? body?.jobId);
  }
}

function jobResponse(job: ArtCloudJob) {
  return NextResponse.json({
    success: job.status !== "failed", jobId: job.jobId, status: job.status, job,
    images: job.images, imageUrl: job.images[0]?.previewUrl || "",
    provider: job.images[0]?.provider, model: job.images[0]?.model, prompt: job.prompt,
    error: job.error,
  }, { status: job.status === "running" ? 202 : job.status === "failed" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
}

async function resolveReferences(userId: string, body: GenerateImageRequest): Promise<string[]> {
  if (body.referencePaths !== undefined && !Array.isArray(body.referencePaths) || body.referenceUrls !== undefined && !Array.isArray(body.referenceUrls)) throw new Error("ART_REFERENCE_INVALID");
  const paths: unknown[] = [...(body.referencePaths || [])];
  const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://invalid.local").origin;
  for (const raw of body.referenceUrls || []) {
    if (typeof raw !== "string" || raw.includes("/../") || raw.includes("/./")) throw new Error("ART_STORAGE_PATH_FORBIDDEN");
    let url: URL;
    try { url = new URL(raw); } catch { throw new Error("ART_STORAGE_PATH_FORBIDDEN"); }
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:sign|authenticated)\/art-assets\/(.+)$/);
    if (url.origin !== storageOrigin || !match) throw new Error("ART_STORAGE_PATH_FORBIDDEN");
    paths.push(match[1]);
  }
  if (paths.length > 14) throw new Error("ART_REFERENCE_INVALID");
  for (const path of paths) assertArtCloudImagePath(userId, path);
  return Promise.all([...new Set(paths as string[])].map(path => signStoredArtImage(path, 60 * 60)));
}

function normalizeRequest(body: GenerateImageRequest): ArtImageRequest {
  if (body.prompt !== undefined && typeof body.prompt !== "string" || body.aspectRatio !== undefined && !["1:1", "4:3", "3:4", "16:9", "9:16"].includes(body.aspectRatio)) throw new Error("ART_REQUEST_INVALID");
  if (body.prompt?.trim()) {
    return {
      task: body.task || "concept",
      prompt: body.prompt.trim(),
      negativePrompt: body.negativePrompt || "",
      referenceUrls: [],
      aspectRatio: body.aspectRatio || "9:16",
      count: normalizeCandidateCount(body.count),
      seed: typeof body.seed === "number" ? body.seed : undefined,
      selection: body.selection || "smart",
      modelId: body.modelId,
    };
  }
  if (typeof body.asset?.name !== "string" || !body.asset.name.trim()) throw new Error("ART_ASSET_REQUIRED");
  const task = body.mode === "reference_sheet" || body.mode === "three_view" ? "reference_sheet" : "concept";
  return {
    task,
    prompt: buildArtImagePrompt(body.asset, body.mode || "concept", body.visualStyle || ""),
    negativePrompt: body.asset.negativePrompt,
    referenceUrls: [],
    aspectRatio: body.aspectRatio || "9:16",
    count: 1,
    selection: "smart",
  };
}

function failure(error: string, status: number, jobId?: string | null) {
  return NextResponse.json({ success: false, images: [], imageUrl: "", error, jobId: jobId || null }, { status });
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
  if (message === "ART_STORAGE_PATH_FORBIDDEN") return "无权使用该图片路径。";
  if (artCloudErrorStatus(error) === 400) return "请求或作用域格式不正确。";
  if (artCloudErrorStatus(error) === 413) return "请求超出长度限制。";
  if (message === "MISSING_BFL_API_KEY") return "平台 FLUX 图片服务尚未配置。";
  if (message === "MISSING_ATLASCLOUD_API_KEY") return "Atlas Cloud 图片服务尚未配置。";
  if (message === "ART_MODEL_PROVIDER_MISMATCH") return "当前账号无权使用所选图片模型。";
  if (message.includes("429")) return "图片生成请求过于频繁，请稍后重试。";
  if (message.includes("STORAGE")) return "美术资产存储失败，请查询原任务状态。";
  return "美术图片生成失败，请稍后重试。";
}
