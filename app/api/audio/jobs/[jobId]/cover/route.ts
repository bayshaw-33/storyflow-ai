import { NextResponse } from "next/server";
import { generateArtImages } from "@/lib/art/providers";
import { ART_BUCKET, persistRemoteArtImage, signStoredArtImage } from "@/lib/supabase/art-storage";
import { authenticateRequest, getSupabaseServerClient, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type CoverMetadata = {
  storagePath: string;
  provider: string;
  model: string;
  prompt: string;
  generatedAt: string;
};

type MusicJobRow = {
  id: string;
  owner_id: string;
  project_id: string | null;
  job_type: string;
  target_type: string;
  prompt: string;
  input_params: Record<string, unknown> | null;
  result_metadata: Record<string, unknown> | null;
};

const TABLE = "/rest/v1/storyflow_generation_jobs";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const user = await authenticate(request);
  if (user instanceof NextResponse) return user;
  const projectId = getProjectId(request);
  if (!projectId) return NextResponse.json({ success: false, error: "缺少项目 ID。" }, { status: 400 });

  const job = await readMusicJob((await context.params).jobId, user.id, projectId);
  if (!job) return NextResponse.json({ success: false, error: "音乐任务不存在或不属于当前项目。" }, { status: 404 });

  const existing = readCoverMetadata(job.result_metadata);
  if (existing?.storagePath) {
    const coverUrl = await signStoredArtImage(existing.storagePath);
    return NextResponse.json({ success: true, created: false, coverUrl, cover: existing });
  }

  const prompt = buildCoverPrompt(job);
  try {
    const generated = await generateArtImages({
      task: "concept",
      prompt,
      negativePrompt: "readable text, typography, logos, watermark, album UI, border, frame, blurry, low detail",
      referenceUrls: [],
      aspectRatio: "1:1",
      count: 1,
      selection: "flux",
      modelId: "flux-2-max",
    }, { atlasAuthorized: false });
    const image = generated[0];
    if (!image) throw new Error("COVER_IMAGE_EMPTY");
    const stored = await persistRemoteArtImage({
      userId: user.id,
      projectId,
      assetId: job.id,
      remoteUrl: image.imageUrl,
      providerTaskId: image.providerTaskId,
      index: 0,
    });
    const cover: CoverMetadata = {
      storagePath: stored.storagePath,
      provider: image.provider,
      model: image.model,
      prompt,
      generatedAt: new Date().toISOString(),
    };
    await serviceFetch<MusicJobRow[]>(`${TABLE}?id=eq.${encodeURIComponent(job.id)}&owner_id=eq.${encodeURIComponent(user.id)}&project_id=eq.${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ result_metadata: { ...(job.result_metadata || {}), cover } }),
    });
    return NextResponse.json({ success: true, created: true, coverUrl: stored.previewUrl, cover });
  } catch (error) {
    return NextResponse.json({ success: false, error: friendlyError(error) }, { status: 502 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const user = await authenticate(request);
  if (user instanceof NextResponse) return user;
  const projectId = getProjectId(request);
  if (!projectId) return NextResponse.json({ success: false, error: "缺少项目 ID。" }, { status: 400 });

  const job = await readMusicJob((await context.params).jobId, user.id, projectId);
  const cover = readCoverMetadata(job?.result_metadata);
  if (!job || !cover?.storagePath) return NextResponse.json({ success: false, error: "歌曲封面尚未生成。" }, { status: 404 });

  const serverClient = getSupabaseServerClient();
  if (!serverClient) return NextResponse.json({ success: false, error: "图片存储服务未配置。" }, { status: 503 });
  const extension = cover.storagePath.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "png";
  const title = typeof job.input_params?.title === "string" ? job.input_params.title : "kiikis-song-cover";
  const filename = `${safeFilePart(title)}.${extension}`;
  const signed = await serverClient.storage.from(ART_BUCKET).createSignedUrl(cover.storagePath, 60, { download: filename });
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ success: false, error: "封面下载链接生成失败，请重试。" }, { status: 502 });
  return NextResponse.json({ success: true, downloadUrl: signed.data.signedUrl, filename }, { headers: { "Cache-Control": "private, no-store" } });
}

async function authenticate(request: Request) {
  try {
    return await authenticateRequest(request);
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }
}

async function readMusicJob(jobId: string, userId: string, projectId: string) {
  const rows = await serviceFetch<MusicJobRow[]>(`${TABLE}?id=eq.${encodeURIComponent(jobId)}&owner_id=eq.${encodeURIComponent(userId)}&project_id=eq.${encodeURIComponent(projectId)}&job_type=eq.audio&select=id,owner_id,project_id,job_type,target_type,prompt,input_params,result_metadata&limit=1`);
  const job = rows?.[0];
  if (!job || (job.input_params?.kind !== "music" && job.target_type !== "song_version")) return null;
  return job;
}

function readCoverMetadata(value: Record<string, unknown> | null | undefined): CoverMetadata | null {
  const cover = value?.cover;
  if (!cover || typeof cover !== "object") return null;
  const candidate = cover as Partial<CoverMetadata>;
  return typeof candidate.storagePath === "string" && typeof candidate.provider === "string" && typeof candidate.model === "string" && typeof candidate.prompt === "string" && typeof candidate.generatedAt === "string"
    ? candidate as CoverMetadata
    : null;
}

function buildCoverPrompt(job: MusicJobRow) {
  const title = typeof job.input_params?.title === "string" ? job.input_params.title : "Untitled music track";
  const mode = job.input_params?.musicMode === "sfx" ? "sound effect" : job.input_params?.musicMode === "instrumental" ? "instrumental music" : "vocal song";
  const lyrics = typeof job.input_params?.lyrics === "string" ? job.input_params.lyrics.slice(0, 900) : "";
  return [
    "Square album cover artwork for an original KIIKIS music release.",
    `Title concept: ${title.slice(0, 160)}`,
    `Audio type: ${mode}`,
    `Style direction: ${job.prompt.slice(0, 900)}`,
    lyrics ? `Lyric atmosphere, not literal text: ${lyrics}` : "",
    "Cinematic, distinctive visual metaphor, strong focal composition, premium music-art direction.",
    "No readable words, no typography, no logos, no watermark, no UI, no border.",
  ].filter(Boolean).join("\n");
}

function getProjectId(request: Request) {
  return new URL(request.url).searchParams.get("projectId")?.trim() || "";
}

function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, "-").trim().slice(0, 80) || "kiikis-song-cover";
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "MISSING_BFL_API_KEY") return "Flux 图片服务尚未配置。";
  if (message.includes("429")) return "封面生成请求过于频繁，请稍后重试。";
  if (message.includes("STORAGE") || message.includes("ART_IMAGE_DOWNLOAD")) return "封面已生成，但保存失败，请重试。";
  return "歌曲封面生成失败，请稍后重试。";
}
