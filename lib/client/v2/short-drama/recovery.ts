// localStorage 草稿持久化（中断恢复用，K2-T-08）。
//
// 关键约束：草稿仅本地，不伪装为已同步云端。cloudSynced 恒为 false。
// 浏览器无 localStorage（如嵌入 webview 禁用）时优雅降级，不影响 UI。
//
// 注意：本模块在 Node 测试环境运行时 localStorage 不存在，
// saveDraft/loadDraft 会走降级路径返回 null，测试用 mockLocalStorage 注入。

import type { ShortDramaDraft, ShortDramaStageId, ConfirmedAssets } from "./types.ts";
import { CONTRACT_VERSION } from "./types.ts";

// 草稿存储 key 前缀（按项目隔离）。
const DRAFT_KEY_PREFIX = "kiikis:v2:short-drama:draft:";

export function getDraftKey(projectId: string): string {
  return `${DRAFT_KEY_PREFIX}${projectId}`;
}

/**
 * 保存草稿到 localStorage。
 * cloudSynced 恒为 false：明确标记未同步云端。
 * 返回 true 表示保存成功，false 表示 localStorage 不可用。
 */
export function saveDraft(
  projectId: string,
  stage: ShortDramaStageId,
  confirmedAssets: ConfirmedAssets,
): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  const draft: ShortDramaDraft = {
    contractVersion: CONTRACT_VERSION,
    projectId,
    stage,
    confirmedAssets,
    savedAt: new Date().toISOString(),
    cloudSynced: false,
  };
  try {
    window.localStorage.setItem(getDraftKey(projectId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取草稿。返回 null 表示无草稿或 localStorage 不可用。
 * 不做 contract_version 校验：版本不匹配时返回 null 并清除过期草稿。
 */
export function loadDraft(projectId: string): ShortDramaDraft | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(getDraftKey(projectId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as ShortDramaDraft;
    if (draft.contractVersion !== CONTRACT_VERSION) {
      // 版本不匹配，清除过期草稿
      window.localStorage.removeItem(getDraftKey(projectId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

// 清除草稿（完成导出或用户主动丢弃时调用）。
export function clearDraft(projectId: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(getDraftKey(projectId));
  } catch {
    // 忽略
  }
}

// 判断草稿是否过期（超过 30 天视为过期）。
export function isDraftExpired(draft: ShortDramaDraft, maxAgeDays = 30): boolean {
  const savedAt = new Date(draft.savedAt).getTime();
  if (Number.isNaN(savedAt)) return true;
  const ageMs = Date.now() - savedAt;
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}
