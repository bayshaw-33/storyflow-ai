/**
 * KIIKIS 2.1 Phase 2 — Screenplay Handoff 契约 (K21-HO-001..004)
 *
 * 版本化 handoff 契约：从剧本"定稿并进入分镜"生成不可变快照。
 * 结构化数据是事实源，自由 Markdown 不得作为下游事实源。
 *
 * 规则：
 * 1. schemaVersion 固定为 "kiikis.screenplay-handoff/1"
 * 2. 稳定记录 Project/Universe/Episode/Scene/Actor/Location/Prop 和 Canon 版本 (K21-HO-002)
 * 3. aspectRatio 固定 9:16 (竖屏短剧)
 * 4. continuityMode 只允许 NEW / CONTINUOUS
 * 5. 返回冻结对象，防止下游篡改
 */

/** 当前契约版本字符串。 */
export const HANDOFF_SCHEMA_VERSION = "kiikis.screenplay-handoff/1" as const;

/** 唯一允许的 aspect ratio (竖屏短剧)。 */
export const HANDOFF_ASPECT_RATIO = "9:16" as const;

/** continuityMode 取值。 */
export const HANDOFF_CONTINUITY_MODES = ["NEW", "CONTINUOUS"] as const;
export type HandoffContinuityMode = (typeof HANDOFF_CONTINUITY_MODES)[number];

/** Screenplay block 类型 (与 creation/types.ts 对齐)。 */
export type HandoffBlockType = "action" | "dialogue" | "parenthetical" | "transition" | "note";

/** Canon snapshot 中的角色母版版本引用。 */
export interface HandoffCharacterCanon {
  readonly id: string;
  readonly name: string;
  /** 母版版本，保证分镜使用的角色资产与 handoff 时一致。 */
  readonly masterVersion: string;
  /** 角色美术资产版本 (可选)。 */
  readonly assetVersion?: string;
}

export interface HandoffLocationCanon {
  readonly id: string;
  readonly name: string;
  readonly masterVersion: string;
}

export interface HandoffPropCanon {
  readonly id: string;
  readonly name: string;
  readonly masterVersion: string;
}

export interface HandoffCanonSnapshot {
  readonly characters: ReadonlyArray<HandoffCharacterCanon>;
  readonly locations: ReadonlyArray<HandoffLocationCanon>;
  readonly props: ReadonlyArray<HandoffPropCanon>;
}

/** handoff 中的剧本场景。 */
export interface HandoffScene {
  readonly id: string;
  readonly sceneNo: number;
  readonly heading: string;
  readonly location: string;
  readonly interiorExterior: "INT" | "EXT" | "INT/EXT";
  readonly timeOfDay: string;
  /** 引用 canonSnapshot.characters 中的角色 id。 */
  readonly characters: ReadonlyArray<string>;
  readonly continuityMode: HandoffContinuityMode;
  /** 前置转场 (NEW 场可有，CONTINUOUS 通常为 null)。 */
  readonly precedingTransition: string | null;
  /** 后置转场。 */
  readonly succeedingTransition: string | null;
  readonly blocks: ReadonlyArray<HandoffBlock>;
}

export interface HandoffBlock {
  readonly id: string;
  readonly type: HandoffBlockType;
  readonly character: string;
  readonly text: string;
  readonly translation: string;
}

/** 解析后的不可变 handoff 对象。 */
export interface ScreenplayHandoffV1 {
  readonly schemaVersion: typeof HANDOFF_SCHEMA_VERSION;
  readonly projectId: string;
  readonly universeId: string;
  readonly episodeId: string;
  readonly episodeNo: number;
  readonly episodeTitle: string;
  readonly sourceUnitId: string;
  readonly sourceVersion: string;
  /** 源内容 hash，由 hashHandoffContent 计算。 */
  readonly sourceHash: string;
  readonly aspectRatio: typeof HANDOFF_ASPECT_RATIO;
  readonly screenplayFormat: "international_production" | "hollywood_spec" | "asian_production";
  readonly screenplayLanguage: string;
  readonly dialogueLanguage: string;
  readonly canonSnapshot: HandoffCanonSnapshot;
  readonly scenes: ReadonlyArray<HandoffScene>;
  /** 确认人 (创建时为 null，确认后填充)。 */
  readonly confirmedBy: string | null;
  readonly createdAt: string;
}

