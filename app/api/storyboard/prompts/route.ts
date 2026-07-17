/**
 * POST /api/storyboard/prompts — deterministic per-shot prompt building.
 *
 * Task card: KIIKIS-P1-KIMI-002 §3
 *
 * Always HTTP 200 for well-formed requests: per-shot isolation means a
 * missing shot yields a {shotId, error, code:"SHOT_NOT_FOUND"} ITEM while
 * the other shots succeed.
 */

import { NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { ok } from "@/lib/api/responses";
import type { PersistedStoryboardShot } from "@/lib/storyboard/contracts";
import {
  parsePromptJsonBody,
  runPromptBuild,
  validatePromptRequest,
  type LoadedPromptShots,
  type LoadPromptShotsScope,
} from "@/lib/storyboard/prompts";
import { loadApprovedVersions } from "@/lib/storyboard/assets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string, details?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, code, ...(details ? { details } : {}) }, { status });
}

type ProductionProjectRow = {
  id: string;
  aspect_ratio: string;
  visual_bible: Record<string, unknown>;
};

type ProductionShotRow = {
  id: string;
  index: number;
  scene_title: string;
  shot_type: string;
  duration: string;
  description: string;
  composition: string;
  camera_movement: string;
  image_prompt: string;
  video_prompt: string;
  dialogue: string | null;
  continuity: string | null;
  character_refs: unknown;
  scene_refs: unknown;
};

function parseDurationSeconds(duration: unknown): number {
  if (typeof duration === "number" && Number.isFinite(duration)) return duration;
  if (typeof duration === "string") {
    const parsed = Number.parseFloat(duration.replace(/s$/i, "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return 4;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapRow(row: ProductionShotRow, productionProjectId: string): PersistedStoryboardShot {
  const sceneRefs = asStringArray(row.scene_refs);
  return {
    id: row.id,
    clientId: row.id,
    idSource: "server",
    sceneId: `${productionProjectId}#${row.scene_title || "未分场"}`,
    order: row.index,
    sourceText: row.description,
    storyBeat: "",
    visualDescription: row.description,
    characterAssetIds: asStringArray(row.character_refs),
    sceneAssetId: sceneRefs[0] ?? null,
    propAssetIds: sceneRefs.slice(1),
    shotSize: row.composition || "中景",
    cameraMovement: row.camera_movement || "固定",
    angle: "平视",
    durationSeconds: parseDurationSeconds(row.duration),
    dialogue: row.dialogue ?? "",
    emotion: "",
    continuity: row.continuity ?? "",
    imagePrompt: row.image_prompt ?? "",
    jimengPromptZh: row.video_prompt ?? "",
    locked: false,
    userEdited: false,
    confirmed: false,
    revision: 1,
    analysisVersion: 1,
    sourceHash: "",
  };
}

/** Load persisted shots (owner-scoped) + project visual style / aspect ratio. */
async function loadShots(scope: LoadPromptShotsScope): Promise<LoadedPromptShots> {
  const projects = await serviceFetch<ProductionProjectRow[]>(
    `/rest/v1/storyflow_production_projects?project_id=eq.${encodeURIComponent(scope.projectId)}&owner_id=eq.${encodeURIComponent(scope.ownerId)}&select=id,aspect_ratio,visual_bible&limit=1`,
  );
  const project = projects[0];
  if (!project) return { shots: [], visualStyle: "", aspectRatio: "9:16" };

  const inList = scope.shotIds.map(encodeURIComponent).join(",");
  const rows = await serviceFetch<ProductionShotRow[]>(
    `/rest/v1/storyflow_production_shots?id=in.(${inList})&production_project_id=eq.${encodeURIComponent(project.id)}&owner_id=eq.${encodeURIComponent(scope.ownerId)}&select=*&order=index.asc`,
  );

  const visualBible = (project.visual_bible ?? {}) as Record<string, unknown>;
  return {
    shots: (rows ?? []).map((row) => mapRow(row, project.id)),
    visualStyle: typeof visualBible.visualStyle === "string" ? visualBible.visualStyle : "",
    aspectRatio: project.aspect_ratio || "9:16",
  };
}

export async function POST(request: Request) {
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录。");
  }

  if (!hasServiceRoleConfig()) {
    return errorResponse(500, "MISSING_SUPABASE_SERVICE_ROLE_KEY", "服务端缺少 Supabase Service Role 配置。");
  }

  const parsedBody = parsePromptJsonBody(await request.text());
  if (!parsedBody.ok) {
    return errorResponse(parsedBody.status, parsedBody.code, parsedBody.error);
  }
  const validated = validatePromptRequest(parsedBody.value);
  if (!validated.ok) {
    return errorResponse(validated.status, validated.code, validated.error, validated.details);
  }

  try {
    const result = await runPromptBuild(
      {
        loadShots,
        loadApprovedVersions: (assetIds) => loadApprovedVersions(serviceFetch, assetIds),
      },
      validated.value,
      { ownerId: userId },
    );
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(500, "PROMPT_BUILD_FAILED", message);
  }
}
