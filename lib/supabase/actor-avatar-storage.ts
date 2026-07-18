const ART_BUCKET = "art-assets";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// KIIKIS-TR-ACTOR-P0-008: 服务端接受上限 2MB（客户端压缩目标 1.4MB + 余量）
// 仍在 Vercel 4.5MB App Router body size 限制内
const MAX_UPLOAD_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * 演员头像上传到私有 art-assets Storage。
 * 不再走 Base64 → public_url 路径；数据库只存 storage_path，不存 data:image/...。
 *
 * 路径规则：actor-avatars/{userId}/{timestamp}-{uuid}.jpg
 * 每次上传产生新路径，不覆盖历史文件（满足"更换头像产生新资产版本"）。
 */
export async function uploadActorAvatar(input: {
  userId: string;
  file: File;
}): Promise<{
  assetId: string;
  storagePath: string;
  previewUrl: string;
  contentType: string;
  size: number;
}> {
  const contentType = input.file.type;
  if (!ALLOWED_TYPES.includes(contentType)) throw new Error("AVATAR_TYPE_UNSUPPORTED");
  if (input.file.size > MAX_UPLOAD_SIZE) throw new Error("AVATAR_SIZE_EXCEEDS_LIMIT");

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");

  const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  const storagePath = `actor-avatars/${input.userId}/${timestamp}-${uuid}.${extension}`;

  // 上传到私有 art-assets bucket（service role key）
  const upload = await fetch(`${supabaseUrl}/storage/v1/object/${ART_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: await input.file.arrayBuffer(),
  });
  if (!upload.ok) {
    const text = await upload.text().catch(() => "");
    throw new Error(`AVATAR_UPLOAD_ERROR:${upload.status}:${text.slice(0, 120)}`);
  }

  // 生成 7 天签名 URL 供客户端预览
  const previewUrl = await signActorAssetUrl(storagePath, 60 * 60 * 24 * 7);

  // 创建 storyflow_assets 记录（asset_type 标记为 upload，actor_id 待 createActor 时回填）
  const assetId = crypto.randomUUID();
  const now = new Date().toISOString();
  const assetRow = {
    id: assetId,
    user_id: input.userId,
    team_id: null,
    project_id: null,
    asset_type: "actor_avatar_upload",
    public_url: null, // 不再存 Base64；改用 storage_path + 签名 URL
    storage_path: storagePath,
    metadata: {
      source: "user_upload",
      content_type: contentType,
      size: input.file.size,
      uploaded_at: now,
    },
    created_at: now,
  };

  const assetResp = await fetch(`${supabaseUrl}/rest/v1/storyflow_assets`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(assetRow),
  });
  if (!assetResp.ok) {
    const text = await assetResp.text().catch(() => "");
    throw new Error(`AVATAR_ASSET_INSERT_ERROR:${assetResp.status}:${text.slice(0, 120)}`);
  }

  return {
    assetId,
    storagePath,
    previewUrl,
    contentType,
    size: input.file.size,
  };
}

/**
 * 校验 avatar_asset_id 归属当前用户（防止伪造他人 asset）。
 */
export async function validateAvatarAssetBelongsToUser(userId: string, assetId: string): Promise<boolean> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/storyflow_assets?id=eq.${encodeURIComponent(assetId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,asset_type,storage_path&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  if (!resp.ok) return false;
  const rows = await resp.json() as Array<{ id: string; asset_type: string; storage_path: string }>;
  return rows.length > 0 && rows[0].asset_type.startsWith("actor_avatar");
}

/**
 * 将已上传的 avatar_upload asset 重新标记为 actor_avatar（绑定到具体 actor）。
 */
export async function attachAvatarAssetToActor(assetId: string, actorId: string): Promise<void> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/storyflow_assets?id=eq.${encodeURIComponent(assetId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        asset_type: "actor_avatar",
        metadata: { actor_id: actorId, attached_at: new Date().toISOString() },
      }),
    },
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`AVATAR_ASSET_ATTACH_ERROR:${resp.status}:${text.slice(0, 120)}`);
  }
}

// KIIKIS-TR-ACTOR-P0-009: 演员头像签名 URL 内存 LRU 缓存（同 art-storage）
const avatarSignedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const AVATAR_SIGNED_URL_CACHE_TTL_MS = 50 * 60 * 1000;
const AVATAR_SIGNED_URL_CACHE_MAX = 500;

/** Sign a private actor asset for an authenticated response. */
export async function signActorAssetUrl(storagePath: string, expiresIn = 60 * 60): Promise<string> {
  // 先查缓存
  const cached = avatarSignedUrlCache.get(storagePath);
  if (cached && Date.now() < cached.expiresAt) return cached.url;

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");

  const signed = await fetch(`${supabaseUrl}/storage/v1/object/sign/${ART_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!signed.ok) throw new Error(`AVATAR_SIGN_ERROR:${signed.status}`);
  const payload = await signed.json() as { signedURL?: string; signedUrl?: string };
  const signedPath = payload.signedURL || payload.signedUrl;
  if (!signedPath) throw new Error("AVATAR_SIGN_EMPTY");
  const url = signedPath.startsWith("http") ? signedPath : `${supabaseUrl}/storage/v1${signedPath}`;

  // 写入缓存
  if (avatarSignedUrlCache.size >= AVATAR_SIGNED_URL_CACHE_MAX) {
    const firstKey = avatarSignedUrlCache.keys().next().value;
    if (firstKey) avatarSignedUrlCache.delete(firstKey);
  }
  avatarSignedUrlCache.set(storagePath, { url, expiresAt: Date.now() + AVATAR_SIGNED_URL_CACHE_TTL_MS });
  return url;
}