/** 契约层输入类型 (字段松散，解析后收敛为严格类型)。 */
export type ScreenplayHandoffInput = {
  [K in keyof ScreenplayHandoffV1]: unknown;
} & { [key: string]: unknown };

/** 契约错误。 */
export class ScreenplayHandoffError extends Error {
  readonly code = "invalid_handoff" as const;
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "ScreenplayHandoffError";
    this.field = field;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function fail(field: string, message: string): never {
  throw new ScreenplayHandoffError(field, message);
}

function parseBlock(raw: unknown, sceneId: string): HandoffBlock {
  if (!raw || typeof raw !== "object") {
    fail(`scenes.${sceneId}.blocks`, "block must be an object");
  }
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.id)) {
    fail(`scenes.${sceneId}.blocks.id`, "block id must be a non-empty string");
  }
  const validTypes: HandoffBlockType[] = ["action", "dialogue", "parenthetical", "transition", "note"];
  if (!validTypes.includes(obj.type as HandoffBlockType)) {
    fail(`scenes.${sceneId}.blocks.type`, `block type must be one of ${validTypes.join(", ")}`);
  }
  if (typeof obj.character !== "string") {
    fail(`scenes.${sceneId}.blocks.character`, "character must be a string");
  }
  if (typeof obj.text !== "string") {
    fail(`scenes.${sceneId}.blocks.text`, "text must be a string");
  }
  if (typeof obj.translation !== "string") {
    fail(`scenes.${sceneId}.blocks.translation`, "translation must be a string");
  }
  return Object.freeze({
    id: obj.id,
    type: obj.type as HandoffBlockType,
    character: obj.character,
    text: obj.text,
    translation: obj.translation,
  });
}

function parseCanonCharacter(raw: unknown): HandoffCharacterCanon {
  if (!raw || typeof raw !== "object") fail("canonSnapshot.characters", "character must be an object");
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.id)) fail("canonSnapshot.characters.id", "must be a non-empty string");
  if (!isNonEmptyString(obj.name)) fail("canonSnapshot.characters.name", "must be a non-empty string");
  if (!isNonEmptyString(obj.masterVersion)) {
    fail("canonSnapshot.characters.masterVersion", "must be a non-empty string");
  }
  const result: HandoffCharacterCanon = {
    id: obj.id,
    name: obj.name,
    masterVersion: obj.masterVersion,
  };
  if (isNonEmptyString(obj.assetVersion)) {
    (result as { assetVersion: string }).assetVersion = obj.assetVersion;
  }
  return Object.freeze(result);
}

function parseCanonLocation(raw: unknown): HandoffLocationCanon {
  if (!raw || typeof raw !== "object") fail("canonSnapshot.locations", "location must be an object");
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.id)) fail("canonSnapshot.locations.id", "must be a non-empty string");
  if (!isNonEmptyString(obj.name)) fail("canonSnapshot.locations.name", "must be a non-empty string");
  if (!isNonEmptyString(obj.masterVersion)) {
    fail("canonSnapshot.locations.masterVersion", "must be a non-empty string");
  }
  return Object.freeze({ id: obj.id, name: obj.name, masterVersion: obj.masterVersion });
}

