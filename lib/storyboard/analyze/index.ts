/**
 * Storyboard analyze — orchestration (parse → assemble → normalize → merge).
 *
 * Task card: KIIKIS-P1-KIMI-002 §1
 *
 * Trust boundaries:
 *   - AI output is NEVER trusted: strict parse (parse.ts), server-assigned
 *     clientIds (p_scene_<order> / p_shot_<sceneOrder>_<shotOrder> /
 *     p_asset_<kind>_<n>), idSource "client"; model-provided ids are
 *     discarded before assembly.
 *   - Unresolved character/prop/location names AUTO-CREATE minimal asset
 *     entries so references never dangle.
 *   - Analyze is READ-ONLY / proposal-only: no database writes. The
 *     idempotencyKey is accepted for contract symmetry, but every call
 *     returns a FRESH analysisId; dedup happens at Codex's save layer.
 *
 * Duration normalization: when Σ shot durations deviates from
 * targetDurationSeconds by more than 20%, every duration is scaled
 * proportionally, rounded to 1 decimal, and clamped to [2, 10] seconds
 * (short-drama single-shot bounds).
 *
 * Compatibility: `runStoryboardAnalyze` / `parseStrictAnalyzeJson` are kept
 * for the TRAE-002 call sites; the canonical entry point is `runAnalyze`.
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping). This module is imported by
 * node:test directly — the default AI boundary is a LAZY dynamic import so
 * module scope stays node-importable.
 */

import { sha256Hex } from "../../compliance/manifest.ts";
import type {
  AnalyzeResponse,
  StoryboardAssetKind,
  StoryboardAssetUsage,
  StoryboardScene,
  StoryboardShot,
  PersistedStoryboardScene,
} from "../contracts.ts";
import {
  allocateAssetClientId,
  createMinimalAssetUsage,
  extractAssetUsages,
  findAssetByName,
  type StoryboardAssetUsageWithAliases,
} from "../assets/extract.ts";
import { buildAnalyzeSystemPrompt, buildAnalyzeUserPrompt } from "./prompt.ts";
import { parseAnalyzeOutput } from "./parse.ts";
import {
  findPersistedScene,
  mergeFullProposal,
  mergeSceneProposal,
} from "./merge.ts";
import {
  StoryboardError,
  type AiAnalyzeOutput,
  type AnalyzeContext,
  type AnalyzeDependencies,
  type CallStoryboardAI,
  type ExistingStoryboardState,
  type LoadExistingStoryboardState,
  type ValidatedAnalyzeRequest,
} from "./types.ts";

const DURATION_DEVIATION_TOLERANCE = 0.2;
const SHOT_MIN_SECONDS = 2;
const SHOT_MAX_SECONDS = 10;

export function computeSourceHash(source: string): string {
  return `sha256:${sha256Hex(new TextEncoder().encode(source))}`;
}

/** Proportional scaling to hit the target duration (see module docstring). */
export function normalizeDurations(
  scenes: StoryboardScene[],
  targetDurationSeconds: number,
): StoryboardScene[] {
  const all = scenes.flatMap((scene) => scene.shots);
  const sum = all.reduce((total, shot) => total + shot.durationSeconds, 0);
  if (sum <= 0 || targetDurationSeconds <= 0) return scenes;
  const deviation = Math.abs(sum - targetDurationSeconds) / targetDurationSeconds;
  if (deviation <= DURATION_DEVIATION_TOLERANCE) return scenes;

  const scale = targetDurationSeconds / sum;
  return scenes.map((scene) => ({
    ...scene,
    shots: scene.shots.map((shot) => {
      const scaled = Math.round(shot.durationSeconds * scale * 10) / 10;
      const clamped = Math.min(SHOT_MAX_SECONDS, Math.max(SHOT_MIN_SECONDS, scaled));
      return { ...shot, durationSeconds: clamped };
    }),
  }));
}

function resolveAssets(
  names: string[],
  kind: StoryboardAssetKind,
  assets: StoryboardAssetUsageWithAliases[],
): string[] {
  const ids: string[] = [];
  for (const name of names) {
    const found = findAssetByName(assets, kind, name);
    if (found) {
      if (!ids.includes(found.assetId)) ids.push(found.assetId);
      continue;
    }
    // Auto-create a minimal entry so the reference never dangles.
    const created = createMinimalAssetUsage(kind, name, assets);
    assets.push(created);
    ids.push(created.assetId);
  }
  return ids;
}

