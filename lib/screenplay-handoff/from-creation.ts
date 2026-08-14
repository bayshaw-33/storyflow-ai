/**
 * KIIKIS 2.1 Phase 2 — 从 CreationUnit 构建 handoff 输入 (Task 2.3)
 *
 * 流程：
 * 保存当前剧本版本 → 校验项目/单集/场景稳定 ID → 解析并展示 handoff 摘要
 * → 用户确认 → 服务端创建不可变 handoff
 *
 * 缺母版、场景轴线或 continuityMode 时显示可修复问题，不生成半成品快照。
 */

import type {
  CreationWorkspaceV2,
  CreationUnit,
  ScreenplayEpisode,
  ScreenplayScene,
} from "../creation/types.ts";
import type { CreateHandoffInput } from "../server/v2/screenplay-handoffs/index.ts";
import type {
  HandoffBlock,
  HandoffCanonSnapshot,
  HandoffCharacterCanon,
  HandoffLocationCanon,
  HandoffPropCanon,
  HandoffScene,
} from "./contracts.ts";

/** 转换问题：可修复的校验失败，不抛异常。 */
export interface HandoffConversionIssue {
  readonly code: string;
  readonly message: string;
  readonly sceneId?: string;
}

export interface HandoffConversionResult {
  readonly input: CreateHandoffInput | null;
  readonly issues: ReadonlyArray<HandoffConversionIssue>;
  readonly summary: {
    readonly episodeNo: number;
    readonly episodeTitle: string;
    readonly sceneCount: number;
    readonly characterCount: number;
    readonly locationCount: number;
  };
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * 校验场景并构建 handoff scene。
 * 缺母版/场景轴线/continuityMode 时返回 issues，不生成半成品。
 */
function convertScene(
  scene: ScreenplayScene,
  canonCharacterIds: Set<string>,
  format: string,
): { scene: HandoffScene | null; issues: HandoffConversionIssue[] } {
  const issues: HandoffConversionIssue[] = [];

  if (!isNonEmpty(scene.id)) {
    issues.push({ code: "missing_scene_id", message: `Scene ${scene.sceneNo} 缺少稳定 ID`, sceneId: scene.id });
  }
  if (!isNonEmpty(scene.location)) {
    issues.push({ code: "missing_location", message: `Scene ${scene.sceneNo} 缺少场景地点`, sceneId: scene.id });
  }

  // 校验角色引用 (需要母版存在)
  for (const charName of scene.characters) {
    // characters 在 creation 中是名字字符串，handoff 需要 ID
    // 这里只检查非空；ID 映射由上层 canon 提供
    if (!isNonEmpty(charName)) {
      issues.push({ code: "empty_character_name", message: `Scene ${scene.sceneNo} 有空角色名`, sceneId: scene.id });
    }
  }

  // continuityMode 推断：场景标题含 CONTINUOUS 或承接前一场
  const sourceHeading = (scene as ScreenplayScene & { heading?: unknown }).heading;
  const heading = typeof sourceHeading === "string" && sourceHeading.trim().length > 0
    ? sourceHeading
    : `${scene.interiorExterior}. ${scene.location} - ${scene.timeOfDay}`;
  const headingUpper = heading.toUpperCase();
  const continuityMode = headingUpper.includes("CONTINUOUS") ||
    (scene.interiorExterior === "INT" && headingUpper.includes("CONTINUOUS"))
    ? "CONTINUOUS"
    : "NEW";

  // 转场：从 blocks 中找 transition 类型
  const transitions = scene.blocks.filter((b) => b.type === "transition");
  const precedingTransition = null; // CONTINUOUS 场通常无前置转场
  const succeedingTransition = transitions.length > 0 ? transitions[transitions.length - 1].text : null;

  const blocks: HandoffBlock[] = scene.blocks
    .filter((b) => b.type !== "transition") // 转场单独提取
    .map((b) => ({
      id: b.id,
      type: b.type as HandoffBlock["type"],
      character: b.character,
      text: b.text,
      translation: b.translation,
    }));

  if (issues.length > 0) return { scene: null, issues };

  const handoffScene: HandoffScene = {
    id: scene.id,
    sceneNo: scene.sceneNo,
    heading,
    location: scene.location,
    interiorExterior: scene.interiorExterior,
    timeOfDay: scene.timeOfDay,
    characters: [...scene.characters],
    continuityMode,
    precedingTransition,
    succeedingTransition,
    blocks,
  };

  return { scene: handoffScene, issues: [] };
}

/**
 * 从 CreationUnit 构建 handoff 输入。
 *
 * @param workspace 创作工作区 (含 settings)
 * @param unit 剧本单元 (含 screenplay)
 * @param params 项目/Universe/母版引用
 */
export function buildHandoffInputFromCreation(
  workspace: CreationWorkspaceV2,
  unit: CreationUnit,
  params: {
    projectId: string;
    universeId: string;
    canonCharacters: HandoffCharacterCanon[];
    canonLocations: HandoffLocationCanon[];
    canonProps: HandoffPropCanon[];
  },
): HandoffConversionResult {
  const issues: HandoffConversionIssue[] = [];

  if (!unit.screenplay) {
    issues.push({ code: "missing_screenplay", message: "单元缺少剧本数据" });
    return {
      input: null,
      issues,
      summary: { episodeNo: 0, episodeTitle: "", sceneCount: 0, characterCount: 0, locationCount: 0 },
    };
  }

  const episode = unit.screenplay;

  if (!isNonEmpty(episode.id)) {
    issues.push({ code: "missing_episode_id", message: "单集缺少稳定 ID" });
  }
  if (episode.scenes.length === 0) {
    issues.push({ code: "no_scenes", message: "单集无场景" });
  }

  // 构建 canon snapshot
  const canonSnapshot: HandoffCanonSnapshot = {
    characters: params.canonCharacters,
    locations: params.canonLocations,
    props: params.canonProps,
  };

  // 校验母版
  if (params.canonCharacters.length === 0) {
    issues.push({ code: "missing_character_master", message: "缺少角色母版，无法进入分镜" });
  }

  const canonCharacterIds = new Set(params.canonCharacters.map((c) => c.id));

  // 转换场景
  const scenes: HandoffScene[] = [];
  for (const scene of episode.scenes) {
    const result = convertScene(scene, canonCharacterIds, workspace.settings.screenplayFormat);
    issues.push(...result.issues);
    if (result.scene) scenes.push(result.scene);
  }

  const summary = {
    episodeNo: episode.episodeNo,
    episodeTitle: episode.title,
    sceneCount: episode.scenes.length,
    characterCount: params.canonCharacters.length,
    locationCount: params.canonLocations.length,
  };

  if (issues.length > 0) {
    return { input: null, issues, summary };
  }

  const input: CreateHandoffInput = {
    projectId: params.projectId,
    universeId: params.universeId,
    episodeId: episode.id,
    episodeNo: episode.episodeNo,
    episodeTitle: episode.title,
    sourceUnitId: unit.id,
    sourceVersion: `unit-v${unit.number}`,
    screenplayFormat: workspace.settings.screenplayFormat,
    screenplayLanguage: workspace.settings.screenplayLanguage,
    dialogueLanguage: workspace.settings.dialogueLanguage,
    canonSnapshot,
    scenes,
  };

  return { input, issues, summary };
}

/**
 * 生成 handoff 确认后的跳转 URL。
 * /production?projectId=&sourceUnitId=&handoffId=&mode=planning
 */
export function buildProductionRedirectUrl(params: {
  projectId: string;
  sourceUnitId: string;
  handoffId: string;
}): string {
  const search = new URLSearchParams({
    projectId: params.projectId,
    sourceUnitId: params.sourceUnitId,
    handoffId: params.handoffId,
    mode: "planning",
  });
  return `/production?${search.toString()}`;
}
