/**
 * POST /api/storyboard/shots/[shotId]/generate-image — reference-version
 * image generation for one storyboard shot.
 *
 * Task card: KIIKIS-P1-KIMI-002 §4
 *
 * Flow: auth → validate → load shot (owner-scoped, 404 SHOT_NOT_FOUND) →
 * approved versions → signed reference URLs → prompt + inputHash (language
 * "zh") → idempotency check on storyflow_generation_jobs → insert running
 * job → generateArtImages → persist images → insert asset versions →
 * complete job → write shot image version (PGRST204 fallback) → result.
 *
 * The injectable pipeline lives in @/lib/storyboard/generate-image (node:test
 * imports it from there); this route only wires real implementations.
 * Credits are intentionally NOT touched (internal Alpha).
 */

import {
  authenticateRequest,
  hasServiceRoleConfig,
  serviceFetch,
} from "@/lib/supabase/server";
import type { PersistedStoryboardShot } from "@/lib/storyboard/contracts";
import { isStoryboardError } from "@/lib/storyboard/analyze/types";
import {
  ensureStoryboardArtProject,
  insertAssetVersions,
  loadApprovedVersions,
  upsertStoryboardAsset,
} from "@/lib/storyboard/assets/store";
import {
  parseShotImageJsonBody,
  runShotImageGeneration,
  validateShotImageBody,
  type ShotImageContext,
} from "@/lib/storyboard/generate-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Local response helpers
// ---------------------------------------------------------------------------

function jsonOk(payload: Record<string, unknown>): Response {
  return Response.json({ success: true, ...payload });
}

function jsonError(status: number, code: string, error: string, details?: Record<string, unknown>): Response {
  return Response.json(
    { success: false, error, code, ...(details ? { details } : {}) },
    { status },
  );
}

// ---------------------------------------------------------------------------
// Real loaders (production backend tables)
// ---------------------------------------------------------------------------

