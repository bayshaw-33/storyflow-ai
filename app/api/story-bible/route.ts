import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { getStoryBible, updateStoryBible } from "@/lib/supabase/phase2";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    if (!projectId) return apiError(new Error("PROJECT_NOT_FOUND"), "缺少 projectId。");
    const storyBible = await getStoryBible(user.id, projectId);
    return ok({ storyBible });
  } catch (error) {
    return apiError(error, "读取 Story Bible 失败。");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    if (!projectId) return apiError(new Error("PROJECT_NOT_FOUND"), "缺少 projectId。");
    const storyBible = await updateStoryBible(user.id, projectId, body.storyBible || {}, body.changedEntity || "story_bible");
    return ok({ storyBible });
  } catch (error) {
    return apiError(error, "保存 Story Bible 失败。");
  }
}
