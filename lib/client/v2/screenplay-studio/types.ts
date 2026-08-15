/**
 * KIIKIS V2.2 Screenplay Studio client types — Phase 3 Task 3.3.
 *
 * Free navigation contracts: any unit is openable regardless of upstream
 * readiness; only formal actions check Finalized; draft try-outs auto-freeze
 * a source Checkpoint instead of blocking.
 */

import type { ScreenplayUnitType } from "../../../contracts/v2/screenplay-studio.ts";

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
  { id: "character", label: "角色", types: ["character"] },
  { id: "outline", label: "大纲", types: ["outline"] },
  { id: "episode", label: "分集", types: ["episode"] },
  { id: "scene", label: "正文（场）", types: ["scene"] },
];

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
  desktopColumns: 3,
  narrowBehavior: "drawers",
  breakpoints: [390, 768, 1440, 2560],
} as const;

// ---------------------------------------------------------------------------
// URL state: ?workId=&unitId= restores the writing location
// ---------------------------------------------------------------------------

export interface StudioUrlState {
  workId: string | null;
  unitId: string | null;
}

export function buildStudioUrl(state: StudioUrlState): string {
  const params = new URLSearchParams();
  if (state.workId) params.set("workId", state.workId);
  if (state.unitId) params.set("unitId", state.unitId);
  const query = params.toString();
  return query ? `/script-workbench?${query}` : "/script-workbench";
}

export function parseStudioUrl(search: string | null | undefined): StudioUrlState {
  if (!search) return { workId: null, unitId: null };
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const workId = params.get("workId");
  const unitId = params.get("unitId");
  return { workId: workId || null, unitId: unitId || null };
}

// ---------------------------------------------------------------------------
// Free navigation & soft gates
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

/** Draft try-outs never block: they auto-freeze a source Checkpoint. */
export function draftTryoutPolicy(action: string): { blocked: boolean; autoFreeze: "checkpoint" | null } {
  const tryouts = ["art_tryout", "storyboard_tryout", "voice_tryout"];
  if (tryouts.includes(action)) return { blocked: false, autoFreeze: "checkpoint" };
  return { blocked: false, autoFreeze: null };
}

/** Empty units show suggestions; 继续创作 always stays available. */
export function emptyUnitSuggestion(type: ScreenplayUnitType): { hints: string[]; canContinue: true } {
  const hints: Record<ScreenplayUnitType, string[]> = {
    world: ["用一句话写下世界的核心冲突", "从结局倒推世界观规则", "稍后再写也行，直接开始第一场"],
    character: ["先写主角的一个缺点", "给反派一个合理动机", "可以边写正文边补角色"],
    outline: ["列出三幕结构的关键转折", "先写第一集想完成的件事", "跳过大纲直接写场也可以"],
    episode: ["写出本集的开场钩子", "确定本集结束时观众的情绪", "先写你觉得最容易的一场"],
    scene: ["描述地点、时间、在场角色", "写下这场戏的最后一句台词", "直接开写，写完再改"],
  };
  return { hints: hints[type], canContinue: true };
}
