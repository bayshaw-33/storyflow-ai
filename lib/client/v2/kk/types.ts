/**
 * KK 2.0 全局反馈层 - 领域类型契约
 *
 * KK 是反馈与交互层，不是独立主线：
 * - 推送任务关键消息（完成/失败/需确认）
 * - 推送待确认提醒（Change Proposal / Canon Check / 资产审核）
 * - 提供跳转动作（跳到对应页面，不代为确认）
 * - 三档播报频率 + 勿扰 / 临时静音
 *
 * KK 不承担：擅自修改 Canon、擅自确认生成结果、隐藏真实失败。
 * 所有消息必须是可读任务信息，不是拟人化聊天。
 */

/** 契约版本，与 Codex v2 契约对齐 */
export const CONTRACT_VERSION = "2.0.0-alpha.1";

/**
 * KK 消息类型
 * - task_*: 任务生命周期关键节点（对应 GenerationJob 状态机）
 * - proposal_pending: Change Proposal 待审（对应 pendingConfirmations）
 * - canon_check_result: Canon Check 结果
 * - asset_review: 待审核资产
 */
export type KkMessageType =
  | "task_completed"
  | "task_failed"
  | "task_needs_confirm"
  | "proposal_pending"
  | "canon_check_result"
  | "asset_review";

/** 严重性分级，决定图标与颜色 */
export type KkSeverity = "info" | "success" | "warning" | "error";

/**
 * 播报频率
 * - frequent: 每个状态变化都推
 * - key_only: 只推完成/失败/需确认（默认推荐）
 * - on_demand: 不自动推，用户主动打开 KK 才看
 */
export type KkFrequency = "frequent" | "key_only" | "on_demand";

/** 全部频率选项，用于遍历 */
export const ALL_FREQUENCIES: readonly KkFrequency[] = [
  "frequent",
  "key_only",
  "on_demand",
];

/** 全部消息类型，用于遍历 */
export const ALL_MESSAGE_TYPES: readonly KkMessageType[] = [
  "task_completed",
  "task_failed",
  "task_needs_confirm",
  "proposal_pending",
  "canon_check_result",
  "asset_review",
];

/** 全部严重性，用于遍历 */
export const ALL_SEVERITIES: readonly KkSeverity[] = [
  "info",
  "success",
  "warning",
  "error",
];

/**
 * 关键消息类型：key_only 频率下会自动播报的类型。
 * 即「完成/失败/需确认」三类需要用户关注的状态节点。
 */
export const KEY_MESSAGE_TYPES: readonly KkMessageType[] = [
  "task_completed",
  "task_failed",
  "task_needs_confirm",
  "proposal_pending",
];

/** KK 单条消息（可读任务信息，非拟人化聊天） */
export interface KkMessage {
  id: string;
  type: KkMessageType;
  title: string;
  /** 消息正文：可读的任务信息，包含任务名、状态、原因等 */
  body: string;
  severity: KkSeverity;
  createdAt: string;
  /** 跳转动作标签，如"查看结果"/"去确认" */
  actionLabel?: string;
  /** 跳转目标 URL，指向 /job-center 或对应结果页 */
  actionUrl?: string;
  /** 关联的任务中心任务 ID */
  relatedJobId?: string;
  /** 关联的 Change Proposal ID */
  relatedProposalId?: string;
  /** 是否已读 */
  read: boolean;
}

/** KK 用户设置 */
export interface KkSettings {
  /** 播报频率 */
  frequency: KkFrequency;
  /** 勿扰模式：开启后不弹通知，消息只在面板内累积 */
  doNotDisturb: boolean;
  /** 临时静音截止时间（ISO 字符串）；过期后恢复播报 */
  mutedUntil?: string | null;
}

/** KK 统计 */
export interface KkStats {
  total: number;
  unread: number;
  bySeverity: Record<KkSeverity, number>;
}

/** fixture / API 返回的数据集 */
export interface KkDataset {
  contractVersion: string;
  messages: KkMessage[];
  settings: KkSettings;
  stats: KkStats;
}

/** 校验 contract_version 是否匹配当前契约 */
export function assertContractVersion(version: string): void {
  if (version !== CONTRACT_VERSION) {
    throw new Error(
      `kk contract version mismatch: expected ${CONTRACT_VERSION}, got ${version}`,
    );
  }
}
