/**
 * Storyboard analyze pipeline — orchestration entry point.
 *
 * Task card: KIIKIS-P1-KIMI-002 §1
 *
 * Responsibilities:
 *   1. Call AI via injected callAI boundary (or default callRoutedProvider).
 *   2. Strictly parse the model output: reject markdown fences, reject
 *      trailing commentary, reject missing required fields. NEVER silently
 *      substitute an empty-scenes response — every failure throws
 *      StoryboardError so the route can surface a visible error to the UI.
 *   3. Build StoryboardScene[] + asset usages with stable client IDs and
 *      return a contract-shaped AnalyzeResponse.
 *
 * Fail-visible contract: if the model returns anything that is not a strict
 * JSON object of shape AiAnalyzeOutput, we throw ANALYZE_OUTPUT_INVALID.
 * The route MUST NOT clear the existing scenes on this error — the UI keeps
 * the last good state and shows the error inline.
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping).
 */

import { callRoutedProvider } from "../../ai/providers/index.ts";
import type { AIMessage } from "../../ai/providers/index.ts";
import {
  buildAnalyzeSystemPrompt,
  buildAnalyzeUserPrompt,
} from "./prompt.ts";
import {
  StoryboardError,
  type AiAnalyzeOutput,
  type AiAssetOutput,
  type AiSceneOutput,
  type AiShotOutput,
  type AnalyzeContext,
  type AnalyzeDependencies,
  type CallStoryboardAI,
  type ExistingStoryboardState,
  type LoadExistingStoryboardState,
  type ValidatedAnalyzeRequest,
} from "./types.ts";
import type {
  AnalyzeResponse,
  PersistedStoryboardScene,
  StoryboardAssetUsage,
  StoryboardScene,
  StoryboardShot,
} from "../contracts.ts";
import { extractAssetUsages, createMinimalAssetUsage, findAssetByName, type StoryboardAssetUsageWithAliases } from "../assets/extract.ts";

const ANALYZE_AI_TASK_TYPE = "storyboard_script" as const;

/** Default AI boundary: route through the project's provider router. */
const defaultCallAI: CallStoryboardAI = async (scope) => {
  const messages: AIMessage[] = [
    { role: "system", content: scope.systemPrompt },
    { role: "user", content: scope.userPrompt },
  ];
  const result = await callRoutedProvider({
    taskType: ANALYZE_AI_TASK_TYPE,
    messages,
  });
  // AIProviderResult stores text under `output` (not `text`) per project convention.
  const output = result.output;
  if (typeof output !== "string" || output.trim().length === 0) {
    throw new StoryboardError("AI_CALL_FAILED", "AI 返回为空，无法解析分镜。");
  }
  return output;
};

/** Strict JSON parser: rejects markdown fences, trailing text, non-objects. */
export function parseStrictAnalyzeJson(raw: string): AiAnalyzeOutput {
  let text = raw.trim();
  if (!text) throw new StoryboardError("ANALYZE_OUTPUT_INVALID", "AI 返回为空字符串。");

  // Strip a single pair of ```json / ``` fences if present — but reject if
  // anything other than whitespace surrounds them.
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) text = fenceMatch[1].trim();

  if (!text.startsWith("{") || !text.endsWith("}")) {
    throw new StoryboardError(
      "ANALYZE_OUTPUT_INVALID",
      "AI 返回不是 JSON 对象（首字符不是 { 或末字符不是 }）。",
      { head: text.slice(0, 80), tail: text.slice(-80) },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new StoryboardError(
      "ANALYZE_OUTPUT_INVALID",
      "AI 返回的 JSON 解析失败。",
      { error: err instanceof Error ? err.message : String(err) },
    );
  }

  return assertAiAnalyzeOutput(parsed);
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new StoryboardError("ANALYZE_OUTPUT_INVALID", `字段 ${field} 不是字符串。`);
  }
  return value;
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new StoryboardError("ANALYZE_OUTPUT_INVALID", `字段 ${field} 不是数组。`);
  }
  return value.map((item, i) => {
    if (typeof item !== "string") {
      throw new StoryboardError("ANALYZE_OUTPUT_INVALID", `字段 ${field}[${i}] 不是字符串。`);
    }
    return item;
  });
}

function assertNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StoryboardError("ANALYZE_OUTPUT_INVALID", `字段 ${field} 不是有效数字。`);
  }
  return value;
}

function assertAiShotOutput(value: unknown, index: number): AiShotOutput {
  if (!value || typeof value !== "object") {
    throw new StoryboardError("ANALYZE_OUTPUT_INVALID", `shots[${index}] 不是对象。`);
  }
  const shot = value as Record<string, unknown>;
  return {
    sourceText: assertString(shot.sourceText, `shots[${index}].sourceText`),
    storyBeat: assertString(shot.storyBeat, `shots[${index}].storyBeat`),
    visualDescription: assertString(shot.visualDescription, `shots[${index}].visualDescription`),
    characters: shot.characters === undefined ? [] : assertStringArray(shot.characters, `shots[${index}].characters`),
    location: shot.location === null || shot.location === undefined ? null : assertString(shot.location, `shots[${index}].location`),
    props: shot.props === undefined ? [] : assertStringArray(shot.props, `shots[${index}].props`),
    shotSize: assertString(shot.shotSize, `shots[${index}].shotSize`),
    cameraMovement: assertString(shot.cameraMovement, `shots[${index}].cameraMovement`),
    angle: assertString(shot.angle, `shots[${index}].angle`),
    durationSeconds: assertNumber(shot.durationSeconds, `shots[${index}].durationSeconds`),
    dialogue: assertString(shot.dialogue, `shots[${index}].dialogue`),
    emotion: assertString(shot.emotion, `shots[${index}].emotion`),
    continuity: assertString(shot.continuity, `shots[${index}].continuity`),
  };
}

function assertAiSceneOutput(value: unknown, index: number): AiSceneOutput {
  if (!value || typeof value !== "object") {
    throw new StoryboardError("ANALYZE_OUTPUT_INVALID", `scenes[${index}] 不是对象。`);
  }
  const scene = value as Record<string, unknown>;
  const shots = scene.shots;
  if (!Array.isArray(shots)) {
    throw new StoryboardError("ANALYZE_OUTPUT_INVALID", `scenes[${index}].shots 不是数组。`);
  }
  return {
    heading: assertString(scene.heading, `scenes[${index}].heading`),
    location: assertString(scene.location, `scenes[${index}].location`),
    timeOfDay: assertString(scene.timeOfDay, `scenes[${index}].timeOfDay`),
    summary: assertString(scene.summary, `scenes[${index}].summary`),
    sourceText: assertString(scene.sourceText, `scenes[${index}].sourceText`),
    characters: scene.characters === undefined ? [] : assertStringArray(scene.characters, `scenes[${index}].characters`),
    props: scene.props === undefined ? [] : assertStringArray(scene.props, `scenes[${index}].props`),
    shots: shots.map((shot, i) => assertAiShotOutput(shot, i)),
  };
}

function assertAiAssetOutput(value: unknown, kind: string, index: number): AiAssetOutput {
  if (!value || typeof value !== "object") {
    throw new StoryboardError("ANALYZE_OUTPUT_INVALID", `assets.${kind}[${index}] 不是对象。`);
  }
  const asset = value as Record<string, unknown>;
  return {
    name: assertString(asset.name, `assets.${kind}[${index}].name`),
    aliases: asset.aliases === undefined ? [] : assertStringArray(asset.aliases, `assets.${kind}[${index}].aliases`),
    scriptBasis: assertString(asset.scriptBasis, `assets.${kind}[${index}].scriptBasis`),
    description: assertString(asset.description, `assets.${kind}[${index}].description`),
    visualKeywords: asset.visualKeywords === undefined ? [] : assertStringArray(asset.visualKeywords, `assets.${kind}[${index}].visualKeywords`),
  };
}

