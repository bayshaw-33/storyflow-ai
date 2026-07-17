/**
 * Storyboard prompts API — deterministic prompt building for shots.
 *
 * Task card: KIIKIS-P1-KIMI-002 §3
 *
 * Guarantees:
 *   - SINGLE-SOURCE character appearance: the approved version's appearance
 *     summary when present, otherwise the asset description — never both
 *     concatenated (loadApprovedVersions resolves this upstream; this module
 *     only consumes `appearanceSummary`).
 *   - inputHash MUST change when any selectedVersionId changes: the hash
 *     payload includes the sorted referenceVersionIds.
 *   - Per-shot isolation: one failing shot yields a failure ITEM
 *     ({shotId, error, code}); the overall response is still HTTP 200.
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping).
 */

import type { PersistedStoryboardShot, StoryboardPromptResult } from "../contracts.ts";
import { StoryboardError } from "../analyze/types.ts";
import {
  PROMPT_TEMPLATE_VERSION,
  SHARED_NEGATIVE_PROMPT,
  buildJimengVideoPrompt,
  buildShotImagePrompt,
  computePromptInputHash,
  type PromptCharacterInput,
} from "./templates.ts";

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

export type ValidatedPromptRequest = {
  projectId: string;
  sourceUnitId: string;
  analysisVersion: number;
  shotIds: string[];
  language: "zh" | "en";
  expectedRevision: number;
  idempotencyKey: string;
};

const MAX_SHOT_IDS = 200;

export type PromptValidationFailure = {
  ok: false;
  status: 422;
  code: "INVALID_JSON" | "MISSING_FIELD";
  error: string;
  details?: { fields: string[] };
};

export type PromptValidationResult =
  | { ok: true; value: ValidatedPromptRequest }
  | PromptValidationFailure;

export function parsePromptJsonBody(raw: string): { ok: true; value: unknown } | PromptValidationFailure {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, status: 422, code: "INVALID_JSON", error: "请求体不是合法的 JSON。" };
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validatePromptRequest(body: unknown): PromptValidationResult {
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

  if (!isNonEmptyString(input.projectId)) fields.push("projectId");
  if (!isNonEmptyString(input.sourceUnitId)) fields.push("sourceUnitId");

  const analysisVersion = input.analysisVersion;
  if (typeof analysisVersion !== "number" || !Number.isInteger(analysisVersion) || analysisVersion < 1) {
    fields.push("analysisVersion");
  }

  const shotIds = input.shotIds;
  if (!Array.isArray(shotIds) || shotIds.length === 0) {
    fields.push("shotIds");
  } else if (shotIds.length > MAX_SHOT_IDS) {
    fields.push("shotIds(too many)");
  } else if (shotIds.some((id) => !isNonEmptyString(id))) {
    fields.push("shotIds(items)");
  }

  const language = input.language === undefined ? "zh" : input.language;
  if (language !== "zh" && language !== "en") fields.push("language");

  const expectedRevision = input.expectedRevision;
  if (typeof expectedRevision !== "number" || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
    fields.push("expectedRevision");
  }

  if (!isNonEmptyString(input.idempotencyKey)) fields.push("idempotencyKey");

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
      projectId: (input.projectId as string).trim(),
      sourceUnitId: (input.sourceUnitId as string).trim(),
      analysisVersion: analysisVersion as number,
      shotIds: (shotIds as string[]).map((id) => id.trim()),
      language: language as "zh" | "en",
      expectedRevision: expectedRevision as number,
      idempotencyKey: (input.idempotencyKey as string).trim(),
    },
  };
}

// ---------------------------------------------------------------------------
// Injectable boundaries
// ---------------------------------------------------------------------------

/** Approved-version view of an asset. `appearanceSummary` is SINGLE-SOURCE:
 * the approved version's appearance summary when a version is selected,
 * otherwise the asset description. `versionId` is null when no version has
 * been approved (the asset then contributes nothing to referenceVersionIds). */
export type ApprovedVersionInfo = {
  assetId: string;
  name: string;
  description: string;
  versionId: string | null;
  storagePath: string | null;
  previewUrl: string | null;
  appearanceSummary: string;
};

export type LoadedPromptShots = {
  shots: PersistedStoryboardShot[];
  visualStyle: string;
  aspectRatio: string;
};

export type LoadPromptShotsScope = {
  ownerId: string;
  projectId: string;
  sourceUnitId: string;
  shotIds: string[];
};

export type LoadPromptShots = (scope: LoadPromptShotsScope) => Promise<LoadedPromptShots>;
export type LoadApprovedVersions = (assetIds: string[]) => Promise<Map<string, ApprovedVersionInfo>>;

export type PromptBuildDependencies = {
  loadShots: LoadPromptShots;
  loadApprovedVersions: LoadApprovedVersions;
};

export type PromptFailureItem = {
  shotId: string;
  error: string;
  code: "PROMPT_BUILD_FAILED" | "SHOT_NOT_FOUND";
};

export type PromptItem = StoryboardPromptResult | PromptFailureItem;

export type PromptBuildResult = {
  revision: number;
  prompts: PromptItem[];
};

// ---------------------------------------------------------------------------
// Prompt building (pure part — reused by the generate-image route)
// ---------------------------------------------------------------------------

function toCharacterInput(info: ApprovedVersionInfo | undefined, fallbackId: string): PromptCharacterInput {
  if (!info) return { name: fallbackId, appearance: "" };
  return { name: info.name, appearance: info.appearanceSummary };
}

