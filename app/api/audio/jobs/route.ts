import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { resolveAudioProvider } from "@/lib/audio/provider";
import { classifyAudioProviderError, computeAudioIdempotencyHash, sanitizeAudioMetadata } from "@/lib/audio/jobs";
import { AUDIO_BUCKET, persistAudioArtifact } from "@/lib/audio/storage";
import { recordAudioJobEvent } from "@/lib/audio/kk-events";
import { buildAudioUniverseBinding } from "@/lib/audio/universe-links";
import type { AudioKind, AudioProviderName } from "@/lib/audio/types";
import { getDefaultAtlasCloudMusicModel, isAtlasCloudMusicModel } from "@/lib/audio/music-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  owner_id: string;
  provider: AudioProviderName;
  model: string | null;
  provider_task_id: string | null;
  prompt: string;
  input_params: Record<string, unknown>;
  status: string;
  error: string | null;
  result_url: string | null;
  storage_path: string | null;
  result_metadata: Record<string, unknown>;
  target_type: string;
  target_id: string | null;
  created_at?: string;
};

const TABLE = "/rest/v1/storyflow_generation_jobs";

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  let user;
  try { user = await authenticateRequest(request); } catch { return response(401, { success: false, error: "请先登录。" }); }
  const serverClient = getSupabaseServerClient();
  if (!serverClient) return response(503, { success: false, error: "服务端音频存储未配置。", code: "MISSING_CONFIG" });

  const rows = await serviceFetch<JobRow[]>(
    `${TABLE}?owner_id=eq.${encodeURIComponent(user.id)}&job_type=eq.audio&select=id,owner_id,provider,model,input_params,status,error,storage_path,target_type,created_at&order=created_at.desc&limit=100`,
  );
  const musicJobs = (rows || []).filter((job) =>
    (job.input_params?.kind === "music" || job.target_type === "song_version")
    && ["queued", "reconciling", "generating", "result_ingesting", "completed", "failed", "provider_timeout"].includes(job.status),
  );
  const jobs = await Promise.all(musicJobs.map(async (job) => {
    let resultUrl: string | null = null;
    if (job.status === "completed" && job.storage_path) {
      const signed = await serverClient.storage.from(AUDIO_BUCKET).createSignedUrl(job.storage_path, 60 * 60);
      resultUrl = signed.data?.signedUrl || null;
    }
    return {
      id: job.id,
      label: job.input_params?.candidate === "B" ? "B" : "A",
      jobId: job.id,
      status: job.status,
      resultUrl,
      provider: job.provider,
      model: job.model,
      musicMode: job.input_params?.musicMode === "instrumental" || job.input_params?.musicMode === "sfx" ? job.input_params.musicMode : "vocal",
      title: typeof job.input_params?.title === "string" ? job.input_params.title : "",
      error: job.error,
      createdAt: job.input_params?.submittedAt ? new Date(Number(job.input_params.submittedAt)).toISOString() : job.created_at || new Date().toISOString(),
    };
  }));
  return response(200, { success: true, jobs });
}