function resolveLocationAsset(
  locationName: string | null,
  assets: StoryboardAssetUsageWithAliases[],
): string | null {
  if (!locationName || locationName.trim().length === 0) return null;
  const found = findAssetByName(assets, "location", locationName);
  if (found) return found.assetId;
  const created = createMinimalAssetUsage("location", locationName, assets);
  assets.push(created);
  return created.assetId;
}

function assembleScenes(
  aiScenes: AiAnalyzeOutput["scenes"],
  assets: StoryboardAssetUsageWithAliases[],
  sourceHash: string,
  revision: number,
): StoryboardScene[] {
  return aiScenes.map((aiScene, sceneIndex) => {
    const sceneOrder = sceneIndex + 1;
    const sceneClientId = `p_scene_${sceneOrder}`;

    const sceneCharacterIds = resolveAssets(aiScene.characters, "character", assets);
    const scenePropIds = resolveAssets(aiScene.props, "prop", assets);

    const shots: StoryboardShot[] = aiScene.shots.map((aiShot, shotIndex) => {
      const shotOrder = shotIndex + 1;
      const characterAssetIds = resolveAssets(aiShot.characters, "character", assets);
      const propAssetIds = resolveAssets(aiShot.props, "prop", assets);
      const sceneAssetId = resolveLocationAsset(aiShot.location ?? aiScene.location, assets);

      return {
        clientId: `p_shot_${sceneOrder}_${shotOrder}`,
        idSource: "client" as const,
        sceneId: sceneClientId,
        order: shotOrder,
        sourceText: aiShot.sourceText,
        storyBeat: aiShot.storyBeat,
        visualDescription: aiShot.visualDescription,
        characterAssetIds,
        sceneAssetId,
        propAssetIds,
        shotSize: aiShot.shotSize,
        cameraMovement: aiShot.cameraMovement,
        angle: aiShot.angle,
        durationSeconds: aiShot.durationSeconds,
        dialogue: aiShot.dialogue,
        emotion: aiShot.emotion,
        continuity: aiShot.continuity,
        imagePrompt: "",
        jimengPromptZh: "",
        locked: false,
        userEdited: false,
        confirmed: false,
        revision,
        analysisVersion: 1,
        sourceHash,
      };
    });

    // Scene-level asset references union the shot-level ones.
    const characterAssetIds = [...new Set([...sceneCharacterIds, ...shots.flatMap((s) => s.characterAssetIds)])];
    const propAssetIds = [...new Set([...scenePropIds, ...shots.flatMap((s) => s.propAssetIds)])];

    return {
      clientId: sceneClientId,
      idSource: "client" as const,
      order: sceneOrder,
      heading: aiScene.heading,
      location: aiScene.location,
      timeOfDay: aiScene.timeOfDay,
      summary: aiScene.summary,
      sourceText: aiScene.sourceText,
      characterAssetIds,
      propAssetIds,
      shots,
      locked: false,
      userEdited: false,
      confirmed: false,
      revision,
      analysisVersion: 1,
      sourceHash,
    };
  });
}

function groupAssets(assets: StoryboardAssetUsageWithAliases[]): AnalyzeResponse["assets"] {
  return {
    characters: assets.filter((asset) => asset.kind === "character"),
    locations: assets.filter((asset) => asset.kind === "location"),
    props: assets.filter((asset) => asset.kind === "prop"),
  };
}

/**
 * Run the full analyze pipeline. Throws StoryboardError on any validation /
 * AI-output failure — callers must surface the error code, never a fake 200.
 */
