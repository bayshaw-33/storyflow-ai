/**
 * GET /api/storyboard/jobs?projectId=&sourceUnitId=&jobType=video
 *
 * Task card: KIIKIS-P2-TRAE-002 §2
 *
 * Lists generation jobs for the current project+episode. Used by the
 * ProductionWorkbench to restore video generation progress after a page
 * refresh (tasks continue on the server while the user is away).
 */

import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, error, code }, { status });
}

export async function GET(request: Request) {
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return errorResponse(401, "UNAUTHORIZED", "请先登录。");
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim() || "";
  const sourceUnitId = url.searchParams.get("sourceUnitId")?.trim() || "";
  const jobType = url.searchParams.get("jobType")?.trim() || "video";

  if (!projectId || !sourceUnitId) {
    return errorResponse(422, "MISSING_FIELD", "缺少 projectId / sourceUnitId");
  }

  if (jobType !== "video" && jobType !== "image") {
    return errorResponse(422, "INVALID_FIELD", "jobType 必须是 video 或 image");
  }

  // 查询 input_params->>sourceUnitId 过滤当前集（projectId 用 project_id 列）
  // target_type 区分 storyboard_shot (image) vs storyboard_shot_video (video)
  const targetType = jobType === "video" ? "storyboard_shot_video" : "storyboard_shot";
  try {
    const rows = await serviceFetch<Array<{
      id: string;
      status: string;
      target_id: string | null;
      result_url: string | null;
      error: string | null;
      created_at: string;
      updated_at: string;
    }>>(
      `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(userId)}&job_type=eq.${encodeURIComponent(jobType)}&target_type=eq.${encodeURIComponent(targetType)}&project_id=eq.${encodeURIComponent(projectId)}&input_params-%3E%3EsourceUnitId=eq.${encodeURIComponent(sourceUnitId)}&order=created_at.desc&limit=200&select=id,status,target_id,result_url,error,created_at,updated_at`,
    );
    return NextResponse.json({ success: true, jobs: rows ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(500, "JOB_LIST_FAILED", `查询 jobs 失败: ${message}`);
  }
}
