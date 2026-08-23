/**
 * GET /api/v2/project-start/resolve-work?projectId=...
 *
 * Legacy adaptation (Phase 3 Task 3.3): resolves a legacy projectId to its
 * primary Work id so /script-workbench can enter the Screenplay Studio.
 *
 * P0-02（PRD §4）：项目在列表中可见即必须能解析到可操作对象 ——
 * 项目存在但尚无 Work 行时，自动补建 script stage Work（幂等 RPC），
 * 不再返回 404 把用户甩回新建页；项目行本身缺失时返回 410
 * migration_issue（可追踪），也不进入英文死页。
 */

import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { isRetiredNovelRecord } from "@/lib/v2/retired-novel";
import { classifyServiceError } from "@/lib/server/v2/service-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProjectMarkerRow { workflow_type?: string | null; mode?: string | null; data?: Record<string, unknown> | null }
interface WorkRow { id: string; owner_id: string; is_primary: boolean }
interface EnsureStageWorkRpcRow { work_id: string; created: boolean }

export async function GET(request: NextRequest) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Work service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    // Bearer token first (the screenplay client path), server cookie fallback
    // for SSR callers — the two auth paths previously disagreed here.
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId is required.", code: "validation_failed" },
        { status: 422 },
      );
    }
    const projects = await serviceFetch<ProjectMarkerRow[]>(
      `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&select=workflow_type,mode,data&limit=1`,
    );
    if (projects[0] && isRetiredNovelRecord(projects[0])) {
      return NextResponse.json(
        { success: false, error: "This legacy novel project has been retired.", code: "retired_novel" },
        { status: 410 },
      );
    }
    // P0-02：列表可见但项目行缺失 → 可追踪的 migration_issue，不是 404 死页
    if (!projects[0]) {
      return NextResponse.json(
        {
          success: false,
          error: "项目行缺失（Migration Issue）：项目在列表中可见，但数据库没有对应的项目行。已记录，请稍后重试或联系支持。",
          code: "migration_issue",
        },
        { status: 410 },
      );
    }
    const rows = await serviceFetch<WorkRow[]>(
      `/rest/v1/storyflow_works?project_id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(viewer.id)}&select=id,owner_id,is_primary&order=created_at.asc&limit=10`,
    );
    let primary = (rows ?? []).find((r) => r.is_primary) ?? rows?.[0];
    if (!primary) {
      // P0-02：既有项目尚无 Work（pre-K22 数据）→ 幂等补建 script stage Work。
      // 幂等键确定性派生（owner+project+stage），重复调用不会产生多余 Work。
      // P1-05：song 项目补建 song Work（其余默认 script），幂等键含类型
      const provisionType = projects[0]?.workflow_type === "song" ? "song" : "script";
      const ensured = await serviceFetch<EnsureStageWorkRpcRow | EnsureStageWorkRpcRow[]>(
        "/rest/v1/rpc/ensure_project_stage_work",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_owner_id: viewer.id,
            p_project_id: projectId,
            p_work_type: provisionType,
            p_title: provisionType === "song" ? "歌曲" : "剧本",
            p_idempotency_key: `resolve:${viewer.id}:${projectId}:${provisionType}`,
          }),
        },
      );
      const result = Array.isArray(ensured) ? ensured[0] : ensured;
      if (!result?.work_id) {
        return NextResponse.json(
          { success: false, error: "Failed to provision the script work for this project.", code: "service_unavailable" },
          { status: 503 },
        );
      }
      primary = { id: result.work_id, owner_id: viewer.id, is_primary: true };
    }
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", workId: primary.id });
  } catch (error) {
    const classified = classifyServiceError(error, "resolve-work");
    return NextResponse.json(
      { success: false, error: classified.message, code: classified.code, requestId: classified.requestId },
      { status: classified.status },
    );
  }
}
