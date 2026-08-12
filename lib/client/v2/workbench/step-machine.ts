// 步骤导航状态机纯函数。
// 状态：completed | current | locked | available
// 规则：
// - 同一时间最多一个 current
// - locked 步骤不可直接进入，需等前置完成
// - available 步骤可自由进入
// - completed 步骤可回看
// 全部为纯函数，不依赖 DOM / fetch，便于 Node 测试直接导入。

import type { StepStatus, WorkbenchStep } from "./types.ts";

export const STEP_STATUSES: StepStatus[] = ["completed", "current", "locked", "available"];

// 可导航的状态：completed 可回看，available 可进入，current 已在当前。
export const NAVIGABLE_STATUSES: StepStatus[] = ["completed", "current", "available"];

/**
 * 校验步骤列表状态机一致性：
 * - 至少一个步骤
 * - 最多一个 current
 * - locked 步骤之前不能全部是 completed（否则没有理由锁定）
 */
export function validateStepStates(steps: WorkbenchStep[]): {
  valid: boolean;
  reason?: string;
} {
  if (steps.length === 0) {
    return { valid: false, reason: "steps_empty" };
  }
  const currentCount = steps.filter((s) => s.status === "current").length;
  if (currentCount > 1) {
    return { valid: false, reason: "multiple_current" };
  }
  // locked 步骤之前不能全部是 completed（否则锁定无意义）
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].status === "locked") {
      const before = steps.slice(0, i);
      const allCompleted = before.length > 0 && before.every((s) => s.status === "completed");
      if (allCompleted) {
        return { valid: false, reason: "locked_after_all_completed" };
      }
    }
  }
  return { valid: true };
}

// 判断是否可导航到目标步骤。
export function canNavigateToStep(steps: WorkbenchStep[], targetId: string): boolean {
  const target = steps.find((s) => s.id === targetId);
  if (!target) return false;
  return NAVIGABLE_STATUSES.includes(target.status);
}

// 获取导航被拒原因（供 UI 提示）。
export function getNavigationDenialReason(
  steps: WorkbenchStep[],
  targetId: string,
  locale: string,
): string | null {
  const target = steps.find((s) => s.id === targetId);
  if (!target) return null;
  if (target.status === "locked") {
    return locale === "zh-CN"
      ? "该步骤尚未解锁，请先完成前置步骤。"
      : "This step is locked. Complete previous steps first.";
  }
  return null;
}

// 获取当前步骤。
export function getCurrentStep(steps: WorkbenchStep[]): WorkbenchStep | null {
  return steps.find((s) => s.status === "current") ?? null;
}

// 按状态查找步骤。
export function findStepByStatus(steps: WorkbenchStep[], status: StepStatus): WorkbenchStep[] {
  return steps.filter((s) => s.status === status);
}

// 计算步骤进度统计。
export function getStepProgress(steps: WorkbenchStep[]): {
  total: number;
  completed: number;
  current: number;
  locked: number;
  available: number;
} {
  return {
    total: steps.length,
    completed: steps.filter((s) => s.status === "completed").length,
    current: steps.filter((s) => s.status === "current").length,
    locked: steps.filter((s) => s.status === "locked").length,
    available: steps.filter((s) => s.status === "available").length,
  };
}
