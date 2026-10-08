import { NextResponse } from "next/server";
import { artCloudErrorStatus, artCloudScopeFromQuery, readArtCloudJob, refreshArtCloudJobImages } from "@/lib/art/cloud-store";
import { authenticateRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    const { jobId } = await context.params;
    const stored = await readArtCloudJob(user.id, artCloudScopeFromQuery(request), jobId);
    const job = stored ? await refreshArtCloudJobImages(user.id, stored) : null;
    return NextResponse.json({ success: true, job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: "生成任务读取失败。" }, { status: artCloudErrorStatus(error) });
  }
}
