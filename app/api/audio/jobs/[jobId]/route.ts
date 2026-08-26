import { NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, serviceFetch } from "@/lib/supabase/server";
import { resolveAudioProvider } from "@/lib/audio/provider";
import { mapAudioPollToJobStatus, sanitizeAudioMetadata } from "@/lib/audio/jobs";
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

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  let user;
  try { user = await authenticateRequest(request); } catch { return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 }); }
  const { jobId } = await context.params;
  const rows = await serviceFetch<JobRow[]>(`${TABLE}?id=eq.${encodeURIComponent(jobId)}&owner_id=eq.${encodeURIComponent(user.id)}&job_type=eq.audio&limit=1`);
  let job = rows?.[0];
  if (!job) return NextResponse.json({ success: false, error: "音频任务不存在。" }, { status: 404 });
  if (!job.provider_task_id || !["queued", "generating", "result_ingesting"].includes(job.status)) return NextResponse.json({ success: true, job });

  const kind = job.input_params?.kind === "tts" ? "tts" : "music" as AudioKind;
  try {
    const provider = await resolveAudioProvider(kind, job.provider);
    const poll = await provider.poll(job.provider_task_id, kind);
    const mapped = mapAudioPollToJobStatus(poll);
    if (poll.status === "queued" || poll.status === "running") {
      const updated = await serviceFetch<JobRow[]>(`${TABLE}?id=eq.${encodeURIComponent(job.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: mapped }) });
      await recordAudioJobEvent({ fetcher: serviceFetch, userId: user.id, jobId: job.id, status: mapped, provider: job.provider, model: job.model, kind }).catch(() => undefined);
      return NextResponse.json({ success: true, job: updated?.[0] || { ...job, status: mapped } });
    }
    if (poll.status === "error") {
      const updated = await serviceFetch<JobRow[]>(`${TABLE}?id=eq.${encodeURIComponent(job.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: mapped, error: poll.error || "AUDIO_PROVIDER_FAILED" }) });
      await recordAudioJobEvent({ fetcher: serviceFetch, userId: user.id, jobId: job.id, status: mapped, provider: job.provider, model: job.model, kind }).catch(() => undefined);
      return NextResponse.json({ success: true, job: updated?.[0] || { ...job, status: mapped, error: poll.error } });
    }

    const serverClient = getSupabaseServerClient();
    if (!serverClient) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
    const downloaded = poll.audioBytes ? { bytes: poll.audioBytes, contentType: poll.contentType || "audio/mpeg" } : poll.audioUrl ? await provider.download(poll.audioUrl) : null;
    if (!downloaded) throw new Error("AUDIO_RESULT_MISSING");
    const ingesting = await serviceFetch<JobRow[]>(`${TABLE}?id=eq.${encodeURIComponent(job.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "result_ingesting", result_url: null, result_metadata: sanitizeAudioMetadata(poll.providerMetadata || {}) }) });
    job = ingesting?.[0] || { ...job, status: "result_ingesting" };
    const artifact = await persistAudioArtifact({ serverClient, ownerId: user.id, jobId: job.id, bytes: downloaded.bytes, contentType: downloaded.contentType });
    const assets = await serviceFetch<Array<{ id: string }>>("/rest/v1/storyflow_assets", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: user.id, project_id: typeof job.input_params.projectId === "string" ? job.input_params.projectId : null, asset_type: "audio", storage_path: artifact.storagePath, public_url: null, metadata: sanitizeAudioMetadata({ source: kind, provider: job.provider, ...poll.providerMetadata }) }) });
    const assetId = assets?.[0]?.id || null;
    if (assetId) {
      await serviceFetch(`/rest/v1/storyflow_assets?id=eq.${encodeURIComponent(assetId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ metadata: sanitizeAudioMetadata({ source: kind, provider: job.provider, ...poll.providerMetadata, ...buildAudioUniverseBinding({ assetId, universeEntityId: typeof job.input_params.universeEntityId === "string" ? job.input_params.universeEntityId : null, projectId: typeof job.input_params.projectId === "string" ? job.input_params.projectId : null, role: kind === "tts" ? "voice" : "song" }) }) }),
      });
    }
    if (job.input_params.voiceLineId || job.target_type === "voice_line") {
      const voiceLineId = typeof job.input_params.voiceLineId === "string" ? job.input_params.voiceLineId : job.target_id;
      if (voiceLineId) {
        await serviceFetch(`/rest/v1/storyflow_voice_lines?id=eq.${encodeURIComponent(voiceLineId)}&owner_id=eq.${encodeURIComponent(user.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "generated", asset_id: assetId, storage_path: artifact.storagePath, signed_url: artifact.signedUrl, signed_url_expires_at: artifact.expiresAt, error: null, completed_at: new Date().toISOString() }),
        });
      }
    }
    const updated = await serviceFetch<JobRow[]>(`${TABLE}?id=eq.${encodeURIComponent(job.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "completed", result_url: artifact.signedUrl, storage_path: artifact.storagePath, completed_at: new Date().toISOString(), result_metadata: sanitizeAudioMetadata({ assetId, ...poll.providerMetadata }) }) });
    await recordAudioJobEvent({ fetcher: serviceFetch, userId: user.id, jobId: job.id, status: "completed", provider: job.provider, model: job.model, kind }).catch(() => undefined);
    return NextResponse.json({ success: true, job: updated?.[0] || { ...job, status: "completed", result_url: artifact.signedUrl, storage_path: artifact.storagePath } });
  } catch (error) {
    return NextResponse.json({ success: true, job, warning: error instanceof Error ? error.message.slice(0, 240) : "AUDIO_POLL_FAILED" });
  }
}
