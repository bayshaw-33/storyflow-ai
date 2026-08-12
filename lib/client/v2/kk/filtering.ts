/**
 * KK 反馈层纯函数：频率过滤、勿扰判断、统计。
 *
 * 全部为纯函数，不依赖 DOM / fetch / JSON import，便于 Node 测试直接导入。
 *
 * 核心原则：
 * - KK 不替用户做决定：过滤只决定"是否弹通知"，不会删除或篡改消息
 * - 勿扰/静音不丢弃消息：消息始终入队，只是不弹通知
 * - on_demand 不自动推：但用户打开面板仍可看到全部消息
 */
import {
  ALL_SEVERITIES,
  KEY_MESSAGE_TYPES,
  type KkFrequency,
  type KkMessage,
  type KkSettings,
  type KkSeverity,
  type KkStats,
} from "./types.ts";

/**
 * 判断是否为关键消息（key_only 频率下会自动播报）。
 * 规则：类型属于关键类型（完成/失败/需确认/提案待审），
 * 或严重性为 error/warning（需用户关注）。
 */
export function isKeyMessage(message: KkMessage): boolean {
  if (KEY_MESSAGE_TYPES.includes(message.type)) return true;
  if (message.severity === "error" || message.severity === "warning") return true;
  return false;
}

/**
 * 按频率过滤出"应自动播报"的消息。
 * - frequent: 全部消息都推
 * - key_only: 只推关键消息
 * - on_demand: 不自动推（返回空数组）
 *
 * 注意：返回空数组不代表消息被丢弃，面板仍展示全部消息。
 */
export function filterNotifiableByFrequency(
  messages: readonly KkMessage[],
  frequency: KkFrequency,
): KkMessage[] {
  switch (frequency) {
    case "frequent":
      return [...messages];
    case "key_only":
      return messages.filter(isKeyMessage);
    case "on_demand":
      return [];
    default:
      return [];
  }
}

/**
 * 判断当前是否处于临时静音期。
 * mutedUntil 为空或已过期返回 false。
 */
export function isMuted(settings: KkSettings, now: Date = new Date()): boolean {
  if (!settings.mutedUntil) return false;
  const until = new Date(settings.mutedUntil).getTime();
  if (!Number.isFinite(until)) return false;
  return until > now.getTime();
}

/**
 * 判断单条消息是否应该弹出通知。
 * 综合频率过滤 + 勿扰 + 临时静音。
 *
 * 勿扰/静音时返回 false，但消息仍会进入面板列表（不入队丢弃）。
 */
export function shouldNotify(
  message: KkMessage,
  settings: KkSettings,
  now: Date = new Date(),
): boolean {
  if (settings.doNotDisturb) return false;
  if (isMuted(settings, now)) return false;
  const notifiable = filterNotifiableByFrequency([message], settings.frequency);
  return notifiable.length > 0;
}

/**
 * 从全部消息中筛出应弹通知的消息。
 * 用于推送通知列表（面板内仍展示全部消息）。
 */
export function filterNotifiable(
  messages: readonly KkMessage[],
  settings: KkSettings,
  now: Date = new Date(),
): KkMessage[] {
  if (settings.doNotDisturb) return [];
  if (isMuted(settings, now)) return [];
  return filterNotifiableByFrequency(messages, settings.frequency);
}

/** 计算统计：total / unread / bySeverity */
export function computeStats(messages: readonly KkMessage[]): KkStats {
  const bySeverity = {} as Record<KkSeverity, number>;
  for (const sev of ALL_SEVERITIES) bySeverity[sev] = 0;
  let unread = 0;
  for (const msg of messages) {
    if (bySeverity[msg.severity] !== undefined) {
      bySeverity[msg.severity] += 1;
    }
    if (!msg.read) unread += 1;
  }
  return {
    total: messages.length,
    unread,
    bySeverity,
  };
}

/** 频率中文标签 */
export const FREQUENCY_LABELS_ZH: Record<KkFrequency, string> = {
  frequent: "频繁播报",
  key_only: "关键节点",
  on_demand: "仅询问时",
};

/** 频率英文标签 */
export const FREQUENCY_LABELS_EN: Record<KkFrequency, string> = {
  frequent: "Frequent",
  key_only: "Key only",
  on_demand: "On demand",
};

export function frequencyLabel(frequency: KkFrequency, locale: string): string {
  return locale === "zh-CN"
    ? FREQUENCY_LABELS_ZH[frequency]
    : FREQUENCY_LABELS_EN[frequency];
}

/** 消息类型中文标签 */
export const MESSAGE_TYPE_LABELS_ZH: Record<string, string> = {
  task_completed: "任务完成",
  task_failed: "任务失败",
  task_needs_confirm: "待确认",
  proposal_pending: "提案待审",
  canon_check_result: "Canon 检查",
  asset_review: "资产审核",
};

/** 消息类型英文标签 */
export const MESSAGE_TYPE_LABELS_EN: Record<string, string> = {
  task_completed: "Task completed",
  task_failed: "Task failed",
  task_needs_confirm: "Needs confirm",
  proposal_pending: "Proposal pending",
  canon_check_result: "Canon check",
  asset_review: "Asset review",
};

export function messageTypeLabel(type: string, locale: string): string {
  return locale === "zh-CN"
    ? MESSAGE_TYPE_LABELS_ZH[type] ?? type
    : MESSAGE_TYPE_LABELS_EN[type] ?? type;
}

/** 严重性对应的颜色，沿用全局视觉规范 */
export const SEVERITY_COLORS: Record<KkSeverity, string> = {
  info: "#6d9eeb",
  success: "#7dd181",
  warning: "#ffd166",
  error: "#ff8b8b",
};
