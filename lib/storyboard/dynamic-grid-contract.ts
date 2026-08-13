/**
 * KIIKIS 2.1 Phase 2 — 动态宫格分镜契约 (K21-SB-001..006)
 *
 * 每场按叙事密度选择 4/6/9/12 格 (K21-SB-001)
 * NEW 场首格必须是无人空镜 (K21-SB-002)
 * CONTINUOUS 场承接动作 (K21-SB-003)
 * 每格独立严格 9:16 (K21-SB-004)
 * 宫格纯画面不烧录编号/台词/可读文字 (K21-SB-006)
 */

/** 允许的宫格数量。 */
export const DYNAMIC_GRID_COUNTS = [4, 6, 9, 12] as const;
export type DynamicGridCount = (typeof DYNAMIC_GRID_COUNTS)[number];

export const DYNAMIC_GRID_SCHEMA_VERSION = "kiikis.dynamic-grid-storyboard/1" as const;

export const DYNAMIC_GRID_CONTINUITY_MODES = ["NEW", "CONTINUOUS"] as const;
export type DynamicGridContinuityMode = (typeof DYNAMIC_GRID_CONTINUITY_MODES)[number];

/** 空间规划 (K21-SB-005: 固定空间、轴线、人物位置)。 */
export interface SpatialPlan {
  readonly axis: string;
  readonly entrances: ReadonlyArray<string>;
  readonly screenDirections: ReadonlyArray<string>;
}

/** 单格帧。 */
export interface DynamicGridFrameV1 {
  readonly id: string;
  readonly order: number;
  readonly aspectRatio: "9:16";
  /** 画面描述 (纯视觉，不含可读文字)。 */
  readonly visualDescription: string;
  /** 人物 (引用角色 ID，NEW 首格必须为空数组)。 */
  readonly characterIds: ReadonlyArray<string>;
  /** 镜头景别 (特写/中景/全景等)。 */
  readonly shotSize: string;
  /** 运镜说明 (K21-SB-009: 完整摄影提示词)。 */
  readonly cameraMovement: string;
  /** 情绪 (不烧录画面，仅用于导出)。 */
  readonly emotion: string;
  /** 台词 (不烧录画面，仅用于导出)。 */
  readonly dialogue: string;
  /** 动作描述。 */
  readonly action: string;
  /** 时间点 (用于导出排序)。 */
  readonly timecode: string;
  /** 人工锁定标记 (K21-SB-007)。 */
  readonly locked: boolean;
  /** 人工编辑标记 (K21-SB-007)。 */
  readonly userEdited: boolean;
}

/** 动态宫格分镜场景。 */
export interface DynamicGridSceneV1 {
  readonly schemaVersion: typeof DYNAMIC_GRID_SCHEMA_VERSION;
  readonly handoffId: string;
  readonly sceneId: string;
  readonly continuityMode: DynamicGridContinuityMode;
  readonly gridCount: DynamicGridCount;
  readonly gridRationale: string;
  readonly spatialPlan: SpatialPlan;
  readonly sharedCinematography: string;
  readonly negativePrompt: string;
  readonly frames: ReadonlyArray<DynamicGridFrameV1>;
}

/** 契约输入 (松散类型)。 */
export type DynamicGridSceneInput = {
  [K in keyof DynamicGridSceneV1]: unknown;
} & { [key: string]: unknown };