function parseCanonProp(raw: unknown): HandoffPropCanon {
  if (!raw || typeof raw !== "object") fail("canonSnapshot.props", "prop must be an object");
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.id)) fail("canonSnapshot.props.id", "must be a non-empty string");
  if (!isNonEmptyString(obj.name)) fail("canonSnapshot.props.name", "must be a non-empty string");
  if (!isNonEmptyString(obj.masterVersion)) {
    fail("canonSnapshot.props.masterVersion", "must be a non-empty string");
  }
  return Object.freeze({ id: obj.id, name: obj.name, masterVersion: obj.masterVersion });
}

function parseCanonSnapshot(raw: unknown): HandoffCanonSnapshot {
  if (!raw || typeof raw !== "object") fail("canonSnapshot", "must be an object");
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.characters)) fail("canonSnapshot.characters", "must be an array");
  if (!Array.isArray(obj.locations)) fail("canonSnapshot.locations", "must be an array");
  if (!Array.isArray(obj.props)) fail("canonSnapshot.props", "must be an array");

  return Object.freeze({
    characters: Object.freeze(obj.characters.map(parseCanonCharacter)),
    locations: Object.freeze(obj.locations.map(parseCanonLocation)),
    props: Object.freeze(obj.props.map(parseCanonProp)),
  });
}

function parseScene(raw: unknown, index: number): HandoffScene {
  if (!raw || typeof raw !== "object") fail(`scenes[${index}]`, "scene must be an object");
  const obj = raw as Record<string, unknown>;
  const loc = `scenes[${index}]`;

  if (!isNonEmptyString(obj.id)) fail(`${loc}.id`, "scene id must be a non-empty string");
  if (!isPositiveInt(obj.sceneNo)) fail(`${loc}.sceneNo`, "must be a positive integer");
  if (!isNonEmptyString(obj.heading)) fail(`${loc}.heading`, "must be a non-empty string");
  if (!isNonEmptyString(obj.location)) fail(`${loc}.location`, "must be a non-empty string");

  const ieValues = ["INT", "EXT", "INT/EXT"];
  if (!ieValues.includes(obj.interiorExterior as string)) {
    fail(`${loc}.interiorExterior`, `must be one of ${ieValues.join(", ")}`);
  }
  if (!isNonEmptyString(obj.timeOfDay)) fail(`${loc}.timeOfDay`, "must be a non-empty string");

  if (!Array.isArray(obj.characters)) fail(`${loc}.characters`, "must be an array");
  const characters = obj.characters.map((c, ci) => {
    if (!isNonEmptyString(c)) fail(`${loc}.characters[${ci}]`, "must be a non-empty string");
    return c;
  });

  if (!HANDOFF_CONTINUITY_MODES.includes(obj.continuityMode as HandoffContinuityMode)) {
    fail(`${loc}.continuityMode`, `must be one of ${HANDOFF_CONTINUITY_MODES.join(", ")}`);
  }

  if (!isStringOrNull(obj.precedingTransition)) {
    fail(`${loc}.precedingTransition`, "must be a string or null");
  }
  if (!isStringOrNull(obj.succeedingTransition)) {
    fail(`${loc}.succeedingTransition`, "must be a string or null");
  }

  if (!Array.isArray(obj.blocks)) fail(`${loc}.blocks`, "must be an array");

  return Object.freeze({
    id: obj.id,
    sceneNo: obj.sceneNo,
    heading: obj.heading,
    location: obj.location,
    interiorExterior: obj.interiorExterior as HandoffScene["interiorExterior"],
    timeOfDay: obj.timeOfDay,
    characters: Object.freeze(characters),
    continuityMode: obj.continuityMode as HandoffContinuityMode,
    precedingTransition: obj.precedingTransition,
    succeedingTransition: obj.succeedingTransition,
    blocks: Object.freeze(obj.blocks.map((b) => parseBlock(b, obj.id as string))),
  });
}

/**
 * 解析并校验输入，返回冻结的 ScreenplayHandoffV1。
 * 校验 scene id 唯一性。任何契约违例抛 ScreenplayHandoffError。
 */
