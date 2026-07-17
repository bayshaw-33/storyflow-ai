/**
 * Video Storage 转存。
 *
 * 任务卡：KIIKIS-P3-TRAE-003 §2（CDN 临时 URL 转存）
 *
 * 视频完成后下载 provider 临时 URL → 上传到 Supabase Storage `storyboard-videos` bucket
 * → 返回签名 URL + storagePath。禁止直接绑定 provider 临时 URL。
 *
 * 参考 lib/supabase/art-storage.ts 模式。
 */

// 直接读 env，避免依赖 server.ts 未导出的 helper（与 lib/supabase/art-storage.ts 保持一致）
function getSupabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
}
function getSupabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

const VIDEO_BUCKET = "storyboard-videos";
const DEFAULT_SIGNED_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天

type StorageResult = {
  storagePath: string;
  signedUrl: string;
  expiresAt: string;
};

function sanitize(part: string): string {
  return part.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function getExtFromContentType(contentType: string): string {
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mov")) return "mov";
  return "mp4";
}

/**
 * 下载 bytes + 上传到 Supabase Storage + 签名。
 * 单次失败抛错，caller（jobs/[jobId] route）捕获后不覆盖已完成的 provider 状态。
 */
export async function persistVideoArtifact(input: {
  userId: string;
  jobId: string;
  shotId: string;
  bytes: Uint8Array;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<StorageResult> {
  const ext = getExtFromContentType(input.contentType);
  const storagePath = `${sanitize(input.userId)}/${sanitize(input.jobId)}/${sanitize(input.shotId)}.${ext}`;
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getSupabaseServiceRoleKey();
  if (!supabaseUrl || !serviceKey) {
    throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");
  }
  const ttl = input.expiresInSeconds ?? DEFAULT_SIGNED_TTL_SECONDS;

  // 1. upload (upsert)
  const uploadResp = await fetch(`${supabaseUrl}/storage/v1/object/${VIDEO_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": input.contentType,
      "x-upsert": "true",
    },
    body: input.bytes as BodyInit,
  });
  if (!uploadResp.ok) {
    const text = await uploadResp.text().catch(() => "");
    throw new Error(`VIDEO_STORAGE_UPLOAD_FAILED:${uploadResp.status}:${text.slice(0, 200)}`);
  }

  // 2. sign
  const signResp = await fetch(`${supabaseUrl}/storage/v1/object/sign/${VIDEO_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: ttl }),
  });
  if (!signResp.ok) {
    const text = await signResp.text().catch(() => "");
    throw new Error(`VIDEO_STORAGE_SIGN_FAILED:${signResp.status}:${text.slice(0, 200)}`);
  }
  const signText = await signResp.text();
  const signBody = JSON.parse(signText || "{}") as { signedURL?: string; signedUrl?: string };
  const relative = signBody.signedURL || signBody.signedUrl;
  if (!relative) {
    throw new Error("VIDEO_STORAGE_SIGN_NO_URL");
  }
  const signedUrl = relative.startsWith("http") ? relative : `${supabaseUrl}${relative}`;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  return { storagePath, signedUrl, expiresAt };
}

export const VIDEO_STORAGE_BUCKET = VIDEO_BUCKET;