export class DynamicGridError extends Error {
  readonly code = "invalid_dynamic_grid" as const;
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "DynamicGridError";
    this.field = field;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function fail(field: string, message: string): never {
  throw new DynamicGridError(field, message);
}

function parseFrame(raw: unknown, index: number, sceneId: string): DynamicGridFrameV1 {
  if (!raw || typeof raw !== "object") {
    fail(`frames[${index}]`, `frame must be an object (scene ${sceneId})`);
  }
  const obj = raw as Record<string, unknown>;
  const loc = `frames[${index}]`;

  if (!isNonEmptyString(obj.id)) fail(`${loc}.id`, "frame id must be a non-empty string");
  if (!isPositiveInt(obj.order)) fail(`${loc}.order`, "must be a positive integer");
  if (obj.aspectRatio !== "9:16") fail(`${loc}.aspectRatio`, 'must be "9:16"');
  if (!isNonEmptyString(obj.visualDescription)) fail(`${loc}.visualDescription`, "must be a non-empty string");
  if (!Array.isArray(obj.characterIds)) fail(`${loc}.characterIds`, "must be an array");
  if (!isNonEmptyString(obj.shotSize)) fail(`${loc}.shotSize`, "must be a non-empty string");
  if (typeof obj.cameraMovement !== "string") fail(`${loc}.cameraMovement`, "must be a string");
  if (typeof obj.emotion !== "string") fail(`${loc}.emotion`, "must be a string");
  if (typeof obj.dialogue !== "string") fail(`${loc}.dialogue`, "must be a string");
  if (typeof obj.action !== "string") fail(`${loc}.action`, "must be a string");
  if (typeof obj.timecode !== "string") fail(`${loc}.timecode`, "must be a string");
  if (typeof obj.locked !== "boolean") fail(`${loc}.locked`, "must be a boolean");
  if (typeof obj.userEdited !== "boolean") fail(`${loc}.userEdited`, "must be a boolean");

  return Object.freeze({
    id: obj.id,
    order: obj.order,
    aspectRatio: "9:16",
    visualDescription: obj.visualDescription,
    characterIds: Object.freeze([...(obj.characterIds as string[])]),
    shotSize: obj.shotSize,
    cameraMovement: obj.cameraMovement,
    emotion: obj.emotion,
    dialogue: obj.dialogue,
    action: obj.action,
    timecode: obj.timecode,
    locked: obj.locked,
    userEdited: obj.userEdited,
  });
}

/**
 * 解析并校验动态宫格场景。
 * K21-SB-004: 每格 aspectRatio = 9:16
 * K21-SB-006: visualDescription 不得含可读文字标记 (通过 negativePrompt 保障)
 */
export function parseDynamicGridScene(input: DynamicGridSceneInput): DynamicGridSceneV1 {
  if (!input || typeof input !== "object") {
    fail("scene", "input must be an object");
  }

  if (input.schemaVersion !== DYNAMIC_GRID_SCHEMA_VERSION) {
    fail("schemaVersion", `must be ${DYNAMIC_GRID_SCHEMA_VERSION}`);
  }

  if (!isNonEmptyString(input.handoffId)) fail("handoffId", "must be a non-empty string");
  if (!isNonEmptyString(input.sceneId)) fail("sceneId", "must be a non-empty string");

  if (!DYNAMIC_GRID_CONTINUITY_MODES.includes(input.continuityMode as DynamicGridContinuityMode)) {
    fail("continuityMode", `must be one of ${DYNAMIC_GRID_CONTINUITY_MODES.join(", ")}`);
  }

  if (!DYNAMIC_GRID_COUNTS.includes(input.gridCount as DynamicGridCount)) {
    fail("gridCount", `must be one of ${DYNAMIC_GRID_COUNTS.join(", ")}`);
  }

  if (!isNonEmptyString(input.gridRationale)) fail("gridRationale", "must be a non-empty string");

  // spatialPlan
  const sp = input.spatialPlan as Record<string, unknown> | undefined;
  if (!sp || typeof sp !== "object") fail("spatialPlan", "must be an object");
  if (!isNonEmptyString(sp!.axis)) fail("spatialPlan.axis", "must be a non-empty string");
  if (!Array.isArray(sp!.entrances)) fail("spatialPlan.entrances", "must be an array");
  if (!Array.isArray(sp!.screenDirections)) fail("spatialPlan.screenDirections", "must be an array");

  if (!isNonEmptyString(input.sharedCinematography)) fail("sharedCinematography", "must be a non-empty string");
  if (typeof input.negativePrompt !== "string") fail("negativePrompt", "must be a string");

  if (!Array.isArray(input.frames)) fail("frames", "must be an array");
  const gridCount = input.gridCount as number;
  if (input.frames.length !== gridCount) {
    fail("frames", `frames.length (${input.frames.length}) must equal gridCount (${gridCount})`);
  }

  const frames = (input.frames as unknown[]).map((f, i) => parseFrame(f, i, input.sceneId as string));

  return Object.freeze({
    schemaVersion: input.schemaVersion as typeof DYNAMIC_GRID_SCHEMA_VERSION,
    handoffId: input.handoffId as string,
    sceneId: input.sceneId as string,
    continuityMode: input.continuityMode as DynamicGridContinuityMode,
    gridCount: input.gridCount as DynamicGridCount,
    gridRationale: input.gridRationale as string,
    spatialPlan: Object.freeze({
      axis: sp!.axis as string,
      entrances: Object.freeze([...(sp!.entrances as string[])]),
      screenDirections: Object.freeze([...(sp!.screenDirections as string[])]),
    }),
    sharedCinematography: input.sharedCinematography as string,
    negativePrompt: input.negativePrompt as string,
    frames: Object.freeze(frames),
  } as DynamicGridSceneV1);
}