function assertAiAnalyzeOutput(value: unknown): AiAnalyzeOutput {
  if (!value || typeof value !== "object") {
    throw new StoryboardError("ANALYZE_OUTPUT_INVALID", "AI 输出不是对象。");
  }
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.scenes)) {
    throw new StoryboardError("ANALYZE_OUTPUT_INVALID", "AI 输出缺少 scenes 数组。");
  }
  if (!root.assets || typeof root.assets !== "object") {
    throw new StoryboardError("ANALYZE_OUTPUT_INVALID", "AI 输出缺少 assets 对象。");
  }
  const assets = root.assets as Record<string, unknown>;
  const characters = Array.isArray(assets.characters) ? assets.characters : [];
  const locations = Array.isArray(assets.locations) ? assets.locations : [];
  const props = Array.isArray(assets.props) ? assets.props : [];
  return {
    scenes: root.scenes.map((scene, i) => assertAiSceneOutput(scene, i)),
    assets: {
      characters: characters.map((a, i) => assertAiAssetOutput(a, "characters", i)),
      locations: locations.map((a, i) => assertAiAssetOutput(a, "locations", i)),
      props: props.map((a, i) => assertAiAssetOutput(a, "props", i)),
    },
  };
}

/** Build a stable clientId for a scene or shot (deterministic across runs). */
function buildSceneClientId(index: number): string {
  return `p_scene_${index + 1}`;
}
function buildShotClientId(sceneClientId: string, index: number): string {
  return `${sceneClientId}_shot_${index + 1}`;
}

/**
 * Map validated AI output to contract-shaped StoryboardScene[] + asset usages.
 * - Auto-create minimal asset usages for any name referenced by a scene/shot
 *   but absent from the AI asset list (references must never dangle).
 * - Map character/scene/prop NAMES in each shot to assetIds using the dedupe
 *   key (so the UI can later bind selectedVersionId -> referenceVersionIds).
 */
function buildStoryboardScenes(
  ai: AiAnalyzeOutput,
  usages: StoryboardAssetUsageWithAliases[],
): { scenes: StoryboardScene[]; analysisVersion: number } {
  const scenes: StoryboardScene[] = ai.scenes.map((aiScene, sceneIndex) => {
    const sceneClientId = buildSceneClientId(sceneIndex);
    const characterAssetIds = aiScene.characters
      .map((name) => findAssetByName(usages, "character", name)?.assetId)
      .filter((id): id is string => Boolean(id));
    const propAssetIds = aiScene.props
      .map((name) => findAssetByName(usages, "prop", name)?.assetId)
      .filter((id): id is string => Boolean(id));
    const locationAsset = aiScene.location
      ? findAssetByName(usages, "location", aiScene.location)
      : null;

    const shots: StoryboardShot[] = aiScene.shots.map((aiShot, shotIndex) => {
      const shotClientId = buildShotClientId(sceneClientId, shotIndex);
      const shotCharacterAssetIds = aiShot.characters.map((name) => {
        const existing = findAssetByName(usages, "character", name);
        if (existing) return existing.assetId;
        const created = createMinimalAssetUsage("character", name, usages);
        usages.push(created);
        return created.assetId;
      });
      const shotPropAssetIds = aiShot.props.map((name) => {
        const existing = findAssetByName(usages, "prop", name);
        if (existing) return existing.assetId;
        const created = createMinimalAssetUsage("prop", name, usages);
        usages.push(created);
        return created.assetId;
      });
      const shotSceneAssetId = aiShot.location
        ? (() => {
            const existing = findAssetByName(usages, "location", aiShot.location);
            if (existing) return existing.assetId;
            const created = createMinimalAssetUsage("location", aiShot.location, usages);
            usages.push(created);
            return created.assetId;
          })()
        : locationAsset?.assetId ?? null;

      return {
        id: undefined,
        clientId: shotClientId,
        idSource: "client" as const,
        sceneId: sceneClientId,
        order: shotIndex + 1,
        sourceText: aiShot.sourceText,
        storyBeat: aiShot.storyBeat,
        visualDescription: aiShot.visualDescription,
        characterAssetIds: shotCharacterAssetIds,
        sceneAssetId: shotSceneAssetId,
        propAssetIds: shotPropAssetIds,
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
        revision: 0,
        analysisVersion: 0,
        sourceHash: "",
      };
    });

    return {
      id: undefined,
      clientId: sceneClientId,
      idSource: "client" as const,
      order: sceneIndex + 1,
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
      revision: 0,
      analysisVersion: 0,
      sourceHash: "",
    };
  });

  return {
    scenes,
    analysisVersion: 1,
  };
}

