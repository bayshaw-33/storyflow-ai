import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { failure, getServiceSupabase, sanitizeStorageName, VIRAL_BUCKET, type ViralProjectRow } from "../_utils";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

export async function POST(request: Request) {
  let user;

  try {
    user = await authenticateRequest(request);
  } catch {
    return failure("请先登录后再上传视频。", 401);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return failure("上传格式不正确。", 400);
  }

  const file = formData.get("video");
  if (!(file instanceof File)) return failure("请上传视频文件。", 400);
  if (!file.type.startsWith("video/")) return failure("仅支持视频文件。", 400);
  if (file.size > MAX_VIDEO_SIZE) return failure("视频不能超过 100MB。", 400);

  try {
    const supabase = getServiceSupabase();
    const timestamp = Date.now();
    const safeName = sanitizeStorageName(file.name);
    const videoPath = `${user.id}/${timestamp}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from(VIRAL_BUCKET).upload(videoPath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (uploadError) {
      throw new Error(`VIRAL_STORAGE_UPLOAD_ERROR:${uploadError.message}`);
    }

    const rows = await serviceFetch<ViralProjectRow[]>("/rest/v1/storyflow_viral_projects", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: user.id,
        title: file.name.replace(/\.[^.]+$/, "") || "爆款创作",
        source_video_path: videoPath,
        source_video_name: file.name,
        source_video_mime: file.type,
        source_video_size: file.size,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });

    const project = rows[0];
    if (!project?.id) throw new Error("VIRAL_PROJECT_CREATE_FAILED");

    return NextResponse.json({
      success: true,
      projectId: project.id,
      videoPath,
    });
  } catch (error) {
    return failure(toFriendlyError(error), 500);
  }
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "MISSING_SUPABASE_SERVICE_ROLE_KEY") {
    return "Supabase 服务端配置缺失，请检查 SUPABASE_SERVICE_ROLE_KEY。";
  }

  if (message.includes("VIRAL_STORAGE_UPLOAD_ERROR")) {
    return "视频上传失败，请检查 viral-assets bucket 配置。";
  }

  if (message.includes("SUPABASE_SERVICE_ERROR")) {
    return "创建爆款项目失败，请检查 storyflow_viral_projects 表结构。";
  }

  return "视频上传失败，请稍后重试。";
}
