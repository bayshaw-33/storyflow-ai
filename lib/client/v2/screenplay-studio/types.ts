/**
 * KIIKIS V2.2 Screenplay Studio client types — Phase 3 Task 3.3.
 *
 * Existing units remain openable for revision, while new downstream work
 * waits for user-confirmed usable checkpoints.
 */

import type { ScreenplayUnitType } from "../../../contracts/v2/screenplay-studio.ts";
import { buildUnifiedWorkbenchUrl } from "../../../contracts/v2/unified-workbench.ts";

// ---------------------------------------------------------------------------
// Left navigator groups (stable order)
// ---------------------------------------------------------------------------

export interface StudioNavGroup {
  id: "world" | "character" | "outline" | "episode" | "scene";
  label: string;
  types: ScreenplayUnitType[];
}

export const SCREENPLAY_STUDIO_NAV_GROUPS: StudioNavGroup[] = [
  { id: "world", label: "世界观", types: ["world"] },
  { id: "character", label: "角色圣经", types: ["character"] },
  { id: "outline", label: "剧情及大纲", types: ["outline"] },
  { id: "episode", label: "分集计划", types: ["episode"] },
  { id: "scene", label: "剧本正文（场）", types: ["scene"] },
];

export interface StudioWorkflowStage {
  id: "world" | "character" | "outline" | "similarity" | "episode" | "screenplay" | "localization" | "delivery";
  label: string;
  description: string;
  parent?: "outline";
}

/** Visible screenplay workflow; similarity review is part of the outline. */
export const SCREENPLAY_STUDIO_WORKFLOW_STAGES: StudioWorkflowStage[] = [
  { id: "world", label: "世界观", description: "建立故事世界的规则、边界与核心冲突。" },
  { id: "character", label: "角色圣经", description: "确认角色身份、欲望、关系与成长轨迹。" },
  { id: "outline", label: "剧情及大纲", description: "确定故事主线、分集节奏与关键转折。" },
  { id: "similarity", label: "雷同审查", description: "在进入正文前标出相似风险并留下原创化处置记录。", parent: "outline" },
  { id: "episode", label: "分集计划", description: "把可用大纲拆成可写作的集级目标。" },
  { id: "screenplay", label: "剧本正文", description: "以 AI 对话为主导逐场推进，修改先审阅后采用。" },
  { id: "localization", label: "本土化", description: "针对目标地区调整表达、语境和表演可执行性。" },
  { id: "delivery", label: "定稿与留痕", description: "导出样稿格式剧本与完整创作证据。" },
];

export const similarityReviewBelongsTo = "outline" as const;

export const NAV_GROUP_OF_TYPE: Record<ScreenplayUnitType, StudioNavGroup["id"]> = {
  world: "world",
  character: "character",
  outline: "outline",
  episode: "episode",
  scene: "scene",
};

// ---------------------------------------------------------------------------
// Right panel tabs
// ---------------------------------------------------------------------------

export const SCREENPLAY_STUDIO_RIGHT_PANEL_TABS = ["kk", "references", "versions", "continuity"] as const;
export type StudioRightPanelTab = (typeof SCREENPLAY_STUDIO_RIGHT_PANEL_TABS)[number];

// ---------------------------------------------------------------------------
// Layout contract
// ---------------------------------------------------------------------------

export const STUDIO_LAYOUT = {
  desktopColumns: 2,
  narrowBehavior: "drawers",
  breakpoints: [390, 768, 1440, 2560],
} as const;

// ---------------------------------------------------------------------------
// URL state: ?workId=&unitId= restores the writing location
// ---------------------------------------------------------------------------

export interface StudioUrlState {
  projectId?: string | null;
  workId: string | null;
  unitId: string | null;
}

export function buildStudioUrl(state: StudioUrlState): string {
  if (state.projectId) {
    return buildUnifiedWorkbenchUrl({
      projectId: state.projectId,
      workId: state.workId,
      tab: "script",
      unitId: state.unitId,
    });
  }

  const params = new URLSearchParams({ tab: "script" });
  if (state.workId) params.set("workId", state.workId);
  if (state.unitId) params.set("unitId", state.unitId);
  return `/production?${params.toString()}`;
}

export function parseStudioUrl(search: string | null | undefined): StudioUrlState {
  if (!search) return { workId: null, unitId: null };
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const workId = params.get("workId");
  const unitId = params.get("unitId");
  return { workId: workId || null, unitId: unitId || null };
}

// ---------------------------------------------------------------------------
// Revision navigation & downstream creation gates
// ---------------------------------------------------------------------------

/**
 * Any unit is openable. Upstream finalized/readiness/dependencyState never
 * blocks opening — this function exists so the intent is explicit and
 * testable, and so a future regression to linear gates shows up in tests.
 */
export function canOpenUnit(unit: {
  type: ScreenplayUnitType;
  readiness: string;
  dependencyState: string;
}): boolean {
  void unit;
  return true;
}

export interface UnitCheckpointLike {
  type: ScreenplayUnitType | string;
  readiness: string;
  finalizedVersionId?: string | null;
}