export async function runAnalyze(
  deps: AnalyzeDependencies,
  request: ValidatedAnalyzeRequest,
  context: AnalyzeContext,
): Promise<AnalyzeResponse> {
  const sourceHash = computeSourceHash(request.source);
  const revision = request.expectedRevision + 1;

  const existing = await deps.loadExistingState({
    ownerId: context.ownerId,
    projectId: request.projectId,
    sourceUnitId: request.sourceUnitId,
  });

  let sceneSourceText: string | undefined;
  let targetScene: PersistedStoryboardScene | null = null;
  if (request.mode === "scene") {
    targetScene = findPersistedScene(existing.scenes, request.sceneId ?? "");
    if (!targetScene) {
      throw new StoryboardError("SCENE_NOT_FOUND", `未找到要重新分析的场景: ${request.sceneId}`, {
        sceneId: request.sceneId,
      });
    }
    sceneSourceText = targetScene.sourceText;
  }

  const systemPrompt = buildAnalyzeSystemPrompt(request);
  const userPrompt = buildAnalyzeUserPrompt(request, { sceneSourceText });
  const aiCallResult = await deps.callAI({ systemPrompt, userPrompt });
  // CallStoryboardAI 可返回纯 string（旧 mock）或 { output, provider }（新路由）
  const rawOutput = typeof aiCallResult === "string" ? aiCallResult : aiCallResult.output;
  const providerInfo = typeof aiCallResult === "string" ? undefined : aiCallResult.provider;

  const aiOutput = parseAnalyzeOutput(rawOutput);

  const assets = extractAssetUsages(aiOutput.assets);
  const proposalScenes = assembleScenes(aiOutput.scenes, assets, sourceHash, revision);
  const normalized = normalizeDurations(proposalScenes, request.targetDurationSeconds);

  const scenes =
    request.mode === "scene" && targetScene
      ? [mergeSceneProposal(targetScene, normalized)]
      : mergeFullProposal(existing.scenes, normalized);

  // Cheap insurance against future refactors: asset ids must stay unique
  // even after auto-creation.
  const seen = new Set<string>();
  for (const asset of assets) {
    if (seen.has(asset.assetId)) {
      asset.assetId = allocateAssetClientId(asset.kind, assets);
    }
    seen.add(asset.assetId);
  }

  return {
    analysisId: crypto.randomUUID(),
    analysisVersion: 1,
    sourceHash,
    revision,
    scenes,
    assets: groupAssets(assets),
    ...(providerInfo ? { provider: providerInfo } : {}),
  };
}

// ---------------------------------------------------------------------------
// TRAE-002 compatibility surface
// ---------------------------------------------------------------------------

/** Strict JSON parse kept under the TRAE-002 name; delegates to parse.ts. */
export function parseStrictAnalyzeJson(raw: string): AiAnalyzeOutput {
  return parseAnalyzeOutput(raw);
}

/** Default AI boundary: lazy dynamic import keeps this module node-importable. */
const defaultCallAI: CallStoryboardAI = async (scope) => {
  const { callRoutedProvider } = await import("../../ai/providers/index.ts");
  const result = await callRoutedProvider({
    taskType: "storyboard_script",
    messages: [
      { role: "system", content: scope.systemPrompt },
      { role: "user", content: scope.userPrompt },
    ],
    validateOutput: (output) => {
      parseAnalyzeOutput(output);
    },
  });
  const output = result.output;
  if (typeof output !== "string" || output.trim().length === 0) {
    throw new StoryboardError("AI_CALL_FAILED", "AI 返回为空，无法解析分镜。");
  }
  return {
    output,
    provider: {
      provider: result.provider,
      model: result.model,
      fallbackUsed: Boolean(result.fallbackUsed),
    },
  };
};

const defaultLoadExistingState: LoadExistingStoryboardState = async () => ({ scenes: [] });

/**
 * TRAE-002 call signature — compatibility wrapper over `runAnalyze`.
 * Prefer `runAnalyze(deps, request, context)` in new code.
 */
export async function runStoryboardAnalyze(
  request: ValidatedAnalyzeRequest,
  context: AnalyzeContext,
  dependencies?: Partial<AnalyzeDependencies>,
): Promise<AnalyzeResponse> {
  return runAnalyze(
    {
      callAI: dependencies?.callAI ?? defaultCallAI,
      loadExistingState: dependencies?.loadExistingState ?? defaultLoadExistingState,
    },
    request,
    context,
  );
}

export {
  StoryboardError,
  type AnalyzeContext,
  type AnalyzeDependencies,
  type CallStoryboardAI,
  type ExistingStoryboardState,
  type LoadExistingStoryboardState,
  type StoryboardAssetUsage,
  type ValidatedAnalyzeRequest,
};
export type { PersistedStoryboardScene };
