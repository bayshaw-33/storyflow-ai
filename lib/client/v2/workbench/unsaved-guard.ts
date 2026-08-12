// 未保存提醒纯函数。
// 规则：当 saveStatus 为 "unsaved" 或 "saving" 时，上下文切换（项目/Universe/阶段）需弹确认。
// "saving" 也提醒，因为切换可能丢失正在写入的数据。
// 全部为纯函数，便于 Node 测试直接导入。

import type { ContextSwitchType, SaveStatus } from "./types.ts";

// 判断当前保存状态是否需要在切换前提醒。
export function shouldWarnOnContextSwitch(saveStatus: SaveStatus): boolean {
  return saveStatus === "unsaved" || saveStatus === "saving";
}

// 获取上下文切换类型的展示标签。
export function getContextSwitchLabel(
  switchType: ContextSwitchType,
  locale: string,
): string {
  const isZh = locale === "zh-CN";
  if (switchType === "project") return isZh ? "项目" : "project";
  if (switchType === "universe") return isZh ? "Universe" : "universe";
  return isZh ? "阶段" : "stage";
}

// 获取保存状态的展示标签。
export function getSaveStatusLabel(saveStatus: SaveStatus, locale: string): string {
  const isZh = locale === "zh-CN";
  if (saveStatus === "saved") return isZh ? "已保存" : "Saved";
  if (saveStatus === "saving") return isZh ? "保存中" : "Saving";
  return isZh ? "未保存" : "Unsaved";
}

// 获取未保存提醒文案。
export function getUnsavedWarningMessage(
  saveStatus: SaveStatus,
  switchType: ContextSwitchType,
  locale: string,
): string {
  const isZh = locale === "zh-CN";
  const switchLabel = getContextSwitchLabel(switchType, locale);
  const statusLabel = getSaveStatusLabel(saveStatus, locale);
  if (isZh) {
    return `当前${statusLabel}，切换${switchLabel}可能丢失修改。是否继续？`;
  }
  return `You have ${statusLabel.toLowerCase()} changes. Switching ${switchLabel} may lose them. Continue?`;
}

// 判断是否允许强制切换（用户确认后）。
export function allowForceSwitch(userConfirmed: boolean): boolean {
  return userConfirmed === true;
}

// 判断两个上下文是否相同（相同则不需要切换，也不需要提醒）。
export function isSameContext(
  a: { projectId?: string; universeId?: string; stage?: string },
  b: { projectId?: string; universeId?: string; stage?: string },
): boolean {
  return a.projectId === b.projectId && a.universeId === b.universeId && a.stage === b.stage;
}
