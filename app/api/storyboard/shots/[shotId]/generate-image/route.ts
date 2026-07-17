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
 * Testability note: this module is imported directly by node:test, so it
 * uses ONLY relative imports / native Response at module scope; Next-only
 * and alias-only modules (@/lib/art/*, @/lib/supabase/art-storage) are
 * loaded via dynamic import inside POST wiring. Credits are intentionally
 * NOT touched (internal Alpha).
 */

import type { ServiceFetchFn } from "../../../../../../lib/compliance/log-writer.ts";
import {
  authenticateRequest,
  hasServiceRoleConfig,
  serviceFetch,
} from "../../../../../../lib/supabase/server.ts";
import type { PersistedStoryboardShot } from "../../../../../../lib/storyboard/contracts.ts";
import {
  StoryboardError,
  isStoryboardError,
} from "../../../../../../lib/storyboard/analyze/types.ts";
import {
  buildShotPromptItem,
  type ApprovedVersionInfo,
} from "../../../../../../lib/storyboard/prompts/index.ts";
import {
  ensureStoryboardArtProject,
  insertAssetVersions,
  loadApprovedVersions,
  upsertStoryboardAsset,
  type NewAssetVersion,
} from "../../../../../../lib/storyboard/assets/store.ts";
import type { ArtCandidateCount, ArtProviderSelection } from "../../../../../../lib/art/types.ts";
import type { ArtImageProviderResult } from "../../../../../../lib/art/providers/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Local response helpers (native Response — keeps this file node-importable)
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
// Request validation
// ---------------------------------------------------------------------------

type ShotImageBody = {
  idempotencyKey: string;
  count: ArtCandidateCount;
  selection: ArtProviderSelection;
};

type ShotImageBodyValidation =
  | { ok: true; value: ShotImageBody }
  | { ok: false; status: 422; code: "INVALID_JSON" | "MISSING_FIELD"; error: string; details?: { fields: string[] } };

function parseShotImageJsonBody(raw: string): { ok: true; value: unknown } | { ok: false; status: 422; code: "INVALID_JSON"; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, status: 422, code: "INVALID_JSON", error: "请求体不是合法的 JSON。" };
  }
}

function validateShotImageBody(body: unknown): ShotImageBodyValidation {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 422,
      code: "MISSING_FIELD",
      error: "请求缺少或包含非法字段: body",
      details: { fields: ["body"] },
    };
  }
  const input = body as Record<string, unknown>;
  const fields: string[] = [];
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.trim().length === 0) {
    fields.push("idempotencyKey");
  }
  const count = input.count === undefined ? 4 : input.count;
  if (count !== 1 && count !== 2 && count !== 4) fields.push("count");
  const selection = input.selection === undefined ? "smart" : input.selection;
  if (selection !== "smart" && selection !== "atlas" && selection !== "flux") fields.push("selection");
  if (fields.length > 0) {
    return {
      ok: false,
      status: 422,
      code: "MISSING_FIELD",
      error: `请求缺少或包含非法字段: ${fields.join(", ")}`,
      details: { fields },
    };
  }
  return {
    ok: true,
    value: {
      idempotencyKey: (input.idempotencyKey as string).trim(),
      count: count as ArtCandidateCount,
      selection: selection as ArtProviderSelection,
    },
  };
}

// ---------------------------------------------------------------------------
// Orchestration (injectable — the test wires fakes)
// ---------------------------------------------------------------------------

type ShotImageContext = {
  shot: PersistedStoryboardShot;
  productionProjectId: string;
  projectId: string;
  aspectRatio: string;
  visualStyle: string;
};

type ShotImageResultImage = {
  versionId: string;
  previewUrl: string;
  provider: string;
  model: string;
};

type ShotImageGenerationResult = {
  jobId: string;
  reused: boolean;
  status: string;
  images: ShotImageResultImage[];
  inputHash: string;
  referenceVersionIds: string[];
  imageVersionPersisted: boolean;
};

