import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

const TABLE = "/rest/v1/storyflow_character_portrayals";

const SELECT_FIELDS =
  "id,actor_profile_id,character_id,project_id,casting_assignment_id,portrayal_name,visual_prompt,costume_direction,reference_image_url,is_reusable,metadata,owner_id,team_id,created_at,updated_at";

export type PortrayalCard = {
  id: string;
  workTitle: string;
  universeName: string | null;
  characterName: string;
  costumeDirection: string;
  visualPrompt: string;
  referenceImageUrl: string | null;
  isReusable: boolean;
  updatedAt: string;
};

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const search = new URL(request.url).searchParams;
    const projectId = search.get("projectId");
    const actorId = search.get("actorId");

    // PRD §7.3 / §13.2：owner/team 隔离 + 语义化作品数据，不返回裸 project_id
    // 先查 actor_profile 列表（owner_id = user.id 或团队共享）
    const memberships = await serviceFetch<Array<{ team_id: string }>>(
      `/rest/v1/storyflow_team_members?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&select=team_id`,
    ).catch(() => [] as Array<{ team_id: string }>);
    const teamIds = memberships.map((row) => row.team_id).filter(Boolean);

    // 修复 PGRST：or()/and() 内部必须用 col.op.val 点号语法；team 表达式放首项规避 PGRST100 owner_id o 前缀词法 bug
    const userIdEnc = encodeURIComponent(user.id);
    const ownerInOr = `owner_id.eq.${userIdEnc}`;
    const ownerTop = `owner_id=eq.${userIdEnc}`;
    const teamExpr = teamIds.length
      ? `team_id.in.(${teamIds.map(encodeURIComponent).join(",")})`
      : "";
    const accessQuery = teamExpr ? `or=(${teamExpr},${ownerInOr})` : ownerTop;

    const filters = [accessQuery, `actor_profile_id=not.is.null`];
    if (projectId) filters.push(`project_id=eq.${encodeURIComponent(projectId)}`);
    if (actorId) filters.push(`actor_profile_id=eq.${encodeURIComponent(actorId)}`);

    const query = `${TABLE}?${filters.join("&")}&select=${SELECT_FIELDS}&order=updated_at.desc`;
    const portrayals = await serviceFetch<Array<RawPortrayal>>(query);

    if (!portrayals.length) return ok({ portrayals: [], requestId });

    // JOIN projects 拿 workTitle
    const projectIds = Array.from(new Set(portrayals.map((p) => p.project_id).filter(Boolean))) as string[];
    const projects = projectIds.length
      ? await serviceFetch<Array<{ id: string; title: string }>>(
          `/rest/v1/storyflow_projects?id=in.(${projectIds.map(encodeURIComponent).join(",")})&select=id,title`,
        ).catch(() => [] as Array<{ id: string; title: string }>)
      : [];
    const titleByProject = new Map(projects.map((p) => [p.id, p.title]));

    // JOIN universe_project_links + universes 拿 universeName
    const links = projectIds.length
      ? await serviceFetch<Array<{ project_id: string; universe_id: string }>>(
          `/rest/v1/storyflow_universe_project_links?project_id=in.(${projectIds.map(encodeURIComponent).join(",")})&select=project_id,universe_id`,
        ).catch(() => [] as Array<{ project_id: string; universe_id: string }>)
      : [];
    const universeIds = Array.from(new Set(links.map((l) => l.universe_id).filter(Boolean)));
    const universes = universeIds.length
      ? await serviceFetch<Array<{ id: string; name: string }>>(
          `/rest/v1/storyflow_universes?id=in.(${universeIds.map(encodeURIComponent).join(",")})&select=id,name`,
        ).catch(() => [] as Array<{ id: string; name: string }>)
      : [];
    const nameByUniverse = new Map(universes.map((u) => [u.id, u.name]));
    const universeByProject = new Map<string, string>();
    for (const link of links) {
      if (!universeByProject.has(link.project_id)) universeByProject.set(link.project_id, link.universe_id);
    }

    const cards: PortrayalCard[] = portrayals.map((p) => ({
      id: p.id,
      // 不裸 project_id：用 workTitle，回退到 "未关联作品"
      workTitle: (p.project_id && titleByProject.get(p.project_id)) || "未关联作品",
      universeName: (p.project_id && universeByProject.get(p.project_id) && nameByUniverse.get(universeByProject.get(p.project_id)!)) || null,
      characterName: p.portrayal_name || p.character_id || "",
      costumeDirection: p.costume_direction || "",
      visualPrompt: p.visual_prompt || "",
      referenceImageUrl: p.reference_image_url || null,
      isReusable: p.is_reusable !== false,
      updatedAt: p.updated_at,
    }));

    return ok({ portrayals: cards, requestId });
  } catch (error) {
    return await errorWithRequestId(error, "读取角色演绎列表失败。", requestId);
  }
}

type RawPortrayal = {
  id: string;
  actor_profile_id: string;
  character_id: string;
  project_id: string | null;
  casting_assignment_id: string | null;
  portrayal_name: string;
  visual_prompt: string;
  costume_direction: string;
  reference_image_url: string | null;
  is_reusable: boolean;
  metadata: Record<string, unknown>;
  owner_id: string | null;
  team_id: string | null;
  created_at: string;
  updated_at: string;
};

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
      owner_id: user.id,
      team_id: null,
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

    const portrayalId = new URL(request.url).searchParams.get("id") || "";
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

async function errorWithRequestId(error: unknown, fallback: string, requestId: string) {
  const errRes = apiError(error, fallback);
  const body = await errRes.json().catch(() => ({ success: false, error: fallback }));
  return NextResponse.json({ ...body, requestId }, { status: errRes.status });
}
