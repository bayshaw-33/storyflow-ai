/**
 * Storyboard analyze — strict AI output parsing.
 *
 * Task card: KIIKIS-P1-KIMI-002 §1
 *
 * Parsing strategy (deliberately narrow):
 *   1. trim whitespace;
 *   2. strip ONE optional surrounding ```json / ``` fence;
 *   3. JSON.parse — NOTHING ELSE. Regex-extracting arbitrary JSON out of
 *      prose is forbidden: if the model wraps output in commentary, the
 *      output is invalid and we fail visibly.
 *
 * Any failure throws StoryboardError("ANALYZE_OUTPUT_INVALID") with a
 * sanitized excerpt and the list of offending paths.
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping).
 */

import {
  StoryboardError,
  type AiAnalyzeOutput,
  type AiAssetOutput,
  type AiSceneOutput,
  type AiShotOutput,
} from "./types.ts";

const EXCERPT_LENGTH = 240;

function sanitizeExcerpt(raw: string): string {
  return raw.replace(/\s+/g, " ").slice(0, EXCERPT_LENGTH);
}

function invalid(message: string, details?: Record<string, unknown>): never {
  throw new StoryboardError("ANALYZE_OUTPUT_INVALID", message, details);
}

/** Remove at most one surrounding code fence; return the inner text. */
export function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstLineEnd = trimmed.indexOf("\n");
  if (firstLineEnd === -1) return trimmed;
  const opening = trimmed.slice(0, firstLineEnd).trim();
  if (!/^```(json|JSON)?$/.test(opening)) return trimmed;
  const closing = trimmed.lastIndexOf("```");
  if (closing <= firstLineEnd) return trimmed;
  return trimmed.slice(firstLineEnd + 1, closing).trim();
}

// ---------------------------------------------------------------------------
// Strict shape validation
// ---------------------------------------------------------------------------

type Path = string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(
  obj: Record<string, unknown>,
  key: string,
  path: Path,
  problems: string[],
  options: { required: boolean; nonEmpty?: boolean },
): string {
  const value = obj[key];
  if (value === undefined || value === null) {
    if (options.required) problems.push(`${path}.${key} (missing)`);
    return "";
  }
  if (typeof value !== "string") {
    problems.push(`${path}.${key} (expected string, got ${Array.isArray(value) ? "array" : typeof value})`);
    return "";
  }
  if (options.nonEmpty && value.trim().length === 0) {
    problems.push(`${path}.${key} (empty)`);
  }
  return value;
}

function readStringArray(
  obj: Record<string, unknown>,
  key: string,
  path: Path,
  problems: string[],
): string[] {
  const value = obj[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    problems.push(`${path}.${key} (expected string[])`);
    return [];
  }
  const out: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      problems.push(`${path}.${key}[${index}] (expected string)`);
    } else if (item.trim().length > 0) {
      out.push(item.trim());
    }
  });
  return out;
}

