/**
 * Storyboard analyze pipeline — shared internal types.
 *
 * Task card: KIIKIS-P1-KIMI-002 §1
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping): no enums, no namespaces,
 * no parameter properties. This module is imported by node:test directly.
 *
 * Contract shapes (AnalyzeRequest / AnalyzeResponse / StoryboardScene /
 * StoryboardShot / StoryboardAssetUsage) live in ../contracts.ts and are
 * owned by Codex — this module only IMPORTS them, never redefines them.
 */

import type {
  AnalyzeRequest,
  PersistedStoryboardScene,
  StoryboardAssetKind,
} from "../contracts.ts";

/** Runtime aspect ratios accepted by the storyboard API (superset of the
 * persisted contract union — "1:1" is valid at runtime per production
 * projects schema, even though the frozen contract type lists 9:16/16:9). */
export type StoryboardRuntimeAspectRatio = "9:16" | "16:9" | "1:1";

export const STORYBOARD_ASPECT_RATIOS: readonly StoryboardRuntimeAspectRatio[] = ["9:16", "16:9", "1:1"];

/** Analyze request after strict runtime validation. */
export type ValidatedAnalyzeRequest = Omit<AnalyzeRequest, "aspectRatio"> & {
  aspectRatio: StoryboardRuntimeAspectRatio;
};

export type StoryboardErrorCode =
  | "INVALID_JSON"
  | "MISSING_FIELD"
  | "ANALYZE_OUTPUT_INVALID"
  | "SCENE_NOT_FOUND"
  | "AI_CALL_FAILED"
  | "SHOT_NOT_FOUND"
  | "PROMPT_BUILD_FAILED"
  | "IMAGE_GENERATION_FAILED"
  | "ASSET_GENERATION_FAILED";

/**
 * Fail-visible error with a stable machine code. Every validation / AI
 * output failure in the storyboard pipeline throws this — never swallow,
 * never substitute a 200-with-empty-scenes response.
 */
export class StoryboardError extends Error {
  code: StoryboardErrorCode;
  details?: Record<string, unknown>;

  constructor(code: StoryboardErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "StoryboardError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isStoryboardError(error: unknown): error is StoryboardError {
  return error instanceof StoryboardError;
}

// ---------------------------------------------------------------------------
// Strict AI-output shapes (what the model is asked to return — see prompt.ts)
// ---------------------------------------------------------------------------

export type AiShotOutput = {
  sourceText: string;
  storyBeat: string;
  visualDescription: string;
  characters: string[];
  location: string | null;
  props: string[];
  shotSize: string;
  cameraMovement: string;
  angle: string;
  durationSeconds: number;
  dialogue: string;
  emotion: string;
  continuity: string;
};

export type AiSceneOutput = {
  heading: string;
  location: string;
  timeOfDay: string;
  summary: string;
  sourceText: string;
  characters: string[];
  props: string[];
  shots: AiShotOutput[];
};

export type AiAssetOutput = {
  name: string;
  aliases: string[];
  scriptBasis: string;
  description: string;
  visualKeywords: string[];
};

export type AiAnalyzeOutput = {
  scenes: AiSceneOutput[];
  assets: {
    characters: AiAssetOutput[];
    locations: AiAssetOutput[];
    props: AiAssetOutput[];
  };
};

// ---------------------------------------------------------------------------
// Injectable boundaries (route wires real implementations, tests wire fakes)
// ---------------------------------------------------------------------------

export type AnalyzeAIScope = {
  systemPrompt: string;
  userPrompt: string;
};

/** Provider 诊断（非敏感，PRD §5.2）。 */
export type AnalyzeProviderInfo = {
  provider: string;
  model: string;
  fallbackUsed: boolean;
};

/** Injected AI call — route wires callRoutedProvider, tests wire mocks.
 * 返回 raw output 与可选 provider 诊断；route 层会把诊断透传到 AnalyzeResponse。 */
export type CallStoryboardAI = (scope: AnalyzeAIScope) => Promise<string | { output: string; provider?: AnalyzeProviderInfo }>;

export type ExistingStateScope = {
  ownerId: string;
  projectId: string;
  sourceUnitId: string;
};

export type ExistingStoryboardState = {
  scenes: PersistedStoryboardScene[];
};

/** Injected existing-state loader — route wires storyflow_production_shots
 * via loadProductionState; a missing production project yields EMPTY scenes
 * (never an error). */
export type LoadExistingStoryboardState = (scope: ExistingStateScope) => Promise<ExistingStoryboardState>;

export type AnalyzeDependencies = {
  callAI: CallStoryboardAI;
  loadExistingState: LoadExistingStoryboardState;
};

export type AnalyzeContext = {
  ownerId: string;
};

export type { AnalyzeRequest, PersistedStoryboardScene, StoryboardAssetKind };
