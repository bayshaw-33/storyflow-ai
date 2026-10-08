import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { setMusicJobFavorite } from "@/lib/audio/favorites";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ jobId: string }> }) {
  let user;
  try { user = await authenticateRequest(request); } catch { return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 }); }
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
  const body = await request.json().catch(() => null);
  if (!projectId || typeof body?.favorite !== "boolean") return NextResponse.json({ success: false, error: "缺少项目 ID 或收藏状态。" }, { status: 400 });
  try {
    const result = await setMusicJobFavorite(serviceFetch, { jobId: (await context.params).jobId, ownerId: user.id, projectId, favorite: body.favorite });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const missing = error instanceof Error && error.message === "MUSIC_JOB_NOT_FOUND";
    return NextResponse.json({ success: false, error: missing ? "音乐记录不存在或不属于当前项目。" : "收藏保存失败，请重试。" }, { status: missing ? 404 : 502 });
  }
}
