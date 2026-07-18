import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { getUniverseEntityThumbnail } from "@/lib/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UniverseRow = {
  id: string;
  user_id: string | null;
  team_id: string | null;
};

type LinkRow = {
  id: string;
  universe_id: string;
  project_id: string;
  project_role: string;
  updated_at: string;
};

type ProjectRow = {
  id: string;
  title: string;
  owner_id: string | null;
  status: string;
  updated_at: string;
};

type ProductionProjectRow = {
  id: string;
  project_id: string;
  owner_id: string;
};

type ShotRow = {
  id: string;
  production_project_id: string;
  character_refs: unknown;
  scene_refs: unknown;
  prop_refs: unknown;
};

type EntityRow = {
  id: string;
  universe_id: string;
  type: string;
  name: string;
  details_json: Record<string, unknown> | null;
};

type EntityRef = { name: string; thumbnail: string | null };

export type WorkDetail = {
  project: { id: string; title: string; projectRole: string; status: string; updatedAt: string };
  characters: EntityRef[];
  scenes: EntityRef[];
  props: EntityRef[];
  requestId: string;
};

export async function GET(request: NextRequest, context: { params: Promise<{ universeId: string; projectId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId, projectId } = await context.params;
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    // PRD §9.3 双重授权：universe access
    const universe = await fetchUniverseForRead(universeId, user.id);
    if (!universe) throw new Error("UNIVERSE_FORBIDDEN");

    // 验证 project 属于该 universe（查 links 表）—— 不属于则 404
    const links = await serviceFetch<LinkRow[]>(
      `/rest/v1/storyflow_universe_project_links?universe_id=eq.${encodeURIComponent(universeId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,universe_id,project_id,project_role,updated_at&limit=1`,
    );
    const link = links[0];
    if (!link) throw new Error("UNIVERSE_NOT_FOUND");

    // 验证 project owner_id = user.id 或团队共享
    const projectRows = await serviceFetch<ProjectRow[]>(
      `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&select=id,title,owner_id,status,updated_at&limit=1`,
    );
    const project = projectRows[0];
    if (!project) throw new Error("UNIVERSE_NOT_FOUND");
    if (!isProjectAccessible(project, universe, user.id)) throw new Error("PROJECT_FORBIDDEN");

    // 查 production_projects 拿 production_project_id 映射
    const productionProjects = await serviceFetch<ProductionProjectRow[]>(
      `/rest/v1/storyflow_production_projects?project_id=eq.${encodeURIComponent(projectId)}&select=id,project_id,owner_id&limit=5`,
    ).catch(() => [] as ProductionProjectRow[]);
    const accessibleProdIds = productionProjects
      .filter((row) => row.owner_id === user.id)
      .map((row) => row.id);

    // 聚合 shots 的 character_refs/scene_refs/prop_refs（去重）
    // PRD §6.4 关键道具：prop_refs 列由 migration 20260720020000 添加
    const characterNames = new Set<string>();
    const sceneNames = new Set<string>();
    const propNames = new Set<string>();
    if (accessibleProdIds.length) {
      const shots = await serviceFetch<ShotRow[]>(
        `/rest/v1/storyflow_production_shots?production_project_id=in.(${accessibleProdIds.map(encodeURIComponent).join(",")})&select=id,production_project_id,character_refs,scene_refs,prop_refs`,
      ).catch(() => [] as ShotRow[]);
      for (const shot of shots) {
        for (const ref of asStringArray(shot.character_refs)) characterNames.add(ref);
        for (const ref of asStringArray(shot.scene_refs)) sceneNames.add(ref);
        for (const ref of asStringArray(shot.prop_refs)) propNames.add(ref);
      }
    }

    // 缩略图：从 universe_entities 按 name 匹配取 thumbnail，无则 null
    const entityNames = Array.from(new Set([...characterNames, ...sceneNames, ...propNames]));
    let entitiesByName = new Map<string, EntityRow>();
    if (entityNames.length) {
      const entities = await serviceFetch<EntityRow[]>(
        `/rest/v1/storyflow_universe_entities?universe_id=eq.${encodeURIComponent(universeId)}&name=in.(${entityNames.map(encodeURIComponent).join(",")})&select=id,universe_id,type,name,details_json`,
      ).catch(() => [] as EntityRow[]);
      for (const entity of entities) {
        if (!entitiesByName.has(entity.name)) entitiesByName.set(entity.name, entity);
      }
    }

    const characters = buildRefs(characterNames, entitiesByName, "character");
    const scenes = buildRefs(sceneNames, entitiesByName, "location");
    // PRD §3.1: Object / Prop 类型在 universe_entities 中 type=object
    const props = buildRefs(propNames, entitiesByName, "object");

    return ok({
      project: {
        id: project.id,
        title: project.title,
        projectRole: link.project_role,
        status: project.status,
        updatedAt: project.updated_at,
      },
      characters,
      scenes,
      props,
      requestId,
    });
  } catch (error) {
    return await errorWithRequestId(error, "读取作品详情失败。", requestId);
  }
}

function buildRefs(names: Set<string>, entitiesByName: Map<string, EntityRow>, expectedType: string): EntityRef[] {
  return Array.from(names).slice(0, 6).map((name) => {
    const entity = entitiesByName.get(name);
    let thumbnail: string | null = null;
    if (entity) {
      // 优先按类型匹配，避免 location/character/object 重名
      if (entity.type === expectedType) {
        const url = getUniverseEntityThumbnail({ details_json: entity.details_json || {} });
        thumbnail = url || null;
      }
    }
    return { name, thumbnail };
  });
}

async function fetchUniverseForRead(universeId: string, userId: string): Promise<UniverseRow | null> {
  const rows = await serviceFetch<UniverseRow[]>(
    `/rest/v1/storyflow_universes?id=eq.${encodeURIComponent(universeId)}&select=id,user_id,team_id&limit=1`,
  );
  const universe = rows[0];
  if (!universe) return null;
  if (universe.user_id === userId) return universe;
  if (universe.team_id) {
    const memberships = await serviceFetch<Array<{ team_id: string }>>(
      `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(universe.team_id)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=team_id&limit=1`,
    ).catch(() => [] as Array<{ team_id: string }>);
    if (memberships.length) return universe;
  }
  return null;
}

function isProjectAccessible(project: ProjectRow, universe: UniverseRow, userId: string): boolean {
  if (project.owner_id === userId) return true;
  if (!project.owner_id && universe.user_id === userId) return true;
  return false;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const name = record.name || record.id || record.character_name || record.prop_name;
        return name ? String(name) : "";
      }
      return String(item || "");
    })
    .filter(Boolean);
}

async function errorWithRequestId(error: unknown, fallback: string, requestId: string) {
  const errRes = apiError(error, fallback);
  const body = await errRes.json().catch(() => ({ success: false, error: fallback }));
  return NextResponse.json({ ...body, requestId }, { status: errRes.status });
}
