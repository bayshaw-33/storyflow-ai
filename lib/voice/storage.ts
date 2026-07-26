/**
 * Voice Line 音频转存（TRAE-V2-03）
 *
 * 参考 lib/ai/video/storage.ts 的 fail-closed 状态机模式。
 *
 * 安全约束：
 * - Provider 临时 URL 永不入库
 * - upload 失败 → caller 写 status=result_ingesting + storage_path=null
 * - sign 失败（upload 成功）→ caller 写 status=partial_failure + storage_path
 * - 全成功 → status=completed + signed_url + storage_path
 *
 * Storage bucket: voice-lines (private)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// 常量
// ============================================================

export const VOICE_LINE_BUCKET = "voice-lines";

export const SUPPORTED_AUDIO_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/aac",
  "audio/m4a",
  "audio/webm",
] as const;

export const DEFAULT_VOICE_SIGNED_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/m4a": "m4a",
  "audio/webm": "webm",
};

// ============================================================
// 校验
// ============================================================

export function validateAudioBytes(
  bytes: Uint8Array,
  contentType: string,
): void {
  if (!bytes || bytes.byteLength === 0) {
    throw new Error("VOICE_AUDIO_EMPTY");
  }
  const supported = (SUPPORTED_AUDIO_CONTENT_TYPES as readonly string[]).includes(
    contentType.toLowerCase(),
  );
  if (!supported) {
    throw new Error(`VOICE_AUDIO_UNSUPPORTED_CONTENT_TYPE:${contentType}`);
  }
}

// ============================================================
// storage path
// ============================================================

export function buildVoiceLineStoragePath(
  userId: string,
  voiceLineId: string,
  contentType: string,
): string {
  const ext = EXT_BY_CONTENT_TYPE[contentType.toLowerCase()] || "mp3";
  const safeUserId = sanitize(userId);
  const safeVoiceLineId = sanitize(voiceLineId);
  return `${safeUserId}/${safeVoiceLineId}.${ext}`;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

// ============================================================
// 上传 + 签名
// ============================================================

export async function uploadVoiceLineArtifact(input: {
  serverClient: SupabaseClient;
  userId: string;
  voiceLineId: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<{ storagePath: string }> {
  validateAudioBytes(input.bytes, input.contentType);
  const storagePath = buildVoiceLineStoragePath(
    input.userId,
    input.voiceLineId,
    input.contentType,
  );

  const { error } = await input.serverClient.storage
    .from(VOICE_LINE_BUCKET)
    .upload(storagePath, input.bytes, {
      contentType: input.contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`VOICE_UPLOAD_FAILED:${error.message}`);
  }

  return { storagePath };
}

export async function signStoredVoiceLine(input: {
  serverClient: SupabaseClient;
  storagePath: string;
  expiresInSeconds?: number;
}): Promise<{ signedUrl: string; expiresAt: string }> {
  const ttl = input.expiresInSeconds ?? DEFAULT_VOICE_SIGNED_TTL_SECONDS;
  const { data, error } = await input.serverClient.storage
    .from(VOICE_LINE_BUCKET)
    .createSignedUrl(input.storagePath, ttl);

  if (error) {
    throw new Error(`VOICE_SIGN_FAILED:${error.message}`);
  }
  if (!data?.signedUrl) {
    throw new Error("VOICE_SIGN_EMPTY");
  }

  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  return { signedUrl: data.signedUrl, expiresAt };
}

/**
 * 一体化转存：校验 → 上传 → 签名。
 * 失败时分别抛 UPLOAD_FAILED 或 SIGN_FAILED，caller 据此设置不同 status。
 */
export async function persistVoiceLineArtifact(input: {
  serverClient: SupabaseClient;
  userId: string;
  voiceLineId: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<{
  storagePath: string;
  signedUrl: string;
  expiresAt: string;
}> {
  const { storagePath } = await uploadVoiceLineArtifact(input);
  const { signedUrl, expiresAt } = await signStoredVoiceLine({
    serverClient: input.serverClient,
    storagePath,
  });
  return { storagePath, signedUrl, expiresAt };
}
