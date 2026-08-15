import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { isRetiredNovelRecord } from "@/lib/v2/retired-novel";

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
  workflow_type?: string | null;
  mode?: string | null;
  data?: Record<string, unknown> | null;
};

type ProductionProjectRow = {
  id: string;
  project_id: string;
  owner_id: string;
  title: string;
  updated_at: string;
};

type ShotRow = {
  id: string;
  production_project_id: string;
  character_refs: unknown;
  scene_refs: unknown;
  prop_refs: unknown;
  image_url: string | null;
};

export type WorkCard = {
  id: string;
  title: string;
  projectRole: string;
  status: string;
  shotCount: number;
  characterCount: number;
  sceneCount: number;
  propCount: number;
  coverUrl: string | null;
  updatedAt: string;
};

export async function GET(request: NextRequest, context: { params: Promise<{ universeId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId } = await context.params;
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    // PRD §9.3 双重授权：universe access + project owner_id 匹配
    const universe = await fetchUniverseForRead(universeId, user.id);
    if (!universe) throw new Error("UNIVERSE_FORBIDDEN");

    const links = await serviceFetch<LinkRow[]>(
      `/rest/v1/storyflow_universe_project_links?universe_id=eq.${encodeURIComponent(universeId)}&select=id,universe_id,project_id,project_role,updated_at&order=updated_at.desc`,
    );

    if (!links.length) return ok({ works: [], requestId });

    const projectIds = links.map((link) => link.project_id).filter(Boolean);
    const projects = await serviceFetch<ProjectRow[]>(
      `/rest/v1/storyflow_projects?id=in.(${projectIds.map(encodeURIComponent).join(",")})&select=id,title,owner_id,status,updated_at,workflow_type,mode,data`,
    ).catch(() => [] as ProjectRow[]);

    // 仅返回当前用户 owner 的 project（双重授权第二层：project owner_id 匹配 user.id）
    // team 共享：若 universe 是 team-owned 且 project.user_id 在 team memberships 里，则也允许
    const accessibleProjects = projects.filter((project) => !isRetiredNovelRecord(project) && isProjectAccessible(project, universe, user.id));
    const accessibleIds = new Set(accessibleProjects.map((project) => project.id));
    const projectById = new Map(accessibleProjects.map((project) => [project.id, project]));

    const linkByProject = new Map<string, LinkRow>();
    for (const link of links) {
      if (accessibleIds.has(link.project_id) && !linkByProject.has(link.project_id)) {
        linkByProject.set(link.project_id, link);
      }
    }

    if (!accessibleIds.size) return ok({ works: [], requestId });

    // production_project_id 映射
    const productionProjects = await serviceFetch<ProductionProjectRow[]>(
      `/rest/v1/storyflow_production_projects?project_id=in.(${Array.from(accessibleIds).map(encodeURIComponent).join(",")})&select=id,project_id,owner_id,title,updated_at`,
    ).catch(() => [] as ProductionProjectRow[]);
    const prodByProjectId = new Map(productionProjects.map((row) => [row.project_id, row]));

    // 仅 owner 匹配的 production_projects（避免泄露他人制片项目）
    const accessibleProdIds = productionProjects
      .filter((row) => row.owner_id === user.id)
      .map((row) => row.id);
    const shotsByProdId = new Map<string, ShotRow[]>();
    if (accessibleProdIds.length) {
      const shots = await serviceFetch<ShotRow[]>(
        `/rest/v1/storyflow_production_shots?production_project_id=in.(${accessibleProdIds.map(encodeURIComponent).join(",")})&select=id,production_project_id,character_refs,scene_refs,prop_refs,image_url`,
      ).catch(() => [] as ShotRow[]);
      for (const shot of shots) {
        const arr = shotsByProdId.get(shot.production_project_id) || [];
        arr.push(shot);
        shotsByProdId.set(shot.production_project_id, arr);
      }
    }

    const works: WorkCard[] = Array.from(linkByProject.values()).map((link) => {
      const project = projectById.get(link.project_id);
      const prod = prodByProjectId.get(link.project_id);
      const shots = (prod && shotsByProdId.get(prod.id)) || [];

      const characterNames = new Set<string>();
      const sceneNames = new Set<string>();
      const propNames = new Set<string>();
      let coverUrl: string | null = null;
      for (const shot of shots) {
        for (const ref of asStringArray(shot.character_refs)) characterNames.add(ref);
        for (const ref of asStringArray(shot.scene_refs)) sceneNames.add(ref);
        for (const ref of asStringArray(shot.prop_refs)) propNames.add(ref);
        if (!coverUrl && shot.image_url) coverUrl = shot.image_url;
      }

      return {
        id: link.project_id,
        title: project?.title || prod?.title || link.project_id,
        projectRole: link.project_role,
        status: project?.status || (prod ? "production" : "draft"),
        shotCount: shots.length,
        characterCount: characterNames.size,
        sceneCount: sceneNames.size,
        propCount: propNames.size,
        coverUrl,
        updatedAt: project?.updated_at || link.updated_at,
      };
    });

    return ok({ works, requestId });
  } catch (error) {
    return await errorWithRequestId(error, "读取作品列表失败。", requestId);
  }
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
  // 若 project 无 owner_id（旧数据）但 universe 属于该 user，则允许通过 universe 链访问
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
