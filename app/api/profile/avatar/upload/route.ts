import { NextResponse } from "next/server";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getAvatarUrl } from "@/lib/profile/avatar-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AVATARS_BUCKET = "avatars";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/profile/avatar/upload (multipart/form-data: file=<Blob>)
 * 上传图片 → 写入 avatars 公开 bucket（路径 {userId}/{timestamp}.{ext}）
 * → 创建 storyflow_assets 记录 → 更新 profiles.avatar_asset_id
 * 返回 { avatar_url, asset_id }
 */
export async function POST(request: Request) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY 配置。" },
        { status: 503 },
      );
    }
    const client = getSupabaseServerClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: "服务端 Supabase client 不可用。" },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "缺少 file 字段。" },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "仅支持 JPEG / PNG / WebP / GIF 格式。" },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { success: false, error: "图片大小不能超过 5MB。" },
        { status: 400 },
      );
    }

    const extension = file.type.includes("jpeg")
      ? "jpg"
      : file.type.includes("webp")
        ? "webp"
        : file.type.includes("gif")
          ? "gif"
          : "png";
    const timestamp = Date.now();
    const storagePath = `${user.id}/${timestamp}.${extension}`;

    // 1. 上传到公开 avatars bucket
    const arrayBuf = await file.arrayBuffer();
    const { error: uploadErr } = await client
      .storage
      .from(AVATARS_BUCKET)
      .upload(storagePath, arrayBuf, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json(
        { success: false, error: `头像上传失败：${uploadErr.message}` },
        { status: 500 },
      );
    }

    // 2. 创建 storyflow_assets 记录
    const assetId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: assetErr } = await client.from("storyflow_assets").insert({
      id: assetId,
      user_id: user.id,
      team_id: null,
      project_id: null,
      asset_type: "user_avatar_upload",
      public_url: null,
      storage_path: storagePath,
      metadata: {
        source: "user_upload",
        content_type: file.type,
        size: file.size,
        uploaded_at: now,
        bucket: AVATARS_BUCKET,
      },
      created_at: now,
    });

    if (assetErr) {
      // 即便 asset 记录失败，storage 文件已上传；此处直接返回错误让前端重试
      return NextResponse.json(
        { success: false, error: `asset 记录创建失败：${assetErr.message}` },
        { status: 500 },
      );
    }

    // 3. 更新 profiles.avatar_asset_id
    const { error: profileErr } = await client
      .from("storyflow_profiles")
      .update({
        avatar_asset_id: assetId,
        updated_at: now,
      })
      .eq("user_id", user.id);

    if (profileErr) {
      return NextResponse.json(
        { success: false, error: `profile 更新失败：${profileErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      asset_id: assetId,
      storage_path: storagePath,
      avatar_url: getAvatarUrl({ avatar_storage_path: storagePath }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const authError = message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN";
    return NextResponse.json(
      {
        success: false,
        error: authError ? "请先登录。" : "头像上传失败，请稍后重试。",
      },
      { status: authError ? 401 : 500 },
    );
  }
}