export async function POST(request: NextRequest) {
  let user;
  try { user = await authenticateRequest(request); } catch { return response(401, { success: false, error: "请先登录。" }); }
  if (!hasServiceRoleConfig()) return response(503, { success: false, error: "服务端音频存储未配置。", code: "MISSING_CONFIG" });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return response(400, { success: false, error: "请求格式不正确。" });
  const kind = body.kind === "tts" || body.kind === "music" ? body.kind : null;
  const text = typeof body.text === "string" ? body.text : typeof body.prompt === "string" ? body.prompt : "";
  const targetId = typeof body.targetId === "string" ? body.targetId : "standalone";
  const requestKey = typeof body.requestKey === "string" ? body.requestKey.slice(0, 120) : "";
  const idempotencyTargetId = requestKey ? `${targetId}:${requestKey}` : targetId;
  const providerName = typeof body.provider === "string" ? body.provider as AudioProviderName : undefined;
  const targetType = typeof body.targetType === "string" ? body.targetType : kind === "tts" ? "voice_line" : "song_version";
  const requestedMusicMode = typeof body.musicMode === "string" ? body.musicMode : "vocal";
  if (kind === "music" && !["vocal", "instrumental", "sfx"].includes(requestedMusicMode)) {
    return response(422, { success: false, error: "音乐类型不受支持。", code: "INVALID_MUSIC_MODE" });
  }
  const musicMode = requestedMusicMode as "vocal" | "instrumental" | "sfx";
  const songWorkbenchMusic = kind === "music" && targetType === "song_version";
  const effectiveProviderName = songWorkbenchMusic ? "atlascloud" : providerName;
  const requestedModel = typeof body.model === "string" && body.model ? body.model : null;
  if (songWorkbenchMusic && effectiveProviderName !== "atlascloud") {
    return response(422, { success: false, error: "音乐工作台仅支持 Atlas Cloud 音乐模型。", code: "INVALID_MUSIC_PROVIDER" });
  }
  if (kind === "music" && effectiveProviderName === "atlascloud" && requestedModel && !isAtlasCloudMusicModel(requestedModel)) {
    return response(422, { success: false, error: "请选择 MiniMax Music 3.0 或 Suno V5。", code: "INVALID_MUSIC_MODEL" });
  }
  if (!kind || !text.trim()) return response(400, { success: false, error: "缺少 kind 和 text/prompt。" });

  const provider = await resolveAudioProvider(kind, effectiveProviderName);
  if (!provider.isAvailable(kind)) return response(422, { success: false, error: "当前音频 Provider 不可用。", code: "PROVIDER_UNAVAILABLE", provider: provider.name });
  const model = kind === "music" && provider.name === "atlascloud"
    ? requestedModel || getDefaultAtlasCloudMusicModel()
    : requestedModel || provider.capabilities().models[0] || "default";
  const idempotencyHash = computeAudioIdempotencyHash({ ownerId: user.id, kind, targetId: idempotencyTargetId, text, provider: provider.name, model, musicMode: kind === "music" ? musicMode : undefined });

  const existing = await serviceFetch<JobRow[]>(`${TABLE}?owner_id=eq.${encodeURIComponent(user.id)}&job_type=eq.audio&idempotency_hash=eq.${encodeURIComponent(idempotencyHash)}&status=not.in.(failed,provider_timeout)&limit=1`);
  if (existing?.[0]) return response(200, { success: true, created: false, job: existing[0] });

  const inputParams = body.inputParams && typeof body.inputParams === "object" ? body.inputParams as Record<string, unknown> : {};
  // 非人声模式永远不接收歌词，避免前端或重试请求意外把 vocal 内容送进纯音乐/音效任务。
  const lyrics = musicMode === "vocal" && typeof body.lyrics === "string" ? body.lyrics : "";
  const submittedAt = Date.now();
  const insertRows = await serviceFetch<JobRow[]>(TABLE, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      owner_id: user.id,
      job_type: "audio",
      provider: provider.name,
      model,
      provider_task_id: null,
      prompt: text,
      input_params: { ...inputParams, kind, targetId, requestKey, idempotencyHash, lyrics, musicMode: kind === "music" ? musicMode : undefined, submittedAt },
      idempotency_hash: idempotencyHash,
      status: "queued",
      error: null,
      result_url: null,
      storage_path: null,
      result_metadata: {},
      target_type: targetType,
      target_id: targetId,
      project_id: typeof body.projectId === "string" ? body.projectId : null,
    }),
  });
  const job = insertRows?.[0];
  if (!job) return response(500, { success: false, error: "音频任务创建失败。" });
  await recordAudioJobEvent({ fetcher: serviceFetch, userId: user.id, jobId: job.id, status: "queued", provider: provider.name, model, kind }).catch(() => undefined);

  try {
    const submitResult = kind === "music"
      ? await provider.submitMusic({ prompt: text, lyrics: lyrics || null, model, musicMode })
      : await provider.submitTTS({ text, voiceProviderVoiceId: typeof body.voiceProviderVoiceId === "string" ? body.voiceProviderVoiceId : null, language: typeof body.language === "string" ? body.language : "zh", speed: typeof body.speed === "number" ? body.speed : 1, pitch: typeof body.pitch === "number" ? body.pitch : 0, stability: typeof body.stability === "number" ? body.stability : 0.5, stylePrompt: typeof body.stylePrompt === "string" ? body.stylePrompt : "" });

    if (submitResult.kind === "async_submitted") {
      const updated = await serviceFetch<JobRow[]>(`${TABLE}?id=eq.${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ provider_task_id: submitResult.providerTaskId, status: "generating", error: null }),
      });
      await recordAudioJobEvent({ fetcher: serviceFetch, userId: user.id, jobId: job.id, status: "generating", provider: provider.name, model, kind }).catch(() => undefined);
      return response(202, { success: true, created: true, job: updated?.[0] || { ...job, provider_task_id: submitResult.providerTaskId, status: "generating" } });
    }

    const serverClient = getSupabaseServerClient();
    if (!serverClient) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
    const artifact = await persistAudioArtifact({ serverClient, ownerId: user.id, jobId: job.id, bytes: submitResult.audioBytes, contentType: submitResult.contentType });
    const assets = await serviceFetch<Array<{ id: string }>>("/rest/v1/storyflow_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: user.id, project_id: typeof body.projectId === "string" ? body.projectId : null, asset_type: "audio", storage_path: artifact.storagePath, public_url: null, metadata: { source: kind, provider: provider.name, ...submitResult.providerMetadata } }),
    });
    const assetId = assets?.[0]?.id || null;
    if (assetId) {
      await serviceFetch(`/rest/v1/storyflow_assets?id=eq.${encodeURIComponent(assetId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ metadata: { source: kind, provider: provider.name, ...submitResult.providerMetadata, ...buildAudioUniverseBinding({ assetId, universeEntityId: typeof inputParams.universeEntityId === "string" ? inputParams.universeEntityId : null, projectId: typeof body.projectId === "string" ? body.projectId : null, role: kind === "tts" ? "voice" : musicMode === "sfx" ? "sound_effect" : "song" }) } }),
      });
    }
    const completed = await serviceFetch<JobRow[]>(`${TABLE}?id=eq.${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "completed", result_url: artifact.signedUrl, storage_path: artifact.storagePath, completed_at: new Date().toISOString(), result_metadata: sanitizeAudioMetadata({ assetId, ...submitResult.providerMetadata }) }),
    });
    await recordAudioJobEvent({ fetcher: serviceFetch, userId: user.id, jobId: job.id, status: "completed", provider: provider.name, model, kind }).catch(() => undefined);
    return response(201, { success: true, created: true, job: completed?.[0] || job, assetId });
  } catch (error) {
    const providerFailure = classifyAudioProviderError(error);
    const updated = await serviceFetch<JobRow[]>(`${TABLE}?id=eq.${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: providerFailure.status, error: providerFailure.internalMessage }),
    }).catch(() => null);
    const persistedJob = updated?.[0] || { ...job, status: providerFailure.status, error: providerFailure.internalMessage };
    const publicJob = providerFailure.status === "reconciling" ? { ...persistedJob, error: null } : persistedJob;
    await recordAudioJobEvent({ fetcher: serviceFetch, userId: user.id, jobId: job.id, status: providerFailure.status, provider: provider.name, model, kind }).catch(() => undefined);
    return response(providerFailure.status === "reconciling" ? 202 : 502, { success: providerFailure.status === "reconciling", error: providerFailure.safeMessage, code: providerFailure.code, jobId: job.id, status: providerFailure.status, job: publicJob });
  }
}
