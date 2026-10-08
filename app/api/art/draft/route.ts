import { NextResponse } from "next/server";
import { artCloudErrorStatus, artCloudScopeFromQuery, readArtCloudDraft, writeArtCloudDraft, type ArtCloudScope } from "@/lib/art/cloud-store";
import { authenticateRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const draft = await readArtCloudDraft(user.id, artCloudScopeFromQuery(request));
    return NextResponse.json({ success: true, draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json() as ArtCloudScope & { draft: unknown };
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("ART_DRAFT_INVALID");
    const draft = await writeArtCloudDraft(user.id, body, body.draft);
    return NextResponse.json({ success: true, draft });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  const status = artCloudErrorStatus(error);
  return NextResponse.json({ success: false, error: status === 502 ? "美术草稿存取失败。" : status === 401 ? "请先登录。" : status === 413 ? "草稿超出长度限制。" : "草稿或作用域格式不正确。" }, { status });
}
