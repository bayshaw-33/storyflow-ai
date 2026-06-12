import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { listScenes, upsertScene } from "@/lib/supabase/phase2";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    const episodeId = request.nextUrl.searchParams.get("episodeId") || "";
    const scenes = await listScenes(user.id, projectId, episodeId);
    return ok({ scenes });
  } catch (error) {
    return apiError(error, "读取场景失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const scenes = await upsertScene(user.id, body);
    return ok({ scenes });
  } catch (error) {
    return apiError(error, "保存场景失败。");
  }
}

export async function PATCH(request: NextRequest) {
  return POST(request);
}
