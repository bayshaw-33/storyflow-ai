import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { resolveAudioProvider } from "@/lib/audio/provider";
import { classifyAudioProviderError, computeAudioIdempotencyHash, sanitizeAudioMetadata } from "@/lib/audio/jobs";
import { persistAudioArtifact } from "@/lib/audio/storage";
import { recordAudioJobEvent } from "@/lib/audio/kk-events";
import { buildAudioUniverseBinding } from "@/lib/audio/universe-links";
import type { AudioKind, AudioProviderName } from "@/lib/audio/types";

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
};

const TABLE = "/rest/v1/storyflow_generation_jobs";

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
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
  const model = typeof body.model === "string" && body.model ? body.model : null;
  if (!kind || !text.trim()) return response(400, { success: false, error: "缺少 kind 和 text/prompt。" });

  const provider = await resolveAudioProvider(kind, providerName);
  if (!provider.isAvailable(kind)) return response(422, { success: false, error: "当前音频 Provider 不可用。", code: "PROVIDER_UNAVAILABLE", provider: provider.name });
  const idempotencyHash = computeAudioIdempotencyHash({ ownerId: user.id, kind, targetId: idempotencyTargetId, text, provider: provider.name, model: model || provider.capabilities().models[0] || "default" });

  const existing = await serviceFetch<JobRow[]>(`${TABLE}?owner_id=eq.${encodeURIComponent(user.id)}&job_type=eq.audio&idempotency_hash=eq.${encodeURIComponent(idempotencyHash)}&status=not.in.(failed,provider_timeout)&limit=1`);
  if (existing?.[0]) return response(200, { success: true, created: false, job: existing[0] });

  const inputParams = body.inputParams && typeof body.inputParams === "object" ? body.inputParams as Record<string, unknown> : {};
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
      input_params: { ...inputParams, kind, targetId, requestKey, idempotencyHash },
      idempotency_hash: idempotencyHash,
      status: "queued",
      error: null,
      result_url: null,
      storage_path: null,
      result_metadata: {},
      target_type: typeof body.targetType === "string" ? body.targetType : kind === "tts" ? "voice_line" : "song_version",
      target_id: targetId,
      project_id: typeof body.projectId === "string" ? body.projectId : null,
    }),
  });
  const job = insertRows?.[0];
  if (!job) return response(500, { success: false, error: "音频任务创建失败。" });
  await recordAudioJobEvent({ fetcher: serviceFetch, userId: user.id, jobId: job.id, status: "queued", provider: provider.name, model, kind }).catch(() => undefined);

  try {
    const submitResult = kind === "music"
      ? await provider.submitMusic({ prompt: text, lyrics: typeof body.lyrics === "string" ? body.lyrics : null, model })
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
        body: JSON.stringify({ metadata: { source: kind, provider: provider.name, ...submitResult.providerMetadata, ...buildAudioUniverseBinding({ assetId, universeEntityId: typeof inputParams.universeEntityId === "string" ? inputParams.universeEntityId : null, projectId: typeof body.projectId === "string" ? body.projectId : null, role: kind === "tts" ? "voice" : "song" }) } }),
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
    await serviceFetch(`${TABLE}?id=eq.${encodeURIComponent(job.id)}`, { method: "PATCH", body: JSON.stringify({ status: providerFailure.status, error: providerFailure.internalMessage }) }).catch(() => undefined);
    await recordAudioJobEvent({ fetcher: serviceFetch, userId: user.id, jobId: job.id, status: providerFailure.status, provider: provider.name, model, kind }).catch(() => undefined);
    return response(502, { success: false, error: providerFailure.safeMessage, code: providerFailure.code, jobId: job.id });
  }
}
