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
  name: string;
  description: string | null;
  card_summary: string | null;
  genre: string | null;
  default_language: string | null;
  target_markets: string[] | null;
  tone: string | null;
  status: string;
  updated_at: string;
};

type EntityRow = {
  id: string;
  universe_id: string;
  type: string;
  name: string;
  summary: string;
  details_json: Record<string, unknown> | null;
  updated_at: string;
};

type InboxRow = {
  id: string;
  universe_id: string;
  item_type: string;
  title: string;
  source_excerpt: string;
  confidence: number;
  status: string;
  updated_at: string;
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
  updated_at: string;
};

type CanonCheckRow = {
  id: string;
  universe_id: string;
  issues_json: Array<{ severity: string }> | null;
};

type Counts = {
  characters: number;
  locations: number;
  props: number;
  organizations: number;
  works: number;
  canonFacts: number;
  relationships: number;
  timeline: number;
  pendingInbox: number;
};

export async function GET(request: NextRequest, context: { params: Promise<{ universeId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId } = await context.params;
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    // PRD §9.2 鉴权：验证 user 对该 universe 有读权限（user_id 匹配或 team_id 在 memberships 里）
    const universe = await fetchUniverseForRead(universeId, user.id);
    if (!universe) throw new Error("UNIVERSE_FORBIDDEN");

    const universeFilter = `universe_id=eq.${encodeURIComponent(universeId)}`;

    const [entities, relationships, timeline, canonFacts, inbox, links, projects, reports] = await Promise.all([
      serviceFetch<EntityRow[]>(`/rest/v1/storyflow_universe_entities?${universeFilter}&select=id,universe_id,type,name,summary,details_json,updated_at&order=updated_at.desc`),
      serviceFetch<Array<{ universe_id: string }>>(`/rest/v1/storyflow_universe_relationships?${universeFilter}&select=universe_id`),
      serviceFetch<Array<{ universe_id: string }>>(`/rest/v1/storyflow_universe_timeline_events?${universeFilter}&select=universe_id`),
      serviceFetch<Array<{ universe_id: string; is_locked: boolean }>>(`/rest/v1/storyflow_canon_facts?${universeFilter}&select=universe_id,is_locked`),
      serviceFetch<InboxRow[]>(`/rest/v1/storyflow_universe_inbox_items?${universeFilter}&status=eq.pending&select=id,universe_id,item_type,title,source_excerpt,confidence,status,updated_at&order=updated_at.desc&limit=5`),
      serviceFetch<LinkRow[]>(`/rest/v1/storyflow_universe_project_links?${universeFilter}&select=id,universe_id,project_id,project_role,updated_at&order=updated_at.desc&limit=3`),
      // works preview：从 links 拿 project_id 后再查 projects（避免 N+1，限制 3 条）
      Promise.resolve([] as ProjectRow[]),
      serviceFetch<CanonCheckRow[]>(`/rest/v1/storyflow_canon_check_reports?${universeFilter}&select=id,universe_id,issues_json&order=id.desc&limit=5`),
    ]);

    // 拉 works 标题（仅前 3 个 project_id）
    const projectIds = links.map((link) => link.project_id).filter(Boolean).slice(0, 3);
    const projectRows: ProjectRow[] = projectIds.length
      ? await serviceFetch<ProjectRow[]>(
          `/rest/v1/storyflow_projects?id=in.(${projectIds.map(encodeURIComponent).join(",")})&select=id,title,updated_at`,
        ).catch(() => [] as ProjectRow[])
      : [];
    const projectById = new Map(projectRows.map((row) => [row.id, row]));

    // 计数
    const counts: Counts = {
      characters: 0,
      locations: 0,
      props: 0,
      organizations: 0,
      works: 0,
      canonFacts: 0,
      relationships: 0,
      timeline: 0,
      pendingInbox: 0,
    };
    for (const row of entities) {
      if (row.type === "character") counts.characters += 1;
      else if (row.type === "location") counts.locations += 1;
      else if (row.type === "object") counts.props += 1;
      else if (row.type === "organization") counts.organizations += 1;
    }
    counts.relationships = relationships.length;
    counts.timeline = timeline.length;
    counts.canonFacts = canonFacts.length;
    counts.works = new Set(links.map((link) => link.project_id)).size;
    // pendingInbox 真实计数需要单独 query count；这里使用 inbox.length 仅作下界（limit=5）
    const inboxCountRow = await serviceFetch<Array<{ count: number }>>(
      `/rest/v1/storyflow_universe_inbox_items?${universeFilter}&status=eq.pending&select=id&limit=1000`,
    ).catch(() => [] as Array<{ count: number }>);
    counts.pendingInbox = inboxCountRow.length;

    // 代表 entity：前 6 个有缩略图（character 优先）
    const sortedEntities = [...entities].sort((a, b) => {
      const aHasThumb = getUniverseEntityThumbnail({ details_json: a.details_json || {} }) ? 1 : 0;
      const bHasThumb = getUniverseEntityThumbnail({ details_json: b.details_json || {} }) ? 1 : 0;
      if (aHasThumb !== bHasThumb) return bHasThumb - aHasThumb;
      const typeOrder = (type: string) => (type === "character" ? 0 : type === "location" ? 1 : 2);
      return typeOrder(a.type) - typeOrder(b.type);
    });
    const representativeEntities = sortedEntities
      .filter((entity) => Boolean(getUniverseEntityThumbnail({ details_json: entity.details_json || {} })))
      .slice(0, 6)
      .map((entity) => ({
        id: entity.id,
        type: entity.type,
        name: entity.name,
        thumbnail: getUniverseEntityThumbnail({ details_json: entity.details_json || {} }),
      }));

    // 最近变化：前 5 条 entity（按 updated_at desc）
    const recentChanges = entities.slice(0, 5).map((entity) => ({
      id: entity.id,
      type: entity.type,
      name: entity.name,
      updatedAt: entity.updated_at,
    }));

    // pending items：前 5 条
    const pendingItems = inbox.map((item) => ({
      id: item.id,
      type: item.item_type,
      summary: item.title || item.source_excerpt,
      confidence: Number(item.confidence) || 0,
      source: item.source_excerpt,
    }));

    // canon conflicts：最近 reports 里 critical/warning 数量
    let canonConflicts = 0;
    for (const report of reports) {
      const issues = report.issues_json || [];
      for (const issue of issues) {
        if (issue.severity === "critical" || issue.severity === "warning") canonConflicts += 1;
      }
    }

    // works 预览：前 3 个
    const worksPreview = links.slice(0, 3).map((link) => {
      const project = projectById.get(link.project_id);
      return {
        id: link.project_id,
        title: project?.title || link.project_id,
        projectRole: link.project_role,
        updatedAt: project?.updated_at || link.updated_at,
      };
    });

    return ok({
      universe: {
        id: universe.id,
        name: universe.name,
        cardSummary: buildCardSummary(universe.card_summary, universe.description),
        description: universe.description || "",
        genre: universe.genre || "",
        defaultLanguage: universe.default_language || "",
        targetMarkets: Array.isArray(universe.target_markets) ? universe.target_markets : [],
        tone: universe.tone || "",
        status: universe.status,
        updatedAt: universe.updated_at,
      },
      counts,
      representativeEntities,
      recentChanges,
      pendingItems,
      canonConflicts,
      works: worksPreview,
      requestId,
    });
  } catch (error) {
    return await errorWithRequestId(error, "读取宇宙概览失败。", requestId);
  }
}

async function fetchUniverseForRead(universeId: string, userId: string): Promise<UniverseRow | null> {
  const rows = await serviceFetch<UniverseRow[]>(
    `/rest/v1/storyflow_universes?id=eq.${encodeURIComponent(universeId)}&select=id,user_id,team_id,name,description,card_summary,genre,default_language,target_markets,tone,status,updated_at&limit=1`,
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

function buildCardSummary(cardSummary: string | null, description: string | null): string {
  const direct = (cardSummary || "").trim();
  if (direct) return truncate(direct);
  const desc = (description || "").trim();
  if (!desc) return "";
  return truncate(stripMarkdown(desc));
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function truncate(text: string): string {
  const hasCJK = /[\u4e00-\u9fff]/.test(text);
  const limit = hasCJK ? 60 : 160;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}…`;
}

async function errorWithRequestId(error: unknown, fallback: string, requestId: string) {
  const errRes = apiError(error, fallback);
  const body = await errRes.json().catch(() => ({ success: false, error: fallback }));
  return NextResponse.json({ ...body, requestId }, { status: errRes.status });
}