function collectAssetIds(shot: PersistedStoryboardShot): string[] {
  const ids = [...shot.characterAssetIds, ...shot.propAssetIds];
  if (shot.sceneAssetId) ids.push(shot.sceneAssetId);
  return [...new Set(ids)];
}

export function collectReferenceVersionIds(
  shot: PersistedStoryboardShot,
  approvedByAssetId: ReadonlyMap<string, ApprovedVersionInfo>,
): string[] {
  const ids: string[] = [];
  for (const assetId of collectAssetIds(shot)) {
    const info = approvedByAssetId.get(assetId);
    if (info?.versionId) ids.push(info.versionId);
  }
  return ids;
}

/**
 * Build the prompts for ONE persisted shot. Throws on internal errors;
 * callers wrap per-shot for isolation.
 */
export function buildShotPromptItem(input: {
  shotId: string;
  shot: PersistedStoryboardShot;
  approvedByAssetId: ReadonlyMap<string, ApprovedVersionInfo>;
  visualStyle: string;
  aspectRatio: string;
  language: "zh" | "en";
}): StoryboardPromptResult {
  const { shot } = input;
  const characters = shot.characterAssetIds.map((assetId) =>
    toCharacterInput(input.approvedByAssetId.get(assetId), assetId),
  );
  const location = shot.sceneAssetId
    ? toCharacterInput(input.approvedByAssetId.get(shot.sceneAssetId), shot.sceneAssetId)
    : null;
  const props = shot.propAssetIds.map((assetId) =>
    toCharacterInput(input.approvedByAssetId.get(assetId), assetId),
  );

  const referenceVersionIds = collectReferenceVersionIds(shot, input.approvedByAssetId);

  const imagePrompt = buildShotImagePrompt({
    visualStyle: input.visualStyle,
    shotSize: shot.shotSize,
    angle: shot.angle,
    cameraMovement: shot.cameraMovement,
    visualDescription: shot.visualDescription,
    characters,
    location,
    props,
    aspectRatio: input.aspectRatio,
    continuity: shot.continuity,
  });

  const jimengVideoPrompt = buildJimengVideoPrompt(
    {
      characters,
      storyBeat: shot.storyBeat,
      visualDescription: shot.visualDescription,
      emotion: shot.emotion,
      location,
      shotSize: shot.shotSize,
      angle: shot.angle,
      cameraMovement: shot.cameraMovement,
      visualStyle: input.visualStyle,
      durationSeconds: shot.durationSeconds,
      aspectRatio: input.aspectRatio,
      continuity: shot.continuity,
      dialogue: shot.dialogue,
    },
    input.language,
  );

  const inputHash = computePromptInputHash({
    shotId: input.shotId,
    visualDescription: shot.visualDescription,
    dialogue: shot.dialogue,
    continuity: shot.continuity,
    shotSize: shot.shotSize,
    cameraMovement: shot.cameraMovement,
    angle: shot.angle,
    durationSeconds: shot.durationSeconds,
    referenceVersionIds,
    visualStyle: input.visualStyle,
    aspectRatio: input.aspectRatio,
    language: input.language,
    templateVersion: PROMPT_TEMPLATE_VERSION,
  });

  return {
    shotId: input.shotId,
    imagePrompt,
    jimengVideoPrompt,
    negativePrompt: SHARED_NEGATIVE_PROMPT,
    referenceVersionIds,
    inputHash,
  };
}

/**
 * Build prompts for the requested shots. Per-shot isolation: a missing shot
 * yields {code:"SHOT_NOT_FOUND"}, a build error yields
 * {code:"PROMPT_BUILD_FAILED"} — the rest still succeed.
 */
export async function runPromptBuild(
  deps: PromptBuildDependencies,
  request: ValidatedPromptRequest,
  context: { ownerId: string },
): Promise<PromptBuildResult> {
  const loaded = await deps.loadShots({
    ownerId: context.ownerId,
    projectId: request.projectId,
    sourceUnitId: request.sourceUnitId,
    shotIds: request.shotIds,
  });

  const shotById = new Map<string, PersistedStoryboardShot>();
  for (const shot of loaded.shots) {
    shotById.set(shot.id, shot);
    if (shot.clientId) shotById.set(shot.clientId, shot);
  }

  const assetIds = [...new Set(loaded.shots.flatMap(collectAssetIds))];
  const approvedByAssetId = assetIds.length > 0 ? await deps.loadApprovedVersions(assetIds) : new Map<string, ApprovedVersionInfo>();

  const prompts: PromptItem[] = [];
  for (const shotId of request.shotIds) {
    const shot = shotById.get(shotId);
    if (!shot) {
      prompts.push({ shotId, error: `分镜不存在: ${shotId}`, code: "SHOT_NOT_FOUND" });
      continue;
    }
    try {
      prompts.push(
        buildShotPromptItem({
          shotId,
          shot,
          approvedByAssetId,
          visualStyle: loaded.visualStyle,
          aspectRatio: loaded.aspectRatio,
          language: request.language,
        }),
      );
    } catch (error) {
      prompts.push({
        shotId,
        error: error instanceof Error ? error.message : String(error),
        code: "PROMPT_BUILD_FAILED",
      });
    }
  }

  return { revision: request.expectedRevision + 1, prompts };
}

export function isPromptFailure(item: PromptItem): item is PromptFailureItem {
  return typeof (item as PromptFailureItem).code === "string";
}

export { StoryboardError };
