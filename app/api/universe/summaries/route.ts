import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CountRow = { universe_id: string };
type EntityRow = CountRow & { type: string };
type InboxRow = CountRow & { status: string };
type LinkRow = CountRow & { project_id: string };

type UniverseRow = {
  id: string;
  name: string;
  status: string;
  card_summary: string | null;
  description: string | null;
  cover_asset_version_id: string | null;
  metadata: Record<string, unknown> | null;
  genre: string | null;
  updated_at: string;
  archived_at: string | null;
};

export type UniverseListItem = {
  id: string;
  name: string;
  status: string;
  cardSummary: string;
  coverUrl: string | null;
  tags: string[];
  workCount: number;
  characterCount: number;
  locationCount: number;
  pendingInboxCount: number;
  updatedAt: string;
};

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const memberships = await serviceFetch<Array<{ team_id: string }>>(
      `/rest/v1/storyflow_team_members?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&select=team_id`,
    );
    const teamIds = memberships.map((row) => row.team_id).filter(Boolean);
    // PRD §8.2 列表默认排除已归档（archived_at IS NULL）；owner/team 过滤在服务端完成
    const accessFilter = teamIds.length
      ? `or=(user_id.eq.${encodeURIComponent(user.id)},team_id.in.(${teamIds.map(encodeURIComponent).join(",")}))`
      : `user_id=eq.${encodeURIComponent(user.id)}`;

    const universes = await serviceFetch<UniverseRow[]>(
      `/rest/v1/storyflow_universes?${accessFilter}&archived_at=is.null&select=id,name,status,card_summary,description,cover_asset_version_id,metadata,genre,updated_at,archived_at&order=updated_at.desc`,
    );

    if (!universes.length) return ok({ universes: [], requestId });

    const ids = universes.map((row) => row.id).filter(Boolean);
    const universeFilter = `universe_id=in.(${ids.map(encodeURIComponent).join(",")})`;

    // 并发拉取计数所需三张子表 —— 不发生按 Universe 的 N+1
    const [entities, inbox, links] = await Promise.all([
      serviceFetch<EntityRow[]>(`/rest/v1/storyflow_universe_entities?${universeFilter}&select=universe_id,type`),
      serviceFetch<InboxRow[]>(`/rest/v1/storyflow_universe_inbox_items?${universeFilter}&select=universe_id,status`),
      serviceFetch<LinkRow[]>(`/rest/v1/storyflow_universe_project_links?${universeFilter}&select=universe_id,project_id`),
    ]);

    type Counter = { workIds: Set<string>; characterCount: number; locationCount: number; pendingInboxCount: number };
    const counters = new Map<string, Counter>();
    for (const id of ids) counters.set(id, { workIds: new Set(), characterCount: 0, locationCount: 0, pendingInboxCount: 0 });

    for (const row of entities) {
      const counter = counters.get(row.universe_id);
      if (!counter) continue;
      if (row.type === "character") counter.characterCount += 1;
      else if (row.type === "location") counter.locationCount += 1;
    }
    for (const row of inbox) {
      if (row.status !== "pending") continue;
      const counter = counters.get(row.universe_id);
      if (counter) counter.pendingInboxCount += 1;
    }
    for (const row of links) {
      const counter = counters.get(row.universe_id);
      if (counter && row.project_id) counter.workIds.add(row.project_id);
    }

    // PRD §9.1 / §13.2：列表 DTO 不返回完整 description；cardSummary 优先 card_summary 列，
    // 空则 fallback 到清理 Markdown 后的 description（中文 60 字 / 英文 160 字上限）。
    const items: UniverseListItem[] = universes.map((row) => {
      const counter = counters.get(row.id);
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        cardSummary: buildCardSummary(row.card_summary, row.description),
        // cover_asset_version_id 解析需要查 asset_versions 表，本期返回 null，后续阶段补
        coverUrl: null,
        tags: buildTags(row.metadata, row.genre),
        workCount: counter?.workIds.size ?? 0,
        characterCount: counter?.characterCount ?? 0,
        locationCount: counter?.locationCount ?? 0,
        pendingInboxCount: counter?.pendingInboxCount ?? 0,
        updatedAt: row.updated_at,
      };
    });

    return ok({ universes: items, requestId });
  } catch (error) {
    return await errorWithRequestId(error, "读取宇宙汇总失败。", requestId);
  }
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

function buildTags(metadata: Record<string, unknown> | null, genre: string | null): string[] {
  const rawTags = metadata && Array.isArray(metadata.tags) ? metadata.tags : [];
  const tags = rawTags.map((tag) => String(tag).trim()).filter(Boolean);
  if (!tags.length && genre) tags.push(genre);
  return tags.slice(0, 5);
}

async function errorWithRequestId(error: unknown, fallback: string, requestId: string) {
  const errRes = apiError(error, fallback);
  const body = await errRes.json().catch(() => ({ success: false, error: fallback }));
  return NextResponse.json({ ...body, requestId }, { status: errRes.status });
}
