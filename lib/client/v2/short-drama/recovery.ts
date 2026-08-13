// localStorage 草稿持久化（中断恢复用，K2-T-08）。
//
// 关键约束：草稿仅本地，不伪装为已同步云端。cloudSynced 恒为 false。
// 浏览器无 localStorage（如嵌入 webview 禁用）时优雅降级，不影响 UI。
//
// 注意：本模块在 Node 测试环境运行时 localStorage 不存在，
// saveDraft/loadDraft 会走降级路径返回 null，测试用 mockLocalStorage 注入。
//
// K2-I-03 增强：
// - 草稿新增可选 snapshotId 字段，记录关联的继承快照 id（保持向后兼容）。
// - 新增 loadDraftWithSnapshot：恢复时优先尝试云端快照，失败回退本地草稿。
//   云端快照不写入 localStorage（仍由 Codex 持有），草稿 cloudSynced 仍为 false。

import type {
  ConfirmedAssets,
  InheritanceSnapshotBundle,
  ShortDramaDraft,
  ShortDramaStageId,
} from "./types.ts";
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
 *
 * @param snapshotId 可选：关联的继承快照 id（若草稿基于云端快照生成）。缺失时草稿 snapshotId=null。
 */
export function saveDraft(
  projectId: string,
  stage: ShortDramaStageId,
  confirmedAssets: ConfirmedAssets,
  snapshotId?: string | null,
): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  const draft: ShortDramaDraft = {
    contractVersion: CONTRACT_VERSION,
    projectId,
    stage,
    confirmedAssets,
    savedAt: new Date().toISOString(),
    cloudSynced: false,
    // 显式记录 snapshotId：null 表示该草稿未关联云端快照（与旧版草稿无此字段等价）。
    snapshotId: snapshotId ?? null,
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
 *
 * 向后兼容：旧草稿无 snapshotId 字段时，返回的 draft.snapshotId 为 undefined（不影响调用方）。
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

// ─── K2-I-03：云端快照优先恢复 ───

// 恢复来源：cloud=云端快照成功；local=本地草稿；none=两者皆无。
export type RecoverySource = "cloud" | "local" | "none";

// loadDraftWithSnapshot 返回结构。
export interface DraftWithSnapshotResult {
  // 本地草稿（可能为 null：localStorage 不可用或无草稿）。
  draft: ShortDramaDraft | null;
  // 云端快照（可能为 null：fetchSnapshot 未提供或调用失败）。
  snapshot: InheritanceSnapshotBundle | null;
  // 实际恢复来源。
  source: RecoverySource;
}

/**
 * 恢复时优先尝试云端快照，失败回退本地草稿。
 *
 * 行为：
 * 1. 若 fetchSnapshot 提供，先 await 调用：
 *    - 返回非 null 快照 → source="cloud"，返回 { snapshot, draft: loadDraft(projectId) }
 *      （同时返回本地草稿供调用方参考，但 source 标记为 cloud）
 *    - 抛错或返回 null → 进入步骤 2
 * 2. 回退本地草稿：loadDraft(projectId)
 *    - 草稿存在 → source="local"
 *    - 草稿不存在 → source="none"
 *
 * 关键约束：
 * - 云端快照成功不会改写本地草稿（草稿 cloudSynced 仍为 false）
 * - 调用方拿到 cloud 快照后，应基于 buildScriptCandidatesFromSnapshot 重建状态，
 *   而非信任本地草稿的 confirmedAssets
 *
 * @param fetchSnapshot 异步回调：返回 InheritanceSnapshotBundle 或抛错。通常由 api.ts 的 createSnapshot/diffSnapshot 提供。
 */
export async function loadDraftWithSnapshot(
  projectId: string,
  fetchSnapshot?: () => Promise<InheritanceSnapshotBundle | null>,
): Promise<DraftWithSnapshotResult> {
  // 1. 先尝试云端快照
  if (fetchSnapshot) {
    try {
      const snapshot = await fetchSnapshot();
      if (snapshot) {
        // 云端快照成功：同时返回本地草稿（供参考），但 source 标记为 cloud。
        return {
          snapshot,
          draft: loadDraft(projectId),
          source: "cloud",
        };
      }
    } catch {
      // 云端快照失败（401/404/网络等），静默回退本地草稿。
    }
  }
  // 2. 回退本地草稿
  const draft = loadDraft(projectId);
  return {
    snapshot: null,
    draft,
    source: draft ? "local" : "none",
  };
}
