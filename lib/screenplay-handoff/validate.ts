/**
 * KIIKIS 2.1 Phase 2 — Handoff 综合校验器
 *
 * 与 parseScreenplayHandoffV1 (契约层) 互补：
 * - parseScreenplayHandoffV1 在首个错误抛异常
 * - validateHandoff 收集所有错误一次性返回，供 UI 展示
 */

import { parseScreenplayHandoffV1, HANDOFF_SCHEMA_VERSION, HANDOFF_ASPECT_RATIO, HANDOFF_CONTINUITY_MODES } from "./contracts.ts";

export interface HandoffValidationError {
  readonly field: string;
  readonly message: string;
}

export interface HandoffValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<HandoffValidationError>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 综合校验：收集所有错误后返回。
 * 包含契约层不做的跨字段校验 (如 characters 引用 canon)。
 */
export function validateHandoff(input: unknown): HandoffValidationResult {
  const errors: HandoffValidationError[] = [];

  if (!input || typeof input !== "object") {
    return { valid: false, errors: [{ field: "handoff", message: "input must be an object" }] };
  }
  const obj = input as Record<string, unknown>;

  // 基本字段
  if (obj.schemaVersion !== HANDOFF_SCHEMA_VERSION) {
    errors.push({ field: "schemaVersion", message: `must be ${HANDOFF_SCHEMA_VERSION}` });
  }
  if (!isNonEmptyString(obj.projectId)) errors.push({ field: "projectId", message: "must be a non-empty string" });
  if (!isNonEmptyString(obj.universeId)) errors.push({ field: "universeId", message: "must be a non-empty string" });
  if (!isNonEmptyString(obj.episodeId)) errors.push({ field: "episodeId", message: "must be a non-empty string" });
  if (!isNonEmptyString(obj.sourceHash)) errors.push({ field: "sourceHash", message: "must be a non-empty string" });
  if (obj.aspectRatio !== HANDOFF_ASPECT_RATIO) {
    errors.push({ field: "aspectRatio", message: `must be ${HANDOFF_ASPECT_RATIO}` });
  }

  // scenes
  if (!Array.isArray(obj.scenes)) {
    errors.push({ field: "scenes", message: "must be an array" });
  } else if (obj.scenes.length === 0) {
    errors.push({ field: "scenes", message: "must contain at least one scene" });
  }

  // canonSnapshot
  const canon = obj.canonSnapshot as Record<string, unknown> | undefined;
  const characterIds = new Set<string>();
  if (canon && Array.isArray(canon.characters)) {
    for (const ch of canon.characters) {
      if (ch && typeof ch === "object" && isNonEmptyString((ch as Record<string, unknown>).id)) {
        characterIds.add((ch as Record<string, unknown>).id as string);
        if (!isNonEmptyString((ch as Record<string, unknown>).masterVersion)) {
          errors.push({ field: "canonSnapshot.characters.masterVersion", message: "must be a non-empty string" });
        }
      }
    }
  }

  // scene location 和 character 引用校验
  if (Array.isArray(obj.scenes)) {
    for (let i = 0; i < obj.scenes.length; i++) {
      const scene = obj.scenes[i] as Record<string, unknown> | undefined;
      if (!scene || typeof scene !== "object") {
        errors.push({ field: `scenes[${i}]`, message: "must be an object" });
        continue;
      }
      if (!isNonEmptyString(scene.location)) {
        errors.push({ field: `scenes[${i}].location`, message: "must be a non-empty string" });
      }
      if (!HANDOFF_CONTINUITY_MODES.includes(scene.continuityMode as string)) {
        errors.push({ field: `scenes[${i}].continuityMode`, message: `must be one of ${HANDOFF_CONTINUITY_MODES.join(", ")}` });
      }
      // character 引用必须存在于 canon
      if (Array.isArray(scene.characters) && characterIds.size > 0) {
        for (const charId of scene.characters) {
          if (!characterIds.has(charId as string)) {
            errors.push({
              field: `scenes[${i}].characters`,
              message: `character "${charId}" not found in canonSnapshot.characters`,
            });
          }
        }
      }
    }
  }

  // 尝试用 parseScreenplayHandoffV1 做严格校验，捕获额外错误
  if (errors.length === 0) {
    try {
      parseScreenplayHandoffV1(obj as Parameters<typeof parseScreenplayHandoffV1>[0]);
    } catch (err) {
      if (err instanceof Error && "field" in err) {
        errors.push({ field: (err as { field: string }).field, message: err.message });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