/** durationSeconds may be a number or a numeric string; anything else is invalid. */
function readDuration(
  obj: Record<string, unknown>,
  key: string,
  path: Path,
  problems: string[],
): number {
  const value = obj[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  problems.push(`${path}.${key} (expected number or numeric string)`);
  return 0;
}

function parseShot(raw: unknown, path: Path, problems: string[]): AiShotOutput | null {
  if (!isRecord(raw)) {
    problems.push(`${path} (expected object)`);
    return null;
  }
  const location = raw.location;
  return {
    sourceText: readString(raw, "sourceText", path, problems, { required: true }),
    storyBeat: readString(raw, "storyBeat", path, problems, { required: true }),
    visualDescription: readString(raw, "visualDescription", path, problems, {
      required: true,
      nonEmpty: true,
    }),
    characters: readStringArray(raw, "characters", path, problems),
    location: typeof location === "string" && location.trim().length > 0 ? location.trim() : null,
    props: readStringArray(raw, "props", path, problems),
    shotSize: readString(raw, "shotSize", path, problems, { required: true, nonEmpty: true }),
    cameraMovement: readString(raw, "cameraMovement", path, problems, { required: true }),
    angle: readString(raw, "angle", path, problems, { required: true }),
    durationSeconds: readDuration(raw, "durationSeconds", path, problems),
    dialogue: readString(raw, "dialogue", path, problems, { required: true }),
    emotion: readString(raw, "emotion", path, problems, { required: true }),
    continuity: readString(raw, "continuity", path, problems, { required: true }),
  };
}

function parseScene(raw: unknown, path: Path, problems: string[]): AiSceneOutput | null {
  if (!isRecord(raw)) {
    problems.push(`${path} (expected object)`);
    return null;
  }
  const rawShots = raw.shots;
  const shots: AiShotOutput[] = [];
  if (!Array.isArray(rawShots) || rawShots.length === 0) {
    problems.push(`${path}.shots (must be a non-empty array)`);
  } else {
    rawShots.forEach((shot, index) => {
      const parsed = parseShot(shot, `${path}.shots[${index}]`, problems);
      if (parsed) shots.push(parsed);
    });
  }
  return {
    heading: readString(raw, "heading", path, problems, { required: true, nonEmpty: true }),
    location: readString(raw, "location", path, problems, { required: true, nonEmpty: true }),
    timeOfDay: readString(raw, "timeOfDay", path, problems, { required: true }),
    summary: readString(raw, "summary", path, problems, { required: true }),
    sourceText: readString(raw, "sourceText", path, problems, { required: true, nonEmpty: true }),
    characters: readStringArray(raw, "characters", path, problems),
    props: readStringArray(raw, "props", path, problems),
    shots,
  };
}

function parseAsset(raw: unknown, path: Path, problems: string[]): AiAssetOutput | null {
  if (!isRecord(raw)) {
    problems.push(`${path} (expected object)`);
    return null;
  }
  return {
    name: readString(raw, "name", path, problems, { required: true, nonEmpty: true }).trim(),
    aliases: readStringArray(raw, "aliases", path, problems),
    scriptBasis: readString(raw, "scriptBasis", path, problems, { required: false }),
    description: readString(raw, "description", path, problems, { required: false }),
    visualKeywords: readStringArray(raw, "visualKeywords", path, problems),
  };
}

function parseAssetGroup(raw: unknown, path: Path, problems: string[]): AiAssetOutput[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    problems.push(`${path} (expected array)`);
    return [];
  }
  const out: AiAssetOutput[] = [];
  raw.forEach((item, index) => {
    const parsed = parseAsset(item, `${path}[${index}]`, problems);
    if (parsed && parsed.name.length > 0) out.push(parsed);
  });
  return out;
}

/**
 * Parse + strictly validate raw AI output. Throws ANALYZE_OUTPUT_INVALID on
 * ANY problem — callers must never substitute an empty-scenes success.
 */
export function parseAnalyzeOutput(rawOutput: string): AiAnalyzeOutput {
  const text = stripCodeFence(rawOutput);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    invalid(`AI 输出不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`, {
      excerpt: sanitizeExcerpt(text),
    });
  }

  const problems: string[] = [];
  if (!isRecord(parsed)) {
    invalid("AI 输出顶层不是 JSON 对象。", { excerpt: sanitizeExcerpt(text) });
  }

  const rawScenes = parsed.scenes;
  const scenes: AiSceneOutput[] = [];
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
    problems.push("scenes (must be a non-empty array)");
  } else {
    rawScenes.forEach((scene, index) => {
      const parsedScene = parseScene(scene, `scenes[${index}]`, problems);
      if (parsedScene) scenes.push(parsedScene);
    });
  }

  const rawAssets = parsed.assets;
  let assets: AiAnalyzeOutput["assets"] = { characters: [], locations: [], props: [] };
  if (rawAssets !== undefined && rawAssets !== null) {
    if (!isRecord(rawAssets)) {
      problems.push("assets (expected object)");
    } else {
      assets = {
        characters: parseAssetGroup(rawAssets.characters, "assets.characters", problems),
        locations: parseAssetGroup(rawAssets.locations, "assets.locations", problems),
        props: parseAssetGroup(rawAssets.props, "assets.props", problems),
      };
    }
  }

  if (problems.length > 0) {
    invalid(`AI 输出不符合分镜契约（${problems.length} 处问题）。`, {
      paths: problems,
      excerpt: sanitizeExcerpt(text),
    });
  }

  return { scenes, assets };
}
