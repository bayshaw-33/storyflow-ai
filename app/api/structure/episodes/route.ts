import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { listEpisodes, upsertEpisode } from "@/lib/supabase/phase2";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    const episodes = await listEpisodes(user.id, projectId);
    return ok({ episodes });
  } catch (error) {
    return apiError(error, "读取分集失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const episodes = await upsertEpisode(user.id, body);
    return ok({ episodes });
  } catch (error) {
    return apiError(error, "保存分集失败。");
  }
}

export async function PATCH(request: NextRequest) {
  return POST(request);
}