type ShotImageDeps = {
  fetchFn: ServiceFetchFn;
  loadShotContext: (input: { ownerId: string; shotId: string }) => Promise<ShotImageContext | null>;
  loadApprovedVersions: (assetIds: string[]) => Promise<Map<string, ApprovedVersionInfo>>;
  signReferenceUrls: (storagePaths: string[]) => Promise<string[]>;
  generateImages: (input: {
    prompt: string;
    negativePrompt: string;
    referenceUrls: string[];
    aspectRatio: string;
    count: ArtCandidateCount;
    selection: ArtProviderSelection;
  }) => Promise<ArtImageProviderResult[]>;
  persistImage: (input: {
    remoteUrl: string;
    providerTaskId: string;
    index: number;
  }) => Promise<{ storagePath: string; previewUrl: string }>;
  ensureVersionAnchor: () => Promise<{ assetId: string; variantId: string }>;
  insertVersions: (input: {
    variantId: string;
    versions: NewAssetVersion[];
  }) => Promise<Array<{ versionId: string; storagePath: string }>>;
  updateShotImage: (patch: Record<string, unknown>) => Promise<void>;
};

/** PostgREST "column not found" — storyboard_image_version_id is pending
 * Codex's save-layer migration; we degrade gracefully without it. */
function isPgrst204Error(error: unknown): boolean {
  return error instanceof Error && error.message.includes("PGRST204");
}

type GenerationJobRow = {
  id: string;
  status: string;
  result_url: string | null;
  result_metadata: Record<string, unknown>;
  input_params: Record<string, unknown>;
};

function collectShotAssetIds(shot: PersistedStoryboardShot): string[] {
  const ids = [...shot.characterAssetIds, ...shot.propAssetIds];
  if (shot.sceneAssetId) ids.push(shot.sceneAssetId);
  return [...new Set(ids)];
}

