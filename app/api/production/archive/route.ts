/**
 * POST /api/production/archive — 草稿归档为正式项目（PRD §8.2 TRAE-PW-P0-004）
 *
 * 支持 4 种绑定模式：
 *   A. 绑定已有 Universe + 已有 Project + 当前 Episode
 *   B. 绑定已有 Universe + 创建新 Project + 创建 Episode 1
 *   C. 创建新 Universe + 创建新 Project + 创建 Episode 1
 *   D. 暂不归属 Universe + 创建新 Project + 创建 Episode 1
 *
 * 写入顺序：storyflow_projects → storyflow_universe_project_links（FK 依赖）
 * link 写失败时归档返回失败，禁止用 catch 兜底吞掉错误。
 * 相同 owner + project 已有关联时复用，不创建重复 Universe/Project。
 * 归档成功后客户端用返回的 projectId + sourceUnitId 原地 replace URL。
 */

import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ArchiveBody = {
  title?: string;
  workflowType?: "creation" | "continuation";
  universeMode: "existing" | "create" | "none";
  universeId?: string;
  universeName?: string;
  projectMode: "existing" | "create";
  existingProjectId?: string;
  episodeLabel?: string;
};

type ProjectRow = { id: string; owner_id: string | null; user_id: string | null; title: string | null };
type UniverseRow = { id: string; user_id: string | null };
type LinkRow = { id: string; universe_id: string; project_id: string };

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({})) as ArchiveBody;
    const title = String(body.title || "").trim() || "未命名项目";
    const workflowType = body.workflowType === "continuation" ? "continuation" : "creation";
    const universeMode: ArchiveBody["universeMode"] =
      body.universeMode === "create" || body.universeMode === "existing" ? body.universeMode : "none";
    const projectMode: ArchiveBody["projectMode"] = body.projectMode === "existing" ? "existing" : "create";
    const episodeLabel = String(body.episodeLabel || "").trim() || "Episode 1";
    const episodeNumber = parseEpisodeNumber(episodeLabel);

    // --- 1. Project：existing 复用 / create 新建 ---
    let projectId = "";
    let reusedProject = false;
    if (projectMode === "existing") {
      const existingId = String(body.existingProjectId || "").trim();
      if (!existingId) throw new Error("PROJECT_NOT_FOUND");
      // PRD §8.2：选择已有 Project 时不得再次创建重复 Project；校验归属
      const rows = await serviceFetch<ProjectRow[]>(
        `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(existingId)}&select=id,owner_id,user_id,title&limit=1`,
      );
      if (!rows.length) throw new Error("PROJECT_NOT_FOUND");
      const row = rows[0];
      const ownerId = row.owner_id || row.user_id;
      if (ownerId !== user.id) throw new Error("PROJECT_FORBIDDEN");
      projectId = row.id;
      reusedProject = true;
    } else {
      projectId = crypto.randomUUID();
      const now = new Date().toISOString();
      // PRD §8.2 模式 D：暂不归属时在 project metadata 明确 universe_link_state: unassigned
      const projectData: Record<string, unknown> = { title, workflowType, archivedFrom: "production_draft" };
      if (universeMode === "none") projectData.universe_link_state = "unassigned";
      await serviceFetch("/rest/v1/storyflow_projects", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          id: projectId,
          owner_id: user.id,
          user_id: user.id,
          title,
          workflow_type: workflowType,
          mode: workflowType,
          status: "active",
          project_group: "default",
          current_phase: "production",
          created_at: now,
          updated_at: now,
          data: projectData,
        }),
      });
    }

    const sourceUnitId = `ep-${projectId}-${episodeNumber}`;

    // --- 2. Universe 绑定 ---
    let universeId: string | null = null;
    let reusedLink = false;
    let linkId: string | null = null;

    if (universeMode === "existing") {
      const reqUniverseId = String(body.universeId || "").trim();
      if (!reqUniverseId) throw new Error("UNIVERSE_NOT_FOUND");
      const uniRows = await serviceFetch<UniverseRow[]>(
        `/rest/v1/storyflow_universes?id=eq.${encodeURIComponent(reqUniverseId)}&select=id,user_id&limit=1`,
      );
      if (!uniRows.length) throw new Error("UNIVERSE_NOT_FOUND");
      if (uniRows[0].user_id !== user.id) throw new Error("UNIVERSE_FORBIDDEN");
      universeId = uniRows[0].id;
    } else if (universeMode === "create") {
      universeId = crypto.randomUUID();
      const now = new Date().toISOString();
      const universeName = String(body.universeName || "").trim() || `${title} Universe`;
      await serviceFetch("/rest/v1/storyflow_universes", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          id: universeId,
          user_id: user.id,
          team_id: null,
          name: universeName,
          description: "",
          genre: "",
          default_language: "中文",
          target_markets: [],
          tone: "",
          status: "active",
          access_level: "studio_annual",
          metadata: { source: "production_archive", sharing: "private" },
          created_at: now,
          updated_at: now,
        }),
      });
    }

    // --- 3. Link（universeMode !== "none" 时写入，复用已有 link 不重复创建）---
    if (universeId) {
      // PRD §8.2：相同 owner + project 已有关联时复用，不创建重复 Universe
      const existingLinks = await serviceFetch<LinkRow[]>(
        `/rest/v1/storyflow_universe_project_links?project_id=eq.${encodeURIComponent(projectId)}&select=id,universe_id,project_id&order=updated_at.desc&limit=1`,
      );
      if (existingLinks.length && existingLinks[0].universe_id === universeId) {
        linkId = existingLinks[0].id;
        reusedLink = true;
      } else {
        linkId = `universe-project-link-${stableIdSegment(universeId)}-${stableIdSegment(projectId)}`;
        const now = new Date().toISOString();
        // PRD §8.2：link 写失败时归档返回失败，禁止用 catch 兜底吞掉错误
        await serviceFetch("/rest/v1/storyflow_universe_project_links", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({
            id: linkId,
            universe_id: universeId,
            project_id: projectId,
            user_id: user.id,
            project_role: "main_season",
            season_number: 1,
            inheritance_settings: { characters: true, locations: true, props: true, canon: true },
            created_at: now,
            updated_at: now,
          }),
        });
      }
    }

    return ok({
      projectId,
      sourceUnitId,
      universeId,
      linkId,
      episodeLabel,
      reused: { project: reusedProject, link: reusedLink },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PROJECT_NOT_FOUND") return apiError(error, "没有找到对应项目。", 404);
    if (message === "PROJECT_FORBIDDEN") return apiError(error, "无权访问该项目。", 403);
    if (message === "UNIVERSE_NOT_FOUND") return apiError(error, "没有找到对应宇宙。", 404);
    if (message === "UNIVERSE_FORBIDDEN") return apiError(error, "无权访问该宇宙。", 403);
    return apiError(error, "归档失败，请稍后重试。", 502);
  }
}

function parseEpisodeNumber(label: string): number {
  const match = label.match(/\d+/);
  const n = match ? parseInt(match[0], 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function stableIdSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(-12);
}
