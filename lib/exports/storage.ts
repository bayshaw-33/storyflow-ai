/**
 * Export Storage 工具：在 Supabase Storage `exports` 桶中上传/签名导出产物。
 *
 * 范围（TRAE）：基础写入 + 短期签名 URL。
 * 不负责（Kimi KIIKIS-KM-G0-002C）：
 *   - immutable staging 对象
 *   - final object key + Promote 原子操作
 *   - storage object version
 *   - DB/storage 部分失败回滚
 *   - SHA-256 与 manifest 写入
 *
 * 当 Kimi 的 atomic release 链路落地后，本模块的 uploadExportArtifact
 * 会被替换为对 promoteStagingToFinal() 的调用。
 */

const EXPORTS_BUCKET = "exports";
const DEFAULT_DOWNLOAD_TTL_SECONDS = 60 * 60; // 1 小时

export interface UploadedArtifact {
  storagePath: string;
  signedUrl: string;
  expiresAt: string;
}

function getSupabaseConfig() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");
  return { supabaseUrl, serviceKey };
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || crypto.randomUUID();
}

function buildStoragePath(userId: string, exportId: string, extension: string): string {
  return `${sanitizeSegment(userId)}/${sanitizeSegment(exportId)}.${extension}`;
}

function computeExpiresAt(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

export async function uploadExportArtifact(params: {
  userId: string;
  exportId: string;
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  expiresInSeconds?: number;
}): Promise<UploadedArtifact> {
  const { supabaseUrl, serviceKey } = getSupabaseConfig();
  const storagePath = buildStoragePath(params.userId, params.exportId, params.extension);
  const ttl = params.expiresInSeconds ?? DEFAULT_DOWNLOAD_TTL_SECONDS;

  const upload = await fetch(`${supabaseUrl}/storage/v1/object/${EXPORTS_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": params.contentType,
      "x-upsert": "true",
    },
    body: new Uint8Array(params.bytes).buffer,
  });
  if (!upload.ok) {
    const text = await upload.text().catch(() => "");
    throw new Error(`EXPORT_STORAGE_UPLOAD_ERROR:${upload.status}:${text.slice(0, 200)}`);
  }

  const signedUrl = await signExportArtifact({ storagePath, expiresInSeconds: ttl });
  return { storagePath, signedUrl: signedUrl.signedUrl, expiresAt: signedUrl.expiresAt };
}

export async function signExportArtifact(params: {
  storagePath: string;
  expiresInSeconds?: number;
}): Promise<{ signedUrl: string; expiresAt: string }> {
  const { supabaseUrl, serviceKey } = getSupabaseConfig();
  const ttl = params.expiresInSeconds ?? DEFAULT_DOWNLOAD_TTL_SECONDS;

  const signed = await fetch(`${supabaseUrl}/storage/v1/object/sign/${EXPORTS_BUCKET}/${params.storagePath}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: ttl }),
  });
  if (!signed.ok) {
    const text = await signed.text().catch(() => "");
    throw new Error(`EXPORT_STORAGE_SIGN_ERROR:${signed.status}:${text.slice(0, 200)}`);
  }
  const payload = (await signed.json()) as { signedURL?: string; signedUrl?: string };
  const rawPath = payload.signedURL || payload.signedUrl;
  if (!rawPath) throw new Error("EXPORT_STORAGE_SIGN_EMPTY");
  const fullUrl = rawPath.startsWith("http") ? rawPath : `${supabaseUrl}/storage/v1${rawPath}`;
  return { signedUrl: fullUrl, expiresAt: computeExpiresAt(ttl) };
}

export async function deleteExportArtifact(storagePath: string): Promise<void> {
  const { supabaseUrl, serviceKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${EXPORTS_BUCKET}/${storagePath}`, {
    method: "DELETE",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => "");
    throw new Error(`EXPORT_STORAGE_DELETE_ERROR:${response.status}:${text.slice(0, 200)}`);
  }
}
