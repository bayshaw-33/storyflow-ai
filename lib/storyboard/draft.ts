/**
 * 分镜制作台作用域草稿存储
 *
 * 任务卡：KIIKIS-P1-TRAE-002 §2 BLOCKER 3 / §4
 *
 * 草稿 key 格式：
 *   kiikis:storyboard:v1:<userId|anon>:<projectId>:<sourceUnitId>
 *
 * 规则：
 *   - 必须绑定 projectId + sourceUnitId，不允许全局 fallback
 *   - userId 未登录时使用 "anon" 占位
 *   - 跨项目 / 跨集 handoff 一律拒绝
 *
 * 禁止使用旧 key：
 *   - kiikis_production_workbench_state（全局单一 key，多项目互相覆盖）
 */

import type { ProductionProjectState } from "@/lib/production/types";

const DRAFT_KEY_PREFIX = "kiikis:storyboard:v1";
const ANON_USER = "anon";

export interface StoryboardDraftScope {
  userId: string | null;
  projectId: string;
  sourceUnitId: string;
}

export function buildDraftKey(scope: StoryboardDraftScope): string {
  const userSegment = scope.userId || ANON_USER;
  return `${DRAFT_KEY_PREFIX}:${userSegment}:${scope.projectId}:${scope.sourceUnitId}`;
}

/**
 * 读取当前项目 + 当前集 的本地草稿。
 * scope 不完整（projectId 或 sourceUnitId 缺失）时返回 null。
 */
export function readStoryboardDraft(scope: StoryboardDraftScope): Partial<ProductionProjectState> | null {
  if (!scope.projectId || !scope.sourceUnitId) return null;
  try {
    const storage = typeof window !== "undefined" ? window.localStorage : undefined;
    if (!storage) return null;
    const raw = storage.getItem(buildDraftKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProductionProjectState>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 写入当前项目 + 当前集 的本地草稿。
 * scope 不完整时静默跳过（不写入全局 fallback）。
 */
export function writeStoryboardDraft(scope: StoryboardDraftScope, state: ProductionProjectState): void {
  if (!scope.projectId || !scope.sourceUnitId) return;
  // PRD §6.2: localStorage 写入失败必须抛出，让调用方在通知区域显示错误（不得空 catch）
  const storage = typeof window !== "undefined" ? window.localStorage : undefined;
  if (!storage) throw new Error("本地存储不可用（localStorage 未初始化）");
  storage.setItem(buildDraftKey(scope), JSON.stringify(state));
}

/**
 * 清空当前作用域草稿（仅手动操作触发，自动保存不得调用）。
 */
export function clearStoryboardDraft(scope: StoryboardDraftScope): void {
  if (!scope.projectId || !scope.sourceUnitId) return;
  try {
    window.localStorage.removeItem(buildDraftKey(scope));
  } catch {
    // 静默忽略
  }
}

/**
 * 列出当前用户的所有作用域草稿（用于"我的草稿"下拉）。
 * 返回 [{ key, scope, savedAt, title }] 列表，按 savedAt 倒序。
 */
export interface StoryboardDraftIndexEntry {
  key: string;
  scope: StoryboardDraftScope;
  savedAt: string;
  title: string;
}

export function listStoryboardDrafts(userId: string | null): StoryboardDraftIndexEntry[] {
  const userSegment = userId || ANON_USER;
  const prefix = `${DRAFT_KEY_PREFIX}:${userSegment}:`;
  const entries: StoryboardDraftIndexEntry[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const parts = key.split(":");
      // 期待格式 kiikis:storyboard:v1:<user>:<projectId>:<sourceUnitId>
      if (parts.length < 5) continue;
      const projectId = parts[3];
      const sourceUnitId = parts[4];
      if (!projectId || !sourceUnitId) continue;
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Partial<ProductionProjectState>;
        entries.push({
          key,
          scope: { userId, projectId, sourceUnitId },
          savedAt: parsed.updatedAt || new Date(0).toISOString(),
          title: parsed.title || projectId,
        });
      } catch {
        // 跳过损坏的草稿
      }
    }
  } catch {
    // localStorage 不可用
  }
  return entries.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}
