/**
 * PRD V1.0 验收 P0-05：制作入口服务端双重门禁。
 *
 * 客户端 useEffect 校验是 fail-open 的（找不到项目就放行），
 * 本路由提供 fail-closed 的服务端权威校验：
 *   1. 鉴权当前用户
 *   2. 用 service role 直读 storyflow_projects（不依赖用户 token 能否读到）
 *   3. 校验 creationWorkspace 存在且 mode=screenplay
 *   4. 校验 sourceUnit 在 screenplay.units 内
 *   5. 校验该 unit.status=finalized 且有非空结构化场次
 *   6. 任何一步失败默认拒绝（fail-closed）
 *
 * ProductionWorkbench hydration 时调用本路由；未通过时显示阻断页。
 */
import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";
import { canEnterProduction } from "@/lib/creation/state";
import type { CreationWorkspaceV2 } from "@/lib/creation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  owner_id: string;
  title: string;
  data: unknown;
  creation_workspace: unknown;
};

type VerifyResponse = {
  ok: boolean;
  reason?: string;
  projectTitle?: string;
};

export async function POST(request: Request) {
  let body: { projectId?: string; sourceUnitId?: string };
  try {
    body = (await request.json()) as { projectId?: string; sourceUnitId?: string };
  } catch {
    return NextResponse.json<VerifyResponse>({ ok: false, reason: "请求格式不正确。" }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const sourceUnitId = body.sourceUnitId?.trim();
  if (!projectId || !sourceUnitId) {
    return NextResponse.json<VerifyResponse>(
      { ok: false, reason: "缺少 projectId 或 sourceUnitId。" },
      { status: 400 },
    );
  }

  // 1. 鉴权
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return NextResponse.json<VerifyResponse>({ ok: false, reason: "请先登录后再操作。" }, { status: 401 });
  }

  // 2. 服务端读项目（fail-closed：无 service role 配置直接拒绝）
  if (!hasServiceRoleConfig()) {
    return NextResponse.json<VerifyResponse>(
      { ok: false, reason: "服务端未配置，不能校验制作入口。" },
      { status: 503 },
    );
  }

  try {
    const rows = await serviceFetch<ProjectRow[]>(
      `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&select=id,owner_id,title,data,creation_workspace&limit=1`,
    );
    const row = rows[0];
    // fail-closed：项目不存在或不属于当前用户都拒绝
    if (!row) {
      return NextResponse.json<VerifyResponse>(
        { ok: false, reason: "未找到该项目，不能进入制作。" },
        { status: 404 },
      );
    }
    if (row.owner_id !== userId) {
      return NextResponse.json<VerifyResponse>(
        { ok: false, reason: "无权访问该项目。" },
        { status: 403 },
      );
    }

    // 3. 解析 creationWorkspace（data 字段是旧版 jsonb，creation_workspace 是新字段）
    const workspace = (row.creation_workspace ?? (row.data as { creationWorkspace?: CreationWorkspaceV2 } | null)?.creationWorkspace) as CreationWorkspaceV2 | null;
    if (!workspace || workspace.version !== 2) {
      return NextResponse.json<VerifyResponse>(
        { ok: false, reason: "项目数据格式不正确，不能进入制作。" },
        { status: 400 },
      );
    }

    // 4-6. 复用 canEnterProduction 做内容校验
    const gate = canEnterProduction(workspace, sourceUnitId);
    if (!gate.ok) {
      return NextResponse.json<VerifyResponse>(
        { ok: false, reason: gate.reason || "该集未满足制作条件。" },
        { status: 403 },
      );
    }

    return NextResponse.json<VerifyResponse>({
      ok: true,
      projectTitle: row.title || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PRODUCTION_VERIFY_ERROR";
    return NextResponse.json<VerifyResponse>({ ok: false, reason: message }, { status: 500 });
  }
}
