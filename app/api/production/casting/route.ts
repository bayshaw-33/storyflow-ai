import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    if (!projectId) return apiError(new Error("MISSING_PROJECT_ID"), "缺少项目 ID。");

    // Fetch characters for this project
    const characters = await serviceFetch<Array<Record<string, unknown>>>(
      `/rest/v1/storyflow_characters?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&order=updated_at.desc`,
    );

    // Fetch actor profiles for this user
    const actors = await serviceFetch<Array<Record<string, unknown>>>(
      `/rest/v1/storyflow_actor_profiles?owner_id=eq.${encodeURIComponent(user.id)}&status=neq.archived&select=*&order=updated_at.desc`,
    );

    return ok({ characters, actors });
  } catch (error) {
    return apiError(error, "获取选角数据失败。");
  }
}
