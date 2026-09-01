// Kiikis 2.0 Universe 产品界面领域类型
// 基于 PRD §7.8 健康度六维度、§6 Canon/Inbox 工作流，以及 lib/contracts/v2 冻结契约。
// contract_version 与 Codex 的 v2 契约保持一致，UI fixture 可独立预览。

// 直接引用 Codex 冻结契约（只读取，不修改）。
import type {
  ChangeProposalStatus,
  UniverseObjectStatus,
  UniverseVisibility,
} from "@/lib/contracts/v2/index";

// 重新导出，便于组件层单一来源引用。
export type { ChangeProposalStatus, UniverseObjectStatus, UniverseVisibility };

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
  bibleContent?: string;
  createdAt: string;
  updatedAt: string;
  owner: string;
  // 以下为 Codex API 详情端点返回的扩展字段（真实 API 模式下填充）。
  // fixture 模式下缺省，UI 不强依赖，只增不删以保持向后兼容。
  status?: UniverseObjectStatus;
  visibility?: UniverseVisibility;
  currentVersion?: string;
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
  // Codex API 详情端点返回的世界圣经摘要（真实 API 模式下填充，fixture 模式缺省）。
  bible?: {
    summary?: string;
    genre?: string;
    tags?: string[];
  };
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

// ============================================================
// V2.2 Universe Inheritance client-side types (Phase 2 Task 2.5)
// ============================================================
//
// These mirror the server V22 contracts in
// lib/contracts/v2/universe-inheritance-v22.ts but are shaped as
// API response DTOs (camelCase, envelope-stripped) for direct use
// in React components and the workbench shell.

// Re-export V22 relation/policy enums so UI has a single import source.
// 先 import 再 export，确保同文件内的 interface 能引用这些类型。
import {
  WORK_RELATIONS as V22_WORK_RELATIONS,
  CANON_POLICIES as V22_CANON_POLICIES,
  type WorkRelation as V22WorkRelation,
  type CanonPolicy as V22CanonPolicy,
} from "../../../contracts/v2/universe-inheritance-v22.ts";
export { V22_WORK_RELATIONS, V22_CANON_POLICIES };
export type { V22WorkRelation, V22CanonPolicy };

// Universe Version summary returned by inheritance read endpoints.
export interface UniverseVersionSummaryV22 {
  id: string;
  universeId: string;
  versionNo: number;
  contentHash: string;
  createdAt: string;
}

// Work inheritance manifest (camelCase API DTO).
export interface WorkInheritanceManifestV22 {
  id: string;
  workId: string;
  universeId: string;
  universeVersionId: string;
  universeVersionNo: number;
  relation: V22WorkRelation;
  canonPolicy: V22CanonPolicy;
  timelineAnchorId: string | null;
  includedEntityVersionIds: string[];
  includedFactVersionIds: string[];
  includedRelationshipVersionIds: string[];
  includedTimelineEventVersionIds: string[];
  includedAssetVersionIds: string[];
  isActive: boolean;
  supersededBy: string | null;
  createdAt: string;
}

// Full inheritance read result: manifest + current universe version + stale flag.
export interface WorkInheritanceStateV22 {
  manifest: WorkInheritanceManifestV22 | null;
  universeVersion: UniverseVersionSummaryV22 | null;
  latestUniverseVersion: UniverseVersionSummaryV22 | null;
  isStale: boolean;
}

// Object-level diff item (mirrors server UniverseObjectDiff).
export type InheritanceDiffImpact = "added" | "changed" | "deprecated" | "conflict";

export interface InheritanceObjectDiff {
  diffId: string;
  objectId: string;
  objectType: "entity" | "fact" | "relationship" | "timeline_event" | "asset";
  oldVersionId: string | null;
  newVersionId: string | null;
  impact: InheritanceDiffImpact;
  fieldPath: string | null;
  before: unknown;
  after: unknown;
}

export interface InheritanceDiffResultV22 {
  workId: string;
  currentManifestId: string;
  currentUniverseVersionId: string;
  latestUniverseVersionId: string;
  isStale: boolean;
  diffs: InheritanceObjectDiff[];
}

// Adopt result: new manifest + idempotent flag.
export interface AdoptResultV22 {
  manifest: WorkInheritanceManifestV22;
  idempotent: boolean;
}

// Context packet reference (source-attributed object reference).
export interface ContextPacketReference {
  type: "entity" | "fact" | "relationship" | "timeline_event" | "asset";
  id: string;
  versionId: string;
  reason: "selected" | "timeline_adjacent" | "related" | "canon_default";
  relevanceScore: number;
}

export interface ContextPacketV22 {
  workId: string;
  workVersionId: string;
  universeVersionId: string;
  references: ContextPacketReference[];
  totalBytes: number;
  budgetBytes: number;
}

// Binding request input (POST /api/v2/works/:workId/universe/bind).
export interface BindWorkToUniverseInput {
  universeId: string;
  relation: V22WorkRelation;
  canonPolicy: V22CanonPolicy;
  timelineAnchorId?: string | null;
  includedEntityIds?: string[];
  includedFactIds?: string[];
  includedRelationshipIds?: string[];
  includedTimelineEventIds?: string[];
  includedAssetIds?: string[];
}

// Adopt request input (POST /api/v2/works/:workId/inheritance/adopt).
export interface AdoptDiffsInput {
  diffIds: string[];
}
