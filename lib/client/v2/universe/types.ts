// Kiikis 2.0 Universe 产品界面领域类型
// 基于 PRD §7.8 健康度六维度、§6 Canon/Inbox 工作流，以及 lib/contracts/v2 冻结契约。
// contract_version 与 Codex 的 v2 契约保持一致，UI fixture 可独立预览。

// 直接引用 Codex 冻结契约（只读取，不修改）。
import type {
  ChangeProposalStatus,
  UniverseObjectStatus,
} from "@/lib/contracts/v2/index";

// 重新导出，便于组件层单一来源引用。
export type { ChangeProposalStatus, UniverseObjectStatus };

// 与 lib/contracts/v2/index.ts 的 CONTRACT_VERSION 一致。
export const CONTRACT_VERSION = "2.0.0-alpha.1";

// 健康度六维度，对齐 PRD §7.8（不使用单一总分）。
// canonCompleteness: Canon 完整性
// characterCompleteness: 角色完整度
// relationshipTimeline: 关系时间线
// assetCoverage: 资产覆盖
// pendingProposals: 待处理候选数量
// conflicts: 冲突或过期快照数量
export interface UniverseHealthSummary {
  canonCompleteness: number;
  characterCompleteness: number;
  relationshipTimeline: number;
  assetCoverage: number;
  pendingProposals: number;
  conflicts: number;
}

// Universe 基本信息（v2 视图层精简结构，不直接复用 1.0 Universe 行）。
export interface UniverseInfo {
  id: string;
  name: string;
  summary: string;
  corePremise: string;
  createdAt: string;
  updatedAt: string;
  owner: string;
}

// 世界规则（Bible 页），同时复用为概念/法则类资产。
export interface WorldRule {
  id: string;
  name: string;
  summary: string;
  status: UniverseObjectStatus;
  source: string;
  mainVersion: string;
  usedBy: string[];
}

// 角色资产。
export interface CharacterAsset {
  id: string;
  name: string;
  summary: string;
  status: UniverseObjectStatus;
  source: string;
  mainVersion: string;
  usedBy: string[];
  portrait?: string;
}

// 地点资产。
export interface LocationAsset {
  id: string;
  name: string;
  summary: string;
  status: UniverseObjectStatus;
  source: string;
  mainVersion: string;
  usedBy: string[];
}

// 组织资产。
export interface OrganizationAsset {
  id: string;
  name: string;
  summary: string;
  status: UniverseObjectStatus;
  source: string;
  mainVersion: string;
  usedBy: string[];
}

// 道具资产。
export interface PropAsset {
  id: string;
  name: string;
  summary: string;
  status: UniverseObjectStatus;
  source: string;
  mainVersion: string;
  usedBy: string[];
}

// 概念资产。
export interface ConceptAsset {
  id: string;
  name: string;
  summary: string;
  status: UniverseObjectStatus;
  source: string;
  mainVersion: string;
  usedBy: string[];
}

// 关系（关系图节点之间的边）。
export interface RelationshipEdge {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  description: string;
  history?: string;
}

// 时间线事件。
export interface TimelineEventEntry {
  id: string;
  name: string;
  when: string;
  description: string;
  involvedEntities: string[];
}

// Canon Fact（锁定/临时/已弃用）。
export interface CanonFactEntry {
  id: string;
  statement: string;
  locked: boolean;
  source: string;
  references: string[];
}

// Change Proposal 字段差异。
export interface ProposalFieldDiff {
  path: string;
  before: unknown;
  after: unknown;
}

// Change Proposal（Inbox 项）。
export interface ChangeProposalEntry {
  id: string;
  type:
    | "character"
    | "location"
    | "organization"
    | "prop"
    | "concept"
    | "rule"
    | "relationship"
    | "event"
    | "canon_fact"
    | "state_change";
  title: string;
  sourceProject: string;
  sourceStep: string;
  originalContent: string;
  fieldDiff: ProposalFieldDiff[];
  confidence: number;
  status: ChangeProposalStatus;
  createdAt: string;
  impactSummary: string;
}

// 关联作品（继承/衍生/引用）。
export interface WorkLink {
  id: string;
  title: string;
  type: string;
  relationship: "inherited" | "derived" | "referenced";
  snapshotId?: string;
}

// 影响分析示例：修改某 Canon 时受影响范围。
export interface ImpactAnalysisEntry {
  targetCanonId: string;
  affectedWorks: string[];
  affectedSnapshots: string[];
  affectedAssets: string[];
}

// Universe 完整聚合数据（v2 工作台渲染输入）。
export interface UniverseBundleV2 {
  contractVersion: string;
  universe: UniverseInfo;
  healthSummary: UniverseHealthSummary;
  rules: WorldRule[];
  characters: CharacterAsset[];
  locations: LocationAsset[];
  organizations: OrganizationAsset[];
  props: PropAsset[];
  concepts: ConceptAsset[];
  relationships: RelationshipEdge[];
  timelineEvents: TimelineEventEntry[];
  canonFacts: CanonFactEntry[];
  proposals: ChangeProposalEntry[];
  works: WorkLink[];
  impactAnalysis: ImpactAnalysisEntry;
  // 最近活动摘要（概览页用）。
  recentActivity: Array<{
    id: string;
    message: string;
    at: string;
  }>;
}

// 加载状态。
export type UniverseBundleStatus =
  | "loading"
  | "ready"
  | "error"
  | "unauthenticated";

// 校验 contract_version 是否匹配当前契约。
export function assertContractVersion(version: string): void {
  if (version !== CONTRACT_VERSION) {
    throw new Error(
      `universe contract version mismatch: expected ${CONTRACT_VERSION}, got ${version}`,
    );
  }
}

// 健康度六维度键名（用于遍历与防漂移断言）。
export const HEALTH_DIMENSION_KEYS = [
  "canonCompleteness",
  "characterCompleteness",
  "relationshipTimeline",
  "assetCoverage",
  "pendingProposals",
  "conflicts",
] as const;
export type HealthDimensionKey = (typeof HEALTH_DIMENSION_KEYS)[number];
