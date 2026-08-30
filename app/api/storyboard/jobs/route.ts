/**
 * GET /api/storyboard/jobs?projectId=&sourceUnitId=&jobType=video
 *
 * Task card: KIIKIS-P2-TRAE-002 §2 + PRD §9.2 TRAE-PW-P0-005（重签）
 *
 * Lists generation jobs for the current project+episode. Used by the
 * ProductionWorkbench to restore video generation progress after a page
 * refresh (tasks continue on the server while the user is away).
 *
 * PRD §9.2：对 completed 且有 storage_path 的视频 job，服务端根据 storage_path
 * 重新签发短期 URL，避免返回过期签名链接。
 */

import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { signStoredVideo } from "@/lib/ai/video/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, error, code }, { status });
}

type JobRow = {
  id: string;
  status: string;
  target_id: string | null;
  result_url: string | null;
  storage_path: string | null;
  error: string | null;
  provider_task_id: string | null;
  input_params: Record<string, unknown>;
  result_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

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
  // PRD §9.2：select 加入 storage_path，用于列表重签
  const targetType = jobType === "video" ? "storyboard_shot_video" : "storyboard_shot";
  try {
    const rows = await serviceFetch<JobRow[]>(
      `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(userId)}&job_type=eq.${encodeURIComponent(jobType)}&target_type=eq.${encodeURIComponent(targetType)}&project_id=eq.${encodeURIComponent(projectId)}&input_params-%3E%3EsourceUnitId=eq.${encodeURIComponent(sourceUnitId)}&order=created_at.desc&limit=200&select=id,status,target_id,result_url,storage_path,error,provider_task_id,input_params,result_metadata,created_at,updated_at`,
    );

    // PRD §9.2：对 completed 且有 storage_path 的 video job 重签 result_url
    // storage_path 列可能不存在（migration 未执行）→ 捕获后返回原 result_url
    const jobs = await Promise.all((rows ?? []).map(async (row) => {
      if (
        jobType === "video" &&
        row.status === "completed" &&
        row.storage_path
      ) {
        try {
          const { signedUrl } = await signStoredVideo(row.storage_path);
          return { ...row, result_url: signedUrl };
        } catch {
          // 重签失败不降级 status，返回旧 result_url（可能是过期签名）
          return row;
        }
      }
      return row;
    }));

    return NextResponse.json({ success: true, jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(500, "JOB_LIST_FAILED", `查询 jobs 失败: ${message}`);
  }
}
