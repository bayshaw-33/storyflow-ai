import { NextResponse } from "next/server";
import { persistUploadedArtReference } from "@/lib/supabase/art-storage";
import { authenticateRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return failure("请选择图片文件。", 400);
    const stored = await persistUploadedArtReference({ userId: user.id, file });
    return NextResponse.json({ success: true, ...stored, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN") return failure("请先登录后再上传参考图。", 401);
    if (message === "ART_REFERENCE_TYPE_ERROR") return failure("仅支持 PNG、JPG 和 WebP 图片。", 400);
    if (message === "ART_REFERENCE_SIZE_ERROR") return failure("参考图不能超过 10MB。", 413);
    if (message === "MISSING_SUPABASE_STORAGE_CONFIG") return failure("存储服务未配置，请检查 SUPABASE_SERVICE_ROLE_KEY 环境变量。", 500);
    if (message.startsWith("ART_STORAGE_UPLOAD_ERROR")) return failure(`参考图上传失败（存储端 ${message.split(":")[1] || "未知"}），请稍后重试。`, 502);
    if (message.startsWith("ART_STORAGE_SIGN_ERROR")) return failure(`参考图签名失败（${message.split(":")[1] || "未知"}），请稍后重试。`, 502);
    if (message === "ART_STORAGE_SIGN_EMPTY") return failure("参考图签名返回为空，请稍后重试。", 502);
    return failure("参考图上传失败，请重试。", 502);
  }
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, previewUrl: "", storagePath: "", error }, { status });
}
