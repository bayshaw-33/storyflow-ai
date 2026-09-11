import { NextResponse } from "next/server";
import { AUDIO_BUCKET } from "@/lib/audio/storage";
import { authenticateRequest, getSupabaseServerClient, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DownloadableAudioJob = {
  id: string;
  storage_path: string | null;
  input_params: Record<string, unknown> | null;
};

function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, "-").trim().slice(0, 80) || "kiikis-music";
}

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  let user;
  try {
    user = await authenticateRequest(request);
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  const { jobId } = await context.params;
  const rows = await serviceFetch<DownloadableAudioJob[]>(
    `/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}&owner_id=eq.${encodeURIComponent(user.id)}&job_type=eq.audio&select=id,storage_path,input_params&limit=1`,
  );
  const job = rows?.[0];
  if (!job?.storage_path) {
    return NextResponse.json({ success: false, error: "音乐文件尚未就绪或不存在。" }, { status: 404 });
  }

  const serverClient = getSupabaseServerClient();
  if (!serverClient) {
    return NextResponse.json({ success: false, error: "音乐存储服务未配置。" }, { status: 503 });
  }
  const extension = job.storage_path.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "mp3";
  const title = typeof job.input_params?.title === "string" ? job.input_params.title : "kiikis-music";
  const filename = `${safeFilePart(title)}.${extension}`;
  const { data, error } = await serverClient.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(job.storage_path, 60, { download: filename });
  if (error || !data?.signedUrl) {
    return NextResponse.json({ success: false, error: "音乐下载链接生成失败，请重试。" }, { status: 502 });
  }
  return NextResponse.json(
    { success: true, downloadUrl: data.signedUrl, filename },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
