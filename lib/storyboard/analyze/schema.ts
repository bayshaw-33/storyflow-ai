/**
 * Storyboard analyze — strict request validation.
 *
 * Task card: KIIKIS-P1-KIMI-002 §1
 *
 * Error contract:
 *   - body is not valid JSON            → 422 INVALID_JSON
 *   - missing / invalid fields          → 422 MISSING_FIELD + details.fields
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping).
 */

import {
  STORYBOARD_ASPECT_RATIOS,
  type StoryboardRuntimeAspectRatio,
  type ValidatedAnalyzeRequest,
} from "./types.ts";

const MAX_SOURCE_CHARS = 100_000;
const MAX_TARGET_DURATION_SECONDS = 600;

export type ValidationFailure = {
  ok: false;
  status: 422;
  code: "INVALID_JSON" | "MISSING_FIELD";
  error: string;
  details?: { fields: string[] };
};

export type ValidationSuccess<T> = { ok: true; value: T };

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function missingField(fields: string[]): ValidationFailure {
  return {
    ok: false,
    status: 422,
    code: "MISSING_FIELD",
    error: `请求缺少或包含非法字段: ${fields.join(", ")}`,
    details: { fields },
  };
}

/** Parse a raw request body string; anything unparseable → 422 INVALID_JSON. */
export function parseAnalyzeJsonBody(raw: string): ValidationResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return {
      ok: false,
      status: 422,
      code: "INVALID_JSON",
      error: "请求体不是合法的 JSON。",
    };
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function validateAnalyzeRequest(body: unknown): ValidationResult<ValidatedAnalyzeRequest> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return missingField(["body"]);
  }
  const input = body as Record<string, unknown>;
  const fields: string[] = [];

  if (!isNonEmptyString(input.projectId)) fields.push("projectId");
  if (!isNonEmptyString(input.sourceUnitId)) fields.push("sourceUnitId");

  if (typeof input.source !== "string" || input.source.trim().length === 0) {
    fields.push("source");
  } else if (input.source.length > MAX_SOURCE_CHARS) {
    fields.push("source(too long)");
  }

  const aspectRatio = input.aspectRatio;
  if (
    typeof aspectRatio !== "string" ||
    !(STORYBOARD_ASPECT_RATIOS as readonly string[]).includes(aspectRatio)
  ) {
    fields.push("aspectRatio");
  }

  const targetDurationSeconds = input.targetDurationSeconds;
  if (
    typeof targetDurationSeconds !== "number" ||
    !Number.isFinite(targetDurationSeconds) ||
    targetDurationSeconds <= 0 ||
    targetDurationSeconds > MAX_TARGET_DURATION_SECONDS
  ) {
    fields.push("targetDurationSeconds");
  }

  if (typeof input.visualStyle !== "string") fields.push("visualStyle");
  if (!isNonEmptyString(input.outputLanguage)) fields.push("outputLanguage");

  const mode = input.mode;
  if (mode !== "full" && mode !== "scene") fields.push("mode");

  const sceneId = input.sceneId;
  if (sceneId !== null && typeof sceneId !== "string") {
    fields.push("sceneId");
  } else if (mode === "scene" && !isNonEmptyString(sceneId)) {
    fields.push("sceneId(required for mode=scene)");
  }

  if (!isNonNegativeInteger(input.expectedRevision)) fields.push("expectedRevision");
  if (!isNonEmptyString(input.idempotencyKey)) fields.push("idempotencyKey");

  if (fields.length > 0) return missingField(fields);

  return {
    ok: true,
    value: {
      projectId: (input.projectId as string).trim(),
      sourceUnitId: (input.sourceUnitId as string).trim(),
      source: input.source as string,
      aspectRatio: aspectRatio as StoryboardRuntimeAspectRatio,
      targetDurationSeconds: targetDurationSeconds as number,
      visualStyle: (input.visualStyle as string).trim(),
      outputLanguage: input.outputLanguage as ValidatedAnalyzeRequest["outputLanguage"],
      mode: mode as "full" | "scene",
      sceneId: typeof sceneId === "string" ? sceneId.trim() : null,
      expectedRevision: input.expectedRevision as number,
      idempotencyKey: (input.idempotencyKey as string).trim(),
    },
  };
}