async function runShotImageGeneration(
  deps: ShotImageDeps,
  input: { ownerId: string; shotId: string } & ShotImageBody,
): Promise<ShotImageGenerationResult> {
  const context = await deps.loadShotContext({ ownerId: input.ownerId, shotId: input.shotId });
  if (!context) {
    throw new StoryboardError("SHOT_NOT_FOUND", `分镜不存在: ${input.shotId}`, { shotId: input.shotId });
  }

  const assetIds = collectShotAssetIds(context.shot);
  const approvedByAssetId = assetIds.length > 0 ? await deps.loadApprovedVersions(assetIds) : new Map<string, ApprovedVersionInfo>();

  const item = buildShotPromptItem({
    shotId: input.shotId,
    shot: context.shot,
    approvedByAssetId,
    visualStyle: context.visualStyle,
    aspectRatio: context.aspectRatio,
    language: "zh",
  });

  const referencePaths = assetIds
    .map((assetId) => approvedByAssetId.get(assetId))
    .filter((info): info is ApprovedVersionInfo => Boolean(info?.versionId && info.storagePath))
    .map((info) => info.storagePath as string);
  const referenceUrls = referencePaths.length > 0 ? await deps.signReferenceUrls(referencePaths) : [];

  // --- Idempotency: same key + not failed → reuse the existing job -------
  const existingJobs = await deps.fetchFn<GenerationJobRow[]>(
    `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(input.ownerId)}&job_type=eq.image&input_params-%3E%3EidempotencyKey=eq.${encodeURIComponent(input.idempotencyKey)}&status=not.eq.failed&limit=1&select=id,status,result_url,result_metadata,input_params`,
  );
  const existing = existingJobs?.[0];
  if (existing) {
    const metadata = (existing.result_metadata ?? {}) as Record<string, unknown>;
    const params = (existing.input_params ?? {}) as Record<string, unknown>;
    return {
      jobId: existing.id,
      reused: true,
      status: existing.status,
      images: Array.isArray(metadata.images) ? (metadata.images as ShotImageResultImage[]) : [],
      inputHash: typeof params.inputHash === "string" ? params.inputHash : item.inputHash,
      referenceVersionIds: Array.isArray(params.referenceVersionIds)
        ? (params.referenceVersionIds as string[])
        : item.referenceVersionIds,
      imageVersionPersisted: true,
    };
  }

  // --- Claim the key by inserting the running job -------------------------
  const jobId = crypto.randomUUID();
  await deps.fetchFn("/rest/v1/storyflow_generation_jobs", {
    method: "POST",
    body: JSON.stringify({
      id: jobId,
      owner_id: input.ownerId,
      job_type: "image",
      provider: "pending",
      model: null,
      prompt: item.imagePrompt,
      input_params: {
        idempotencyKey: input.idempotencyKey,
        shotId: input.shotId,
        inputHash: item.inputHash,
        referenceVersionIds: item.referenceVersionIds,
        count: input.count,
        aspectRatio: context.aspectRatio,
      },
      status: "running",
      target_type: "storyboard_shot",
      target_id: input.shotId,
      project_id: context.projectId,
    }),
  });

  // --- Generate -----------------------------------------------------------
  let generated: ArtImageProviderResult[];
  try {
    generated = await deps.generateImages({
      prompt: item.imagePrompt,
      negativePrompt: item.negativePrompt,
      referenceUrls,
      aspectRatio: context.aspectRatio,
      count: input.count,
      selection: input.selection,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.fetchFn(
      `/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "failed", error: message, completed_at: new Date().toISOString() }),
      },
    );
    await deps.updateShotImage({ status: "error", error: message }).catch(() => undefined);
    throw new StoryboardError("IMAGE_GENERATION_FAILED", `图像生成失败: ${message}`);
  }

  // --- Persist images + asset versions ------------------------------------
  const anchor = await deps.ensureVersionAnchor();
  const persisted: Array<{ storagePath: string; previewUrl: string }> = [];
  for (let index = 0; index < generated.length; index += 1) {
    const image = generated[index];
    persisted.push(
      await deps.persistImage({
        remoteUrl: image.imageUrl,
        providerTaskId: image.providerTaskId,
        index,
      }),
    );
  }
  const versionRows = await deps.insertVersions({
    variantId: anchor.variantId,
    versions: persisted.map((stored, index) => ({
      storagePath: stored.storagePath,
      previewUrl: stored.previewUrl,
      provider: generated[index]?.provider,
      model: generated[index]?.model,
      providerTaskId: generated[index]?.providerTaskId,
      prompt: item.imagePrompt,
      negativePrompt: item.negativePrompt,
      appearanceSummary: context.shot.visualDescription,
    })),
  });

  const images: ShotImageResultImage[] = versionRows.map((row, index) => ({
    versionId: row.versionId,
    previewUrl: persisted[index]?.previewUrl ?? "",
    provider: generated[index]?.provider ?? "unknown",
    model: generated[index]?.model ?? "unknown",
  }));
  const firstPreview = images[0]?.previewUrl ?? "";
  const bestVersionId = images[0]?.versionId ?? null;
  const firstProvider = images[0]?.provider ?? "unknown";
  const firstModel = images[0]?.model ?? "unknown";

  await deps.fetchFn(
    `/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "completed",
        provider: firstProvider,
        model: firstModel,
        result_url: firstPreview,
        result_metadata: {
          images,
          inputHash: item.inputHash,
          referenceVersionIds: item.referenceVersionIds,
        },
        completed_at: new Date().toISOString(),
      }),
    },
  );

  // --- Write the shot image version (with PGRST204 fallback) --------------
  const basePatch: Record<string, unknown> = {
    status: "image_ready",
    image_url: firstPreview,
    image_provider: firstProvider,
  };
  let imageVersionPersisted = true;
  try {
    await deps.updateShotImage({ ...basePatch, storyboard_image_version_id: bestVersionId });
  } catch (error) {
    if (!isPgrst204Error(error)) throw error;
    // storyboard_image_version_id column is pending Codex's save-layer
    // migration — retry without it and report the degradation.
    await deps.updateShotImage(basePatch);
    imageVersionPersisted = false;
  }

  return {
    jobId,
    reused: false,
    status: "completed",
    images,
    inputHash: item.inputHash,
    referenceVersionIds: item.referenceVersionIds,
    imageVersionPersisted,
  };
}

// ---------------------------------------------------------------------------
// POST wiring (real implementations)
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
