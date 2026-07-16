import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

const TABLE = "/rest/v1/storyflow_story_stages";

const SELECT_FIELDS =
  "id,project_id,season_id,name,stage_type,sort_order,episode_ids,workflow_status,metadata,created_at,updated_at";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return ok({ stages: [] });
    }

    const stages = await serviceFetch<unknown[]>(
      `${TABLE}?project_id=eq.${encodeURIComponent(projectId)}&select=${SELECT_FIELDS}&order=sort_order.asc,created_at.asc`,
    );
    // user.id 暂用于未来按 owner 过滤；当前 storyflow_story_stages 表无 owner_id，按 project_id 过滤。
    void user;
    return ok({ stages });
  } catch (error) {
    return apiError(error, "读取叙事弧线失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const body = await request.json().catch(() => ({}));
    const projectId = String(body.project_id || "").trim();
    const name = String(body.name || "").trim();
    if (!projectId) throw new Error("PROJECT_REQUIRED");
    if (!name) throw new Error("STAGE_NAME_REQUIRED");

    const stageType = normalizeStageType(body.stage_type);
    const workflowStatus = normalizeWorkflowStatus(body.workflow_status);
    const episodeIds = normalizeStringArray(body.episode_ids);

    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      project_id: projectId,
      season_id: body.season_id ? String(body.season_id) : null,
      name,
      stage_type: stageType,
      sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
      episode_ids: episodeIds,
      workflow_status: workflowStatus,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      created_at: now,
      updated_at: now,
    };

    await serviceFetch(TABLE, {
      method: "POST",
      body: JSON.stringify(row),
    });

    void user;
    return ok({ stage: row });
  } catch (error) {
    return apiError(error, "创建叙事弧线阶段失败。");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const body = await request.json().catch(() => ({}));
    const stageId = String(body.id || "").trim();
    if (!stageId) throw new Error("STAGE_NOT_FOUND");

    const existing = await serviceFetch<Array<{ id: string }>>(
      `${TABLE}?id=eq.${encodeURIComponent(stageId)}&select=id&limit=1`,
    );
    if (!existing[0]) throw new Error("STAGE_NOT_FOUND");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.project_id === "string" && body.project_id.trim()) patch.project_id = body.project_id.trim();
    if (typeof body.season_id === "string") patch.season_id = body.season_id || null;
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.stage_type === "string") patch.stage_type = normalizeStageType(body.stage_type);
    if (Number.isFinite(body.sort_order)) patch.sort_order = Number(body.sort_order);
    if (Array.isArray(body.episode_ids)) patch.episode_ids = normalizeStringArray(body.episode_ids);
    if (typeof body.workflow_status === "string") patch.workflow_status = normalizeWorkflowStatus(body.workflow_status);
    if (body.metadata && typeof body.metadata === "object") patch.metadata = body.metadata;

    await serviceFetch(`${TABLE}?id=eq.${encodeURIComponent(stageId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });

    void user;
    return ok({ stage: { id: stageId, ...patch } });
  } catch (error) {
    return apiError(error, "更新叙事弧线阶段失败。");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const stageId = request.nextUrl.searchParams.get("id") || "";
    if (!stageId) throw new Error("STAGE_NOT_FOUND");

    await serviceFetch(`${TABLE}?id=eq.${encodeURIComponent(stageId)}`, { method: "DELETE" });
    void user;
    return ok({ stage: { id: stageId, deleted: true } });
  } catch (error) {
    return apiError(error, "删除叙事弧线阶段失败。");
  }
}

function normalizeStageType(value: unknown) {
  const allowed = ["setup", "rising_action", "climax", "falling_action", "resolution"];
  if (typeof value === "string" && allowed.includes(value)) return value;
  return "setup";
}

function normalizeWorkflowStatus(value: unknown) {
  const allowed = ["planning", "drafting", "in_review", "completed", "archived"];
  if (typeof value === "string" && allowed.includes(value)) return value;
  return "planning";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}