type ProductionShotRow = {
  id: string;
  production_project_id: string;
  index: number;
  scene_title: string;
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

function mapShotRow(row: ProductionShotRow): PersistedStoryboardShot {
  const sceneRefs = asStringArray(row.scene_refs);
  return {
    id: row.id,
    clientId: row.id,
    idSource: "server",
    sceneId: `${row.production_project_id}#${row.scene_title || "未分场"}`,
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

async function loadShotContextReal(input: { ownerId: string; shotId: string }): Promise<ShotImageContext | null> {
  const shots = await serviceFetch<ProductionShotRow[]>(
    `/rest/v1/storyflow_production_shots?id=eq.${encodeURIComponent(input.shotId)}&owner_id=eq.${encodeURIComponent(input.ownerId)}&select=*&limit=1`,
  );
  const row = shots[0];
  if (!row) return null;

  const projects = await serviceFetch<
    Array<{ id: string; project_id: string | null; aspect_ratio: string; visual_bible: Record<string, unknown> }>
  >(
    `/rest/v1/storyflow_production_projects?id=eq.${encodeURIComponent(row.production_project_id)}&owner_id=eq.${encodeURIComponent(input.ownerId)}&select=id,project_id,aspect_ratio,visual_bible&limit=1`,
  );
  const project = projects[0];
  if (!project) return null;

  const visualBible = (project.visual_bible ?? {}) as Record<string, unknown>;
  return {
    shot: mapShotRow(row),
    productionProjectId: project.id,
    projectId: project.project_id ?? project.id,
    aspectRatio: project.aspect_ratio || "9:16",
    visualStyle: typeof visualBible.visualStyle === "string" ? visualBible.visualStyle : "",
  };
}

/** Sign fresh 7-day URLs for approved-version storage paths (the sign
 * helper in lib/supabase/art-storage.ts is not exported, so we mirror its
 * request shape here). */
async function signReferenceUrlsReal(storagePaths: string[]): Promise<string[]> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");
  const urls: string[] = [];
  for (const path of storagePaths) {
    const signed = await fetch(`${supabaseUrl}/storage/v1/object/sign/art-assets/${path}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }),
    });
    if (!signed.ok) throw new Error(`ART_STORAGE_SIGN_ERROR:${signed.status}`);
    const payload = (await signed.json()) as { signedURL?: string; signedUrl?: string };
    const signedPath = payload.signedURL || payload.signedUrl;
    if (!signedPath) throw new Error("ART_STORAGE_SIGN_EMPTY");
    urls.push(signedPath.startsWith("http") ? signedPath : `${supabaseUrl}/storage/v1${signedPath}`);
  }
  return urls;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ shotId: string }> },
) {
  const { shotId } = await context.params;
  if (!shotId) return jsonError(422, "MISSING_FIELD", "缺少 shotId。", { fields: ["shotId"] });

  let user: { id: string; email: string; token: string };
  try {
    user = await authenticateRequest(request);
  } catch {
    return jsonError(401, "UNAUTHENTICATED", "请先登录。");
  }

  if (!hasServiceRoleConfig()) {
    return jsonError(500, "MISSING_SUPABASE_SERVICE_ROLE_KEY", "服务端缺少 Supabase Service Role 配置。");
  }

  const parsedBody = parseShotImageJsonBody(await request.text());
  if (!parsedBody.ok) return jsonError(parsedBody.status, parsedBody.code, parsedBody.error);
  const validated = validateShotImageBody(parsedBody.value);
  if (!validated.ok) {
    return jsonError(validated.status, validated.code, validated.error, validated.details);
  }

  let shotContext: ShotImageContext | null;
  try {
    shotContext = await loadShotContextReal({ ownerId: user.id, shotId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(500, "SHOT_LOAD_FAILED", message);
  }
  if (!shotContext) {
    return jsonError(404, "SHOT_NOT_FOUND", `分镜不存在: ${shotId}`, { shotId });
  }

  try {
    const { generateArtImages } = await import("@/lib/art/providers");
    const { isAtlasAuthorizedUser } = await import("@/lib/art/providers/router");
    const { persistRemoteArtImage } = await import("@/lib/supabase/art-storage");
    const atlasAuthorized = isAtlasAuthorizedUser(user);

    const result = await runShotImageGeneration(
      {
        fetchFn: serviceFetch,
        loadShotContext: () => Promise.resolve(shotContext),
        loadApprovedVersions: (assetIds) => loadApprovedVersions(serviceFetch, assetIds),
        signReferenceUrls: signReferenceUrlsReal,
        generateImages: (input) =>
          generateArtImages(
            {
              task: "concept",
              prompt: input.prompt,
              negativePrompt: input.negativePrompt,
              referenceUrls: input.referenceUrls,
              aspectRatio: (input.aspectRatio === "1:1" || input.aspectRatio === "9:16"
                ? input.aspectRatio
                : "16:9") as "1:1" | "9:16" | "16:9",
              count: input.count,
              selection: input.selection,
            },
            { atlasAuthorized },
          ),
        persistImage: ({ remoteUrl, providerTaskId, index }) =>
          persistRemoteArtImage({
            userId: user.id,
            projectId: shotContext.projectId,
            assetId: shotId,
            remoteUrl,
            providerTaskId,
            index,
          }),
        ensureVersionAnchor: async () => {
          const artProjectId = await ensureStoryboardArtProject(serviceFetch, {
            ownerId: user.id,
            sourceProjectId: shotContext.projectId,
          });
          // The art schema has no shot-image table; shot frame versions hang
          // off a per-shot "scene"-kind anchor asset (documented in
          // docs/storyboard-ai-api.md).
          return upsertStoryboardAsset(serviceFetch, {
            ownerId: user.id,
            artProjectId,
            kind: "location",
            name: `shot-frame ${shotId}`,
            description: `分镜 ${shotId} 的生成图版本锚点`,
            prompt: "",
          });
        },
        insertVersions: ({ variantId, versions }) =>
          insertAssetVersions(serviceFetch, { variantId, createdBy: user.id, versions }),
        updateShotImage: async (patch) => {
          await serviceFetch(
            `/rest/v1/storyflow_production_shots?id=eq.${encodeURIComponent(shotId)}&production_project_id=eq.${encodeURIComponent(shotContext.productionProjectId)}&owner_id=eq.${encodeURIComponent(user.id)}`,
            { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) },
          );
        },
      },
      { ownerId: user.id, shotId, ...validated.value },
    );
    return jsonOk(result as unknown as Record<string, unknown>);
  } catch (error) {
    if (isStoryboardError(error)) {
      const status = error.code === "SHOT_NOT_FOUND" ? 404 : error.code === "IMAGE_GENERATION_FAILED" ? 500 : 500;
      return jsonError(status, error.code, error.message, error.details);
    }
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(500, "IMAGE_GENERATION_FAILED", message);
  }
}
