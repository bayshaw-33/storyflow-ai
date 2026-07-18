const ART_BUCKET = "art-assets";

export async function persistUploadedArtReference(input: {
  userId: string;
  file: File;
}) {
  const contentType = input.file.type;
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) throw new Error("ART_REFERENCE_TYPE_ERROR");
  if (input.file.size > 10 * 1024 * 1024) throw new Error("ART_REFERENCE_SIZE_ERROR");

  const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  const path = `${input.userId}/references/${crypto.randomUUID()}.${extension}`;
  return uploadAndSign(path, contentType, await input.file.arrayBuffer());
}

/**
 * 上传演员图组图片到 Storage（用户手动上传，替代生成）。
 * KIIKIS-TR-ACTOR-P0-007: 用户可上传 PNG/JPG/WebP 替代 Atlas 生成。
 */
export async function persistUploadedActorView(input: {
  userId: string;
  projectId: string;
  assetId: string;
  file: File;
}) {
  const contentType = input.file.type;
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
    throw new Error("ACTOR_VIEW_UPLOAD_TYPE_ERROR");
  }
  if (input.file.size > 10 * 1024 * 1024) throw new Error("ACTOR_VIEW_UPLOAD_SIZE_ERROR");
  const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  const path = `${input.userId}/${input.projectId}/uploaded/${input.assetId}/${crypto.randomUUID()}.${extension}`;
  return uploadAndSign(path, contentType, await input.file.arrayBuffer());
}

export async function persistRemoteArtImage(input: {
  userId: string;
  projectId: string;
  assetId: string;
  remoteUrl: string;
  providerTaskId: string;
  index: number;
}) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");

  const source = await fetch(input.remoteUrl);
  if (!source.ok) throw new Error(`ART_IMAGE_DOWNLOAD_ERROR:${source.status}`);
  const contentType = source.headers.get("content-type") || "image/png";
  const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  const path = `${input.userId}/${input.projectId}/generated/${input.assetId}/${sanitize(input.providerTaskId)}-${input.index}.${extension}`;
  return uploadAndSign(path, contentType, await source.arrayBuffer());
}

// KIIKIS-TR-ACTOR-P0-009: 签名 URL 内存 LRU 缓存
// 默认 1 小时有效期，缓存 TTL 50 分钟（留 10 分钟 buffer 避免边界过期）
// Next.js prod nodejs runtime 进程内有效；dev HMR 会清缓存（可接受）
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_CACHE_TTL_MS = 50 * 60 * 1000; // 50 分钟
const SIGNED_URL_CACHE_MAX = 500; // 最多缓存 500 条签名 URL

function getCachedSignedUrl(storagePath: string): string | null {
  const cached = signedUrlCache.get(storagePath);
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt) {
    signedUrlCache.delete(storagePath);
    return null;
  }
  return cached.url;
}

function setCachedSignedUrl(storagePath: string, url: string): void {
  // 简单 LRU：超过上限时删除最早一条
  if (signedUrlCache.size >= SIGNED_URL_CACHE_MAX) {
    const firstKey = signedUrlCache.keys().next().value;
    if (firstKey) signedUrlCache.delete(firstKey);
  }
  signedUrlCache.set(storagePath, { url, expiresAt: Date.now() + SIGNED_URL_CACHE_TTL_MS });
}

export async function signStoredArtImage(storagePath: string, expiresIn = 60 * 60) {
  // 先查缓存
  const cached = getCachedSignedUrl(storagePath);
  if (cached) return cached;

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");

  const signed = await fetch(`${supabaseUrl}/storage/v1/object/sign/${ART_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!signed.ok) throw new Error(`ART_STORAGE_SIGN_ERROR:${signed.status}`);
  const payload = await signed.json() as { signedURL?: string; signedUrl?: string };
  const signedPath = payload.signedURL || payload.signedUrl;
  if (!signedPath) throw new Error("ART_STORAGE_SIGN_EMPTY");
  const url = signedPath.startsWith("http") ? signedPath : `${supabaseUrl}/storage/v1${signedPath}`;
  setCachedSignedUrl(storagePath, url);
  return url;
}

async function uploadAndSign(path: string, contentType: string, body: ArrayBuffer) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");

  const upload = await fetch(`${supabaseUrl}/storage/v1/object/${ART_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body,
  });
  if (!upload.ok) throw new Error(`ART_STORAGE_UPLOAD_ERROR:${upload.status}`);

  return { storagePath: path, previewUrl: await signStoredArtImage(path, 60 * 60 * 24 * 7) };
}

function sanitize(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || crypto.randomUUID();
}
