/**
 * Video Storage 转存。
 *
 * 任务卡：KIIKIS-P3-TRAE-003 §2 + PRD §9 TRAE-PW-P0-005（fail-closed 状态机）
 *
 * 视频完成后下载 provider 临时 URL → 校验 bytes + contentType → 上传到 Supabase
 * Storage `storyboard-videos` bucket → 保存 storage_path → 生成短期签名 URL。
 *
 * PRD §9.1 fail-closed：
 *   - 拆分为 uploadVideoArtifact（校验 + 上传，返回 storagePath）和
 *     signStoredVideo（根据 storagePath 重签）两个独立步骤
 *   - upload 失败 → caller 写 status=result_ingesting + storage_path=null
 *   - sign 失败（upload 已成功）→ caller 写 status=partial_failure + storage_path=已上传path
 *   - 两者都成功 → caller 写 status=completed + result_url=signedUrl + storage_path
 *   - providerTempUrl 永远不入库
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

/** PRD §9.1：受支持的 video Content-Type 白名单 */
export const SUPPORTED_VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

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
  if (contentType.includes("mov") || contentType.includes("quicktime")) return "mov";
  return "mp4";
}

/**
 * PRD §9.1：校验下载的 bytes 非空且 Content-Type 受支持。
 * 校验失败抛 VIDEO_VALIDATION_FAILED，caller 写 result_ingesting 而非 completed。
 */
export function validateVideoBytes(bytes: Uint8Array, contentType: string): void {
  if (!bytes || bytes.length === 0) {
    throw new Error("VIDEO_VALIDATION_FAILED:empty_bytes");
  }
  const lower = (contentType || "").toLowerCase().split(";")[0].trim();
  const supported = SUPPORTED_VIDEO_CONTENT_TYPES.some((type) => lower === type || lower.startsWith(type));
  if (!supported) {
    throw new Error(`VIDEO_VALIDATION_FAILED:unsupported_content_type:${lower}`);
  }
}

/**
 * 计算稳定的 storagePath（不实际写入）。供 caller 在 upload 前预知路径。
 */
export function buildVideoStoragePath(userId: string, jobId: string, shotId: string, contentType: string): string {
  const ext = getExtFromContentType(contentType);
  return `${sanitize(userId)}/${sanitize(jobId)}/${sanitize(shotId)}.${ext}`;
}

/**
 * PRD §9.1 step 1-3：校验 bytes → 上传到 Supabase Storage → 返回 storagePath。
 * sign 由 signStoredVideo 独立完成，upload 成功但 sign 失败时可单独重签。
 */
export async function uploadVideoArtifact(input: {
  userId: string;
  jobId: string;
  shotId: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<{ storagePath: string }> {
  // PRD §9.1：校验非空 bytes + 受支持 Content-Type
  validateVideoBytes(input.bytes, input.contentType);

  const storagePath = buildVideoStoragePath(input.userId, input.jobId, input.shotId, input.contentType);
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getSupabaseServiceRoleKey();
  if (!supabaseUrl || !serviceKey) {
    throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");
  }

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

  return { storagePath };
}

/**
 * PRD §9.1 step 4-5：根据 storagePath 生成短期签名 URL。
 * 对象已上传但 sign 失败时可单独重试，不重复上传。
 * PRD §9.2：GET job / 刷新恢复 / 导出访问时根据 storage_path 重签。
 */
export async function signStoredVideo(storagePath: string, expiresInSeconds?: number): Promise<{ signedUrl: string; expiresAt: string }> {
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getSupabaseServiceRoleKey();
  if (!supabaseUrl || !serviceKey) {
    throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");
  }
  const ttl = expiresInSeconds ?? DEFAULT_SIGNED_TTL_SECONDS;

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

  return { signedUrl, expiresAt };
}

/**
 * 下载 bytes + 上传到 Supabase Storage + 签名（convenience wrapper）。
 * 单次失败抛错，caller（jobs/[jobId] route）捕获后按 PRD §9.1 fail-closed 处理。
 *
 * 注意：如需区分 upload 失败 vs sign 失败（PRD §9.1），应分别调用
 * uploadVideoArtifact 和 signStoredVideo，本函数仅作为向后兼容保留。
 */
export async function persistVideoArtifact(input: {
  userId: string;
  jobId: string;
  shotId: string;
  bytes: Uint8Array;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<StorageResult> {
  const { storagePath } = await uploadVideoArtifact(input);
  const { signedUrl, expiresAt } = await signStoredVideo(storagePath, input.expiresInSeconds);
  return { storagePath, signedUrl, expiresAt };
}

export const VIDEO_STORAGE_BUCKET = VIDEO_BUCKET;
