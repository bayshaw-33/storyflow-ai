import type { SupabaseClient } from "@supabase/supabase-js";

export const AUDIO_BUCKET = "audio-assets";

const EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/m4a": "m4a",
  "audio/webm": "webm",
};

export function validateAudioArtifact(bytes: Uint8Array, contentType: string) {
  if (!bytes?.byteLength) throw new Error("AUDIO_EMPTY");
  if (!EXTENSIONS[contentType.toLowerCase()]) throw new Error(`AUDIO_UNSUPPORTED_CONTENT_TYPE:${contentType}`);
}

export function buildAudioStoragePath(ownerId: string, jobId: string, contentType: string) {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  return `${safe(ownerId)}/${safe(jobId)}.${EXTENSIONS[contentType.toLowerCase()] || "mp3"}`;
}

export async function persistAudioArtifact(input: {
  serverClient: SupabaseClient;
  ownerId: string;
  jobId: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<{ storagePath: string; signedUrl: string; expiresAt: string }> {
  validateAudioArtifact(input.bytes, input.contentType);
  const storagePath = buildAudioStoragePath(input.ownerId, input.jobId, input.contentType);
  const { error: uploadError } = await input.serverClient.storage.from(AUDIO_BUCKET).upload(storagePath, input.bytes, {
    contentType: input.contentType,
    upsert: true,
  });
  if (uploadError) throw new Error(`AUDIO_UPLOAD_FAILED:${uploadError.message}`);

  const expiresIn = 7 * 24 * 60 * 60;
  const { data, error: signError } = await input.serverClient.storage.from(AUDIO_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (signError || !data?.signedUrl) throw new Error(`AUDIO_SIGN_FAILED:${signError?.message || "empty signed URL"}`);
  return {
    storagePath,
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}
