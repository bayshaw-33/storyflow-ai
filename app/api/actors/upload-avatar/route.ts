import { NextRequest, NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig } from "@/lib/supabase/server";
import { uploadActorAvatar } from "@/lib/supabase/actor-avatar-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/actors/upload-avatar
 * 接收客户端压缩后的头像 Blob（FormData: file=<Blob>），上传到私有 art-assets Storage。
 * 返回 { assetId, storagePath, previewUrl, contentType, size, requestId }。
 *
 * 客户端流程：选择图片 → createImageBitmap 自动旋转 → canvas 压缩到 ≤2048px/≤6MB
 * → POST 本端点 → 返回 assetId → POST /api/actors 时传 avatar_asset_id。
 *
 * 禁止：Base64 data URL、数据库存 data:image/...、20MB 以上原文件。
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("AVATAR_FILE_REQUIRED");

    const result = await uploadActorAvatar({ userId: user.id, file });

    return ok({ ...result, requestId });
  } catch (error) {
    const errRes = apiError(error, "头像上传失败。");
    const body = await errRes.json().catch(() => ({ success: false, error: "头像上传失败。" }));
    return NextResponse.json({ ...body, requestId }, { status: errRes.status });
  }
}