/**
 * Run the full analyze pipeline.
 *
 * Behavior:
 *   - mode="full": re-analyze the entire source text; returns brand-new
 *     scenes + assets. The route replaces existing scenes atomically via
 *     save_storyboard_state (caller's responsibility).
 *   - mode="scene": re-analyze ONE scene identified by request.sceneId. The
 *     returned scenes array contains exactly one scene; the caller splices
 *     it into the existing state at the position of the original scene.
 *
 * On failure: throws StoryboardError — the route surfaces it as a visible
 * error and MUST NOT clear the existing scenes (BLOCKER 4 contract).
 */
export async function runStoryboardAnalyze(
  request: ValidatedAnalyzeRequest,
  context: AnalyzeContext,
  dependencies?: Partial<AnalyzeDependencies>,
): Promise<AnalyzeResponse> {
  const callAI = dependencies?.callAI ?? defaultCallAI;
  const loadExistingState = dependencies?.loadExistingState;

  // For scene-mode re-analysis, we need the original scene's sourceText
  // from the existing state. The route layer is responsible for ensuring
  // the request is consistent — we only need the sourceText to feed the AI.
  let sceneSourceText: string | undefined;
  if (request.mode === "scene" && request.sceneId && loadExistingState) {
    const existing = await loadExistingState({
      ownerId: context.ownerId,
      projectId: request.projectId,
      sourceUnitId: request.sourceUnitId,
    });
    const scene = existing.scenes.find((s) => s.id === request.sceneId);
    if (!scene) {
      throw new StoryboardError("SCENE_NOT_FOUND", `未找到场景 ${request.sceneId}，无法重新分析。`);
    }
    sceneSourceText = scene.sourceText;
  }

  const systemPrompt = buildAnalyzeSystemPrompt(request);
  const userPrompt = buildAnalyzeUserPrompt(request, { sceneSourceText });
  const raw = await callAI({ systemPrompt, userPrompt });
  const ai = parseStrictAnalyzeJson(raw);

  const usages = extractAssetUsages(ai.assets);
  const { scenes, analysisVersion } = buildStoryboardScenes(ai, usages);

  const assetUsages: StoryboardAssetUsage[] = usages.map((u) => ({
    assetId: u.assetId,
    kind: u.kind,
    name: u.name,
    scriptBasis: u.scriptBasis,
    description: u.description,
    visualKeywords: u.visualKeywords,
    prompt: u.prompt,
    selectedVersionId: u.selectedVersionId,
  }));

  return {
    analysisId: `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    analysisVersion,
    sourceHash: "",
    revision: request.expectedRevision,
    scenes,
    assets: {
      characters: assetUsages.filter((u) => u.kind === "character"),
      locations: assetUsages.filter((u) => u.kind === "location"),
      props: assetUsages.filter((u) => u.kind === "prop"),
    },
  };
}

export {
  StoryboardError,
  type AnalyzeContext,
  type AnalyzeDependencies,
  type CallStoryboardAI,
  type ExistingStoryboardState,
  type LoadExistingStoryboardState,
  type ValidatedAnalyzeRequest,
};
export type { PersistedStoryboardScene };
