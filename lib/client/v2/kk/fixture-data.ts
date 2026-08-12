/**
 * KK 反馈层 fixture 数据（内联 TS 模块）。
 *
 * 重要教训：不要用 dynamic import 加载 tests/ 目录的 JSON。
 * 这里把 fixture 数据内联为 TS export，供 fixtures.ts 与组件直接使用。
 * 同步副本写入 tests/fixtures/kiikis-v2/kk.json，由测试防漂移断言保证一致。
 */
import type { KkDataset, KkMessage, KkSettings, KkStats } from "./types.ts";

/**
 * 13 条 KK 消息，覆盖全部 6 种类型与 4 种严重性。
 * 每条都是可读任务信息（任务名 + 状态 + 原因），不是拟人化聊天。
 * 跳转动作指向 /job-center 或对应结果页，由用户处理。
 */
export const FIXTURE_MESSAGES: readonly KkMessage[] = [
  {
    id: "kk-001",
    type: "task_completed",
    title: "剧本大纲生成完成",
    body: "「夜色法则」剧本大纲已生成，共 12 个场景。可在任务中心查看结果。",
    severity: "success",
    createdAt: "2026-08-12T01:30:00.000Z",
    actionLabel: "查看结果",
    actionUrl: "/job-center",
    relatedJobId: "job-001",
    read: false,
  },
  {
    id: "kk-002",
    type: "task_failed",
    title: "角色立绘生成失败",
    body: "「夜色法则」角色立绘批量生成失败：provider 超时（10 张中 0 张完成）。可在任务中心重试。",
    severity: "error",
    createdAt: "2026-08-12T01:45:00.000Z",
    actionLabel: "查看错误",
    actionUrl: "/job-center",
    relatedJobId: "job-003",
    read: false,
  },
  {
    id: "kk-003",
    type: "task_needs_confirm",
    title: "对白润色等待确认",
    body: "「夜色法则」第 3 集对白润色已生成草稿，等待你确认提示词后继续。",
    severity: "warning",
    createdAt: "2026-08-12T02:00:00.000Z",
    actionLabel: "去确认",
    actionUrl: "/job-center",
    relatedJobId: "job-002",
    read: false,
  },
  {
    id: "kk-004",
    type: "proposal_pending",
    title: "Change Proposal 待审",
    body: "角色「Mara」与「Kael」的关系调整提案，置信度 92%。需要你审阅后决定是否接受。",
    severity: "warning",
    createdAt: "2026-08-12T02:15:00.000Z",
    actionLabel: "审阅提案",
    actionUrl: "/universe",
    relatedProposalId: "proposal-1",
    read: false,
  },
  {
    id: "kk-005",
    type: "canon_check_result",
    title: "Canon Check 通过",
    body: "「The Glass Sea」Canon 一致性检查通过，未发现冲突。",
    severity: "info",
    createdAt: "2026-08-12T02:30:00.000Z",
    actionLabel: "查看详情",
    actionUrl: "/universe",
    read: true,
  },
  {
    id: "kk-006",
    type: "canon_check_result",
    title: "Canon Check 发现冲突",
    body: "「The Glass Sea」发现 2 处 Canon 冲突：时间线与角色设定不一致。需要你处理。",
    severity: "warning",
    createdAt: "2026-08-12T02:35:00.000Z",
    actionLabel: "查看冲突",
    actionUrl: "/universe",
    read: false,
  },
  {
    id: "kk-007",
    type: "asset_review",
    title: "待审核资产",
    body: "角色立绘 v2 已就绪，等待审核后发布到市场。",
    severity: "info",
    createdAt: "2026-08-12T02:45:00.000Z",
    actionLabel: "去审核",
    actionUrl: "/art-workbench",
    read: false,
  },
  {
    id: "kk-008",
    type: "task_completed",
    title: "分镜视频合成完成",
    body: "「夜色法则」第 1 集分镜视频已合成，共 24 个镜头。可在任务中心查看。",
    severity: "success",
    createdAt: "2026-08-12T03:00:00.000Z",
    actionLabel: "查看结果",
    actionUrl: "/job-center",
    relatedJobId: "job-004",
    read: true,
  },
  {
    id: "kk-009",
    type: "task_failed",
    title: "音频生成失败",
    body: "「夜色法则」主题曲生成失败：配额不足。可在任务中心查看详情。",
    severity: "error",
    createdAt: "2026-08-12T03:15:00.000Z",
    actionLabel: "查看错误",
    actionUrl: "/job-center",
    relatedJobId: "job-005",
    read: false,
  },
  {
    id: "kk-010",
    type: "proposal_pending",
    title: "新增场景提案",
    body: "「夜色法则」新增「码头」场景提案，置信度 78%。需要你审阅后决定。",
    severity: "warning",
    createdAt: "2026-08-12T03:30:00.000Z",
    actionLabel: "审阅提案",
    actionUrl: "/universe",
    relatedProposalId: "proposal-2",
    read: false,
  },
  {
    id: "kk-011",
    type: "asset_review",
    title: "资产审核逾期",
    body: "场景「码头」概念图审核已逾期 2 天，请尽快处理。",
    severity: "warning",
    createdAt: "2026-08-12T03:45:00.000Z",
    actionLabel: "去审核",
    actionUrl: "/art-workbench",
    read: false,
  },
  {
    id: "kk-012",
    type: "task_needs_confirm",
    title: "导出包等待确认",
    body: "「夜色法则」导出包已就绪，等待你确认后发布。",
    severity: "warning",
    createdAt: "2026-08-12T04:00:00.000Z",
    actionLabel: "去确认",
    actionUrl: "/job-center",
    relatedJobId: "job-006",
    read: false,
  },
  {
    id: "kk-013",
    type: "task_completed",
    title: "歌曲生成完成",
    body: "「夜色法则」主题曲已生成。可在任务中心查看。",
    severity: "success",
    createdAt: "2026-08-12T04:15:00.000Z",
    actionLabel: "查看结果",
    actionUrl: "/job-center",
    relatedJobId: "job-007",
    read: true,
  },
];

/** 默认设置：key_only（推荐默认），勿扰关闭 */
export const FIXTURE_SETTINGS: KkSettings = {
  frequency: "key_only",
  doNotDisturb: false,
  mutedUntil: null,
};

/** 预计算统计 */
export const FIXTURE_STATS: KkStats = {
  total: 13,
  unread: 10,
  bySeverity: {
    info: 2,
    success: 3,
    warning: 6,
    error: 2,
  },
};

/** 完整 fixture 数据集 */
export const FIXTURE_DATASET: KkDataset = {
  contractVersion: "2.0.0-alpha.1",
  messages: FIXTURE_MESSAGES as KkMessage[],
  settings: FIXTURE_SETTINGS,
  stats: FIXTURE_STATS,
};
