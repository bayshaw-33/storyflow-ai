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

// ============================================================
// KIIKIS 2.1 Phase 3 — KK runtime 契约 (K21-KK-001..007, 010..014, 020..024)
// ============================================================

/**
 * KK 连接状态机 (K21-KK-003/004)。
 * connecting → live → (断线) → reconnecting → (失败 N 次) → polling → (长时间) → offline
 */
export type KkConnectionState =
  | "connecting"
  | "live"
  | "reconnecting"
  | "polling"
  | "offline";

export const ALL_KK_CONNECTION_STATES: readonly KkConnectionState[] = [
  "connecting",
  "live",
  "reconnecting",
  "polling",
  "offline",
];

/**
 * KK 允许的 action (K21-KK-006)。
 * 复用统一目标解析器 + 服务端 action。
 */
export const ALL_KK_ACTIONS = [
  "open_task",          // 跳转到任务
  "open_project",       // 跳转到项目
  "open_universe",      // 跳转到 Universe
  "propose_action",    // 提议高风险动作 (K21-KK-012)
  "confirm_action",    // 确认高风险动作
  "cancel_action",     // 取消高风险动作
  "equip_item",        // 装备外观 (K21-KK-022)
  "unequip_item",      // 卸下外观
  "update_profile",    // 更新档案 (K21-KK-020)
  "update_privacy",    // 更新隐私 (K21-KK-022)
  "export_memory",    // 导出记忆 (K21-KK-014)
  "delete_memory",     // 删除记忆 (K21-KK-014)
] as const;
export type KkActionId = (typeof ALL_KK_ACTIONS)[number];

/** 类型守卫：字符串是否为合法 KkActionId */
export function isKkAction(value: string): value is KkActionId {
  return (ALL_KK_ACTIONS as readonly string[]).includes(value);
}

/**
 * KK 任务投影 (K21-KK-005)。
 * 只显示服务端可验证的真实进度；不可量化任务只显示阶段。
 */
export interface KkTaskProjection {
  readonly queued: number;
  readonly running: number;
  readonly ingesting: number;
  readonly completed: number;
  readonly failed: number;
}

/**
 * KK 待确认 (K21-KK-012)。
 */
export interface KkPendingConfirmation {
  readonly actionId: string;
  readonly actionType: string;
  readonly summary: string;
  readonly expiresAt: string;
}

/**
 * KK runtime 启动响应 (GET /api/v2/kk)。
 */
export interface KkRuntimeResponse {
  readonly contractVersion: string;
  readonly profile: unknown;
  readonly entitlements: ReadonlyArray<unknown>;
  readonly serverCursor: number;
  readonly taskProjection: KkTaskProjection;
  readonly pendingConfirmations: ReadonlyArray<KkPendingConfirmation>;
  readonly allowedActions: ReadonlyArray<KkActionId>;
  readonly featureFlags: unknown;
  readonly source: "api" | "fixture";
}

/**
 * KK 事件流 entry (K21-KK-003)。
 * 从 GET /api/v2/kk/events?afterSequence=N 获取增量事件。
 */
export interface KkEventEntry {
  readonly id: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly taskId: string | null;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