export function parseScreenplayHandoffV1(input: ScreenplayHandoffInput): ScreenplayHandoffV1 {
  if (!input || typeof input !== "object") {
    fail("handoff", "input must be an object");
  }

  if (input.schemaVersion !== HANDOFF_SCHEMA_VERSION) {
    fail("schemaVersion", `must be ${HANDOFF_SCHEMA_VERSION}`);
  }

  if (!isNonEmptyString(input.projectId)) fail("projectId", "must be a non-empty string");
  if (!isNonEmptyString(input.universeId)) fail("universeId", "must be a non-empty string");
  if (!isNonEmptyString(input.episodeId)) fail("episodeId", "must be a non-empty string");
  if (!isPositiveInt(input.episodeNo)) fail("episodeNo", "must be a positive integer");
  if (!isNonEmptyString(input.episodeTitle)) fail("episodeTitle", "must be a non-empty string");
  if (!isNonEmptyString(input.sourceUnitId)) fail("sourceUnitId", "must be a non-empty string");
  if (!isNonEmptyString(input.sourceVersion)) fail("sourceVersion", "must be a non-empty string");
  if (!isNonEmptyString(input.sourceHash)) fail("sourceHash", "must be a non-empty string");

  if (input.aspectRatio !== HANDOFF_ASPECT_RATIO) {
    fail("aspectRatio", `must be ${HANDOFF_ASPECT_RATIO}`);
  }

  const validFormats = ["international_production", "hollywood_spec", "asian_production"];
  if (!validFormats.includes(input.screenplayFormat as string)) {
    fail("screenplayFormat", `must be one of ${validFormats.join(", ")}`);
  }
  if (!isNonEmptyString(input.screenplayLanguage)) fail("screenplayLanguage", "must be a non-empty string");
  if (!isNonEmptyString(input.dialogueLanguage)) fail("dialogueLanguage", "must be a non-empty string");

  const canonSnapshot = parseCanonSnapshot(input.canonSnapshot);

  if (!Array.isArray(input.scenes)) fail("scenes", "must be an array");
  if (input.scenes.length === 0) fail("scenes", "must contain at least one scene");

  const scenes = input.scenes.map((s, i) => parseScene(s, i));

  // scene id 唯一性
  const seenIds = new Set<string>();
  for (const scene of scenes) {
    if (seenIds.has(scene.id)) {
      fail("scenes", `duplicate scene id: ${scene.id}`);
    }
    seenIds.add(scene.id);
  }

  if (input.confirmedBy !== null && input.confirmedBy !== undefined) {
    if (!isNonEmptyString(input.confirmedBy)) fail("confirmedBy", "must be a non-empty string or null");
  }
  const confirmedBy = (input.confirmedBy as string | null) ?? null;

  if (!isNonEmptyString(input.createdAt)) fail("createdAt", "must be a non-empty string");

  return Object.freeze({
    schemaVersion: input.schemaVersion,
    projectId: input.projectId,
    universeId: input.universeId,
    episodeId: input.episodeId,
    episodeNo: input.episodeNo,
    episodeTitle: input.episodeTitle,
    sourceUnitId: input.sourceUnitId,
    sourceVersion: input.sourceVersion,
    sourceHash: input.sourceHash,
    aspectRatio: input.aspectRatio,
    screenplayFormat: input.screenplayFormat as ScreenplayHandoffV1["screenplayFormat"],
    screenplayLanguage: input.screenplayLanguage,
    dialogueLanguage: input.dialogueLanguage,
    canonSnapshot,
    scenes: Object.freeze(scenes),
    confirmedBy,
    createdAt: input.createdAt,
  } as ScreenplayHandoffV1);
}

/** 类型守卫。 */
export function isScreenplayHandoffV1(value: unknown): value is ScreenplayHandoffV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.isFrozen(value) &&
    (value as ScreenplayHandoffV1).schemaVersion === HANDOFF_SCHEMA_VERSION
  );
}
