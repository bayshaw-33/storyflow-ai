// Kiikis 2.0 Dashboard 领域契约类型定义
// 基于 PRD §10 核心领域契约与 §5.2 首页固定区域。
// contract_version 与 Codex 的 K2-C-01 解耦，自建 fixture 即可独立预览。

export const CONTRACT_VERSION = "2.0.0-alpha.1";

// 作品类型沿用 1.0 的 WorkflowType，避免与既有 lib/projects.ts 冲突。
export type DashboardWorkflowType =
  | "creation"
  | "continuation"
  | "song"
  | "viral"
  | "novel"
  | "storyboard"
  | "video";

// 等待确认项的来源类型，对齐 PRD §10.3 状态。
export type PendingConfirmationType =
  | "change_proposal"
  | "canon_check"
  | "asset_review";

// 生成任务生命周期阶段，对齐 PRD §10.3 Generation Job。
export type RunningJobStage =
  | "draft"
  | "pending_confirm"
  | "queued"
  | "generating"
  | "result_ingesting"
  | "completed"
  | "partial_failure"
  | "failed"
  | "cancelled";

// 最近项目卡片：直接点击进入对应工作台。
export interface RecentProject {
  id: string;
  title: string;
  workflowType: DashboardWorkflowType;
  currentStage: string;
  lastSavedAt: string;
  universeBound: boolean;
  universeId?: string;
}

// 等待确认项：Change Proposal / Canon Check / 资产审核。
export interface PendingConfirmation {
  id: string;
  type: PendingConfirmationType;
  title: string;
  universeId: string;
  confidence: number;
  createdAt: string;
}

// 运行中任务的预估区间与置信度。
export interface RunningJobEstimate {
  min: number;
  max: number;
  confidence: number;
}

// 运行中任务卡片：点击跳转所属项目工作台。
export interface RunningJob {
  id: string;
  name: string;
  projectName: string;
  /** 项目 ID，用于导航到项目工作台 */
  projectId?: string;
  /** 工作台类型，用于导航到具体工作台 */
  workbenchType?: string;
  stage: RunningJobStage;
  completed: number;
  total: number;
  elapsedMs: number;
  estimatedRangeMs: RunningJobEstimate;
}

// Universe 健康度六维度，对齐 PRD §7.8（不使用单一总分）。
export interface UniverseHealthSummary {
  canonCompleteness: number;
  characterCompleteness: number;
  relationshipTimeline: number;
  assetCoverage: number;
  pendingProposals: number;
  conflicts: number;
}

// 最近 Universe 卡片。
export interface RecentUniverse {
  id: string;
  name: string;
  updatedAt: string;
  healthSummary: UniverseHealthSummary;
}

// 最近作品卡片。
export interface RecentWork {
  id: string;
  title: string;
  type: string;
  exportedAt: string;
  status: string;
}

// Dashboard 聚合数据，对应 fixture 文件结构。
export interface DashboardData {
  contractVersion: string;
  recentProjects: RecentProject[];
  pendingConfirmations: PendingConfirmation[];
  runningJobs: RunningJob[];
  recentUniverses: RecentUniverse[];
  recentWorks: RecentWork[];
  nextStepHint: string;
}

// 加载状态：loading / empty / error / ready / unauthenticated。
export type DashboardStatus =
  | "loading"
  | "empty"
  | "error"
  | "ready"
  | "unauthenticated";

// 校验 contract_version 是否匹配当前契约。
export function assertContractVersion(version: string): void {
  if (version !== CONTRACT_VERSION) {
    throw new Error(
      `dashboard contract version mismatch: expected ${CONTRACT_VERSION}, got ${version}`,
    );
  }
}
