import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

const TABLE = "/rest/v1/storyflow_character_portrayals";

const SELECT_FIELDS =
  "id,actor_profile_id,character_id,project_id,casting_assignment_id,portrayal_name,visual_prompt,costume_direction,reference_image_url,is_reusable,metadata,created_at,updated_at";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const projectId = request.nextUrl.searchParams.get("projectId");
    const actorId = request.nextUrl.searchParams.get("actorId");

    const filters = [`actor_profile_id=not.is.null`];
    // storyflow_character_portrayals 没有 owner_id，按 actor_profile_id 限定到当前用户拥有的演员。
    // 通过子查询先获取当前用户的 actor id 列表，再过滤。
    const actorRows = await serviceFetch<Array<{ id: string }>>(
      `/rest/v1/storyflow_actor_profiles?owner_id=eq.${encodeURIComponent(user.id)}&status=neq.archived&select=id`,
    ).catch(() => [] as Array<{ id: string }>);

    if (actorRows.length === 0) {
      return ok({ portrayals: [] });
    }

    const actorIdList = actorRows.map((row) => row.id).join(",");
    filters.push(`actor_profile_id=in.(${actorIdList})`);
    if (projectId) filters.push(`project_id=eq.${encodeURIComponent(projectId)}`);
    if (actorId) filters.push(`actor_profile_id=eq.${encodeURIComponent(actorId)}`);

    const query = `${TABLE}?${filters.join("&")}&select=${SELECT_FIELDS}&order=updated_at.desc`;
    const portrayals = await serviceFetch<unknown[]>(query);
    return ok({ portrayals });
  } catch (error) {
    return apiError(error, "读取角色演绎列表失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const body = await request.json().catch(() => ({}));
    const actorId = String(body.actor_profile_id || "").trim();
    const characterId = String(body.character_id || "").trim();
    if (!actorId) throw new Error("ACTOR_REQUIRED");
    if (!characterId) throw new Error("CHARACTER_REQUIRED");

    // 校验当前用户拥有该演员
    await assertActorOwnedByUser(user.id, actorId);

    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      actor_profile_id: actorId,
      character_id: characterId,
      project_id: body.project_id ? String(body.project_id) : null,
      casting_assignment_id: body.casting_assignment_id || null,
      portrayal_name: String(body.portrayal_name || "").slice(0, 200),
      visual_prompt: String(body.visual_prompt || ""),
      costume_direction: String(body.costume_direction || ""),
      reference_image_url: body.reference_image_url ? String(body.reference_image_url) : null,
      is_reusable: body.is_reusable !== false,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      created_at: now,
      updated_at: now,
    };

    await serviceFetch(TABLE, {
      method: "POST",
      body: JSON.stringify(row),
    });

    return ok({ portrayal: row });
  } catch (error) {
    return apiError(error, "创建角色演绎失败。");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const body = await request.json().catch(() => ({}));
    const portrayalId = String(body.id || "").trim();
    if (!portrayalId) throw new Error("PORTRAYAL_NOT_FOUND");

    const existing = await serviceFetch<Array<{ id: string; actor_profile_id: string }>>(
      `${TABLE}?id=eq.${encodeURIComponent(portrayalId)}&select=id,actor_profile_id&limit=1`,
    );
    const portrayal = existing[0];
    if (!portrayal) throw new Error("PORTRAYAL_NOT_FOUND");
    await assertActorOwnedByUser(user.id, portrayal.actor_profile_id);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.character_id === "string" && body.character_id.trim()) patch.character_id = body.character_id.trim();
    if (typeof body.project_id === "string") patch.project_id = body.project_id || null;
    if (typeof body.casting_assignment_id === "string") patch.casting_assignment_id = body.casting_assignment_id || null;
    if (typeof body.portrayal_name === "string") patch.portrayal_name = body.portrayal_name.slice(0, 200);
    if (typeof body.visual_prompt === "string") patch.visual_prompt = body.visual_prompt;
    if (typeof body.costume_direction === "string") patch.costume_direction = body.costume_direction;
    if (typeof body.reference_image_url === "string") patch.reference_image_url = body.reference_image_url || null;
    if (typeof body.is_reusable === "boolean") patch.is_reusable = body.is_reusable;
    if (body.metadata && typeof body.metadata === "object") patch.metadata = body.metadata;

    await serviceFetch(`${TABLE}?id=eq.${encodeURIComponent(portrayalId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });

    return ok({ portrayal: { id: portrayalId, ...patch } });
  } catch (error) {
    return apiError(error, "更新角色演绎失败。");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const portrayalId = request.nextUrl.searchParams.get("id") || "";
    if (!portrayalId) throw new Error("PORTRAYAL_NOT_FOUND");

    const existing = await serviceFetch<Array<{ id: string; actor_profile_id: string }>>(
      `${TABLE}?id=eq.${encodeURIComponent(portrayalId)}&select=id,actor_profile_id&limit=1`,
    );
    const portrayal = existing[0];
    if (!portrayal) throw new Error("PORTRAYAL_NOT_FOUND");
    await assertActorOwnedByUser(user.id, portrayal.actor_profile_id);

    await serviceFetch(`${TABLE}?id=eq.${encodeURIComponent(portrayalId)}`, { method: "DELETE" });
    return ok({ portrayal: { id: portrayalId, deleted: true } });
  } catch (error) {
    return apiError(error, "删除角色演绎失败。");
  }
}

async function assertActorOwnedByUser(userId: string, actorId: string) {
  const rows = await serviceFetch<Array<{ id: string; owner_id: string }>>(
    `/rest/v1/storyflow_actor_profiles?id=eq.${encodeURIComponent(actorId)}&select=id,owner_id&limit=1`,
  ).catch(() => [] as Array<{ id: string; owner_id: string }>);
  const actor = rows[0];
  if (!actor) throw new Error("ACTOR_NOT_FOUND");
  if (actor.owner_id !== userId) throw new Error("ACTOR_FORBIDDEN");
}
