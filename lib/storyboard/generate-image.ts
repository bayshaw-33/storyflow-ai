/**
 * Storyboard shot image generation — injectable orchestration.
 *
 * Task card: KIIKIS-P1-KIMI-002 §4
 *
 * Extracted from app/api/storyboard/shots/[shotId]/generate-image/route.ts so
 * that node:test can import the pipeline directly (Next route modules may
 * only export HTTP verbs/config). The route wires real implementations;
 * tests wire fakes.
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping): no enums, no namespaces,
 * no parameter properties.
 */

import type { ServiceFetchFn } from "../compliance/log-writer.ts";
import type { PersistedStoryboardShot } from "./contracts.ts";
import { StoryboardError } from "./analyze/types.ts";
import {
  buildShotPromptItem,
  type ApprovedVersionInfo,
} from "./prompts/index.ts";
import type { NewAssetVersion } from "./assets/store.ts";
import type { ArtCandidateCount, ArtProviderSelection } from "../art/types.ts";
import type { ArtImageProviderResult } from "../art/providers/types.ts";

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

export type ShotImageBody = {
  idempotencyKey: string;
  count: ArtCandidateCount;
  selection: ArtProviderSelection;
};

export type ShotImageBodyValidation =
  | { ok: true; value: ShotImageBody }
  | { ok: false; status: 422; code: "INVALID_JSON" | "MISSING_FIELD"; error: string; details?: { fields: string[] } };

export function parseShotImageJsonBody(raw: string): { ok: true; value: unknown } | { ok: false; status: 422; code: "INVALID_JSON"; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, status: 422, code: "INVALID_JSON", error: "请求体不是合法的 JSON。" };
  }
}

export function validateShotImageBody(body: unknown): ShotImageBodyValidation {
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

export type ShotImageContext = {
  shot: PersistedStoryboardShot;
  productionProjectId: string;
  projectId: string;
  aspectRatio: string;
  visualStyle: string;
};

export type ShotImageResultImage = {
  versionId: string;
  previewUrl: string;
  provider: string;
  model: string;
};

export type ShotImageGenerationResult = {
  jobId: string;
  reused: boolean;
  status: string;
  images: ShotImageResultImage[];
  inputHash: string;
  referenceVersionIds: string[];
  imageVersionPersisted: boolean;
};

export type ShotImageDeps = {
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
export function isPgrst204Error(error: unknown): boolean {
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

export async function runShotImageGeneration(
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
