import { NextResponse } from "next/server";
import { AUDIO_BUCKET } from "@/lib/audio/storage";
import { authenticateRequest, getSupabaseServerClient, serviceFetch } from "@/lib/supabase/server";
import { encodeMp3ForDownload, readMp3Encoding } from "@/lib/audio/mp3-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type DownloadableAudioJob = {
  id: string;
  storage_path: string | null;
  input_params: Record<string, unknown> | null;
};

function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, "-").trim().slice(0, 80) || "kiikis-music";
}

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const requestedFormat = new URL(request.url).searchParams.get("format");
  let format = requestedFormat || "mp3-320";
  if (format !== "mp3-320" && format !== "original") return NextResponse.json({ success: false, error: "不支持的音频下载格式。" }, { status: 422 });
  let user;
  try {
    user = await authenticateRequest(request);
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  const { jobId } = await context.params;
  let rows: DownloadableAudioJob[];
  try { rows = await serviceFetch<DownloadableAudioJob[]>(
    `/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}&owner_id=eq.${encodeURIComponent(user.id)}&job_type=eq.audio&select=id,storage_path,input_params&limit=1`,
  ); } catch {
    return NextResponse.json({ success: false, error: "音乐下载服务暂时不可用，请重试。" }, { status: 503 });
  }
  const job = rows?.[0];
  if (!job?.storage_path) {
    return NextResponse.json({ success: false, error: "音乐文件尚未就绪或不存在。" }, { status: 404 });
  }
  if (!requestedFormat && job.input_params?.kind === "tts") format = "original";

  const serverClient = getSupabaseServerClient();
  if (!serverClient) {
    return NextResponse.json({ success: false, error: "音乐存储服务未配置。" }, { status: 503 });
  }
  let downloadPath = job.storage_path;
  if (format === "mp3-320") {
    try {
      const storage = serverClient.storage.from(AUDIO_BUCKET);
      const exportPath = `${job.storage_path}.320k-v1.mp3`;
      const cached = await storage.download(exportPath);
      const cachedEncoding = cached.data ? readMp3Encoding(new Uint8Array(await cached.data.arrayBuffer())) : null;
      if (cachedEncoding?.bitrate !== 320000 || cachedEncoding.sampleRate !== 44100 || cachedEncoding.channels !== 2) {
        const source = await storage.download(job.storage_path);
        if (source.error || !source.data) throw new Error("SOURCE_UNAVAILABLE");
        const bytes = await encodeMp3ForDownload(new Uint8Array(await source.data.arrayBuffer()));
        const uploaded = await storage.upload(exportPath, bytes, { contentType: "audio/mpeg", upsert: true });
        if (uploaded.error) throw new Error("EXPORT_UPLOAD_FAILED");
      }
      downloadPath = exportPath;
    } catch {
      return NextResponse.json({ success: false, error: "320 kbps 音频导出失败，请重试或选择下载原文件。" }, { status: 502 });
    }
  }
  const extension = format === "mp3-320" ? "mp3" : job.storage_path.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "mp3";
  const title = typeof job.input_params?.title === "string" ? job.input_params.title : "kiikis-music";
  const filename = `${safeFilePart(title)}${format === "mp3-320" ? "-320kbps" : ""}.${extension}`;
  const { data, error } = await serverClient.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(downloadPath, 60, { download: filename });
  if (error || !data?.signedUrl) {
    return NextResponse.json({ success: false, error: "音乐下载链接生成失败，请重试。" }, { status: 502 });
  }
  return NextResponse.json(
    { success: true, downloadUrl: data.signedUrl, filename, format,
      ...(format === "mp3-320" ? { bitrate: 320000, sampleRate: 44100, channels: 2, reencoded: true } : {}),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