export function isUsableCheckpoint(unit: Pick<UnitCheckpointLike, "readiness" | "finalizedVersionId">): boolean {
  return unit.readiness === "checkpoint" || (unit.readiness === "finalized" && Boolean(unit.finalizedVersionId));
}

/** Existing units may be opened/revised; only new downstream units are gated. */
export function canCreateUnit(type: ScreenplayUnitType, units: UnitCheckpointLike[]): boolean {
  const hasUsable = (unitType: ScreenplayUnitType) => units.some((unit) => unit.type === unitType && isUsableCheckpoint(unit));
  if (type === "world") return true;
  if (type === "character") return hasUsable("world");
  if (type === "outline") return hasUsable("world") && hasUsable("character");
  if (type === "episode") return hasUsable("world") && hasUsable("character") && hasUsable("outline");
  return hasUsable("world") && hasUsable("character") && hasUsable("outline") && hasUsable("episode");
}

/** Formal actions that consume explicitly Finalized versions. */
export const FORMAL_ACTIONS = [
  "batch_production",
  "publish",
  "license",
  "official_delivery",
] as const;
export type FormalAction = (typeof FORMAL_ACTIONS)[number];

export function formalActionRequiresFinalized(action: string): boolean {
  return (FORMAL_ACTIONS as readonly string[]).includes(action);
}

// ---------------------------------------------------------------------------
// KK two-action semantics — Phase 3 Task 3.4
// ---------------------------------------------------------------------------

export const KK_ACTION_MODES = ["discuss", "propose_change"] as const;
export type KkActionMode = (typeof KK_ACTION_MODES)[number];

const DISCUSS_INTENTS = ["聊一聊", "讨论", "聊聊", "参谋"];
const PROPOSE_INTENTS = ["生成修改方案", "帮我改", "改一版", "提出修改"];

export function resolveKkActionMode(intent: string): KkActionMode {
  if (PROPOSE_INTENTS.some((k) => intent.includes(k))) return "propose_change";
  if (DISCUSS_INTENTS.some((k) => intent.includes(k))) return "discuss";
  return "discuss"; // default: never silently rewrite content
}

export interface CandidatePatchClient {
  unitPath: string;
  before: string;
  after: string;
}

export interface CandidateDiffInput {
  id: string;
  status: string;
  patches: CandidatePatchClient[];
  error?: string;
}

export interface CandidateDiffHunk extends CandidatePatchClient {
  accepted: boolean;
}

export interface CandidateDiffViewModel {
  id: string;
  status: string;
  hunks: CandidateDiffHunk[];
  anyAccepted: boolean;
  allAccepted: boolean;
  persisted: boolean;
  canRetry: boolean;
  inputPreserved: boolean;
}

export function createCandidateDiffViewModel(input: CandidateDiffInput): CandidateDiffViewModel {
  const failed = input.status === "failed";
  return {
    id: input.id,
    status: input.status,
    hunks: input.patches.map((p) => ({ ...p, accepted: false })),
    anyAccepted: false,
    allAccepted: input.patches.length > 0 && input.patches.every(() => false),
    persisted: false,
    canRetry: failed,
    inputPreserved: true,
  };
}

export function nextDiffReviewState(vm: CandidateDiffViewModel, hunkIndex: number, accepted: boolean): CandidateDiffViewModel {
  const hunks = vm.hunks.map((h, i) => (i === hunkIndex ? { ...h, accepted } : h));
  return {
    ...vm,
    hunks,
    anyAccepted: hunks.some((h) => h.accepted),
    allAccepted: hunks.length > 0 && hunks.every((h) => h.accepted),
    // reviewing is UI-only; persistence still requires explicit apply
    persisted: false,
  };
}

/** Draft try-outs never block: they auto-freeze a source Checkpoint. */
export function draftTryoutPolicy(action: string): { blocked: boolean; autoFreeze: "checkpoint" | null } {
  const tryouts = ["art_tryout", "storyboard_tryout", "voice_tryout"];
  if (tryouts.includes(action)) return { blocked: false, autoFreeze: "checkpoint" };
  return { blocked: false, autoFreeze: null };
}

/** Empty units show focused suggestions; 继续创作 always stays available. */
export function emptyUnitSuggestion(type: ScreenplayUnitType): { hints: string[]; canContinue: true } {
  const hints: Record<ScreenplayUnitType, string[]> = {
    world: ["用一句话写下世界的核心冲突", "列出这个世界不可违背的三条规则", "从结局倒推世界观如何改变人物选择"],
    character: ["写清主角的欲望、恐惧与代价", "为关键角色补一条关系张力", "让每个角色拥有可验证的行动动机"],
    outline: ["列出主线的关键转折", "标出中段反转与结局兑现", "先做雷同审查，再决定哪些表达需要原创化"],
    episode: ["写出本集的开场钩子", "确定本集结束时观众的情绪", "为本集列出三到五个必须完成的剧情动作"],
    scene: ["描述地点、时间、在场角色", "写下这场戏的最后一句台词", "确定动作、冲突与下一场的转场接口"],
  };
  return { hints: hints[type], canContinue: true };
}
