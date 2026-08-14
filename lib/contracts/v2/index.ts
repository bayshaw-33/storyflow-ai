/**
 * KIIKIS 2.0 public domain contracts.
 *
 * These DTOs are deliberately persistence-agnostic. Database row names,
 * storage paths, provider metadata, prompts, and secret identifiers belong in
 * server adapters and must not cross the v2 API boundary.
 */

export const CONTRACT_VERSION = "2.0.0-alpha.1" as const;
export type ContractVersion = typeof CONTRACT_VERSION;

export class ContractVersionError extends Error {
  readonly code = "invalid_contract_version" as const;
  readonly received: string;

  constructor(received: string) {
    super(`invalid_contract_version: expected ${CONTRACT_VERSION}, received ${received}`);
    this.name = "ContractVersionError";
    this.received = received;
  }
}

export function assertContractVersion(version: string): asserts version is ContractVersion {
  if (version !== CONTRACT_VERSION) throw new ContractVersionError(version);
}

export function isContractVersion(version: unknown): version is ContractVersion {
  return version === CONTRACT_VERSION;
}

export const CHANGE_PROPOSAL_STATUSES = [
  "draft",
  "pending_review",
  "accepted",
  "edited_and_accepted",
  "rejected",
  "deferred",
] as const;
export type ChangeProposalStatus = (typeof CHANGE_PROPOSAL_STATUSES)[number];

export const GENERATION_JOB_STATUSES = [
  "draft",
  "pending_confirm",
  "queued",
  "running",
  "result_ingesting",
  "completed",
  "partial_failure",
  "failed",
  "cancelled",
] as const;
export type GenerationJobStatus = (typeof GENERATION_JOB_STATUSES)[number];
export type GenerationJobPhase = GenerationJobStatus;

export const ASSET_STATUSES = ["draft", "ready", "published", "suspended", "archived"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const USAGE_GRANT_STATUSES = [
  "pending",
  "active",
  "expired",
  "revoked_for_new_use",
  "cancelled",
  "disputed",
] as const;
export type UsageGrantStatus = (typeof USAGE_GRANT_STATUSES)[number];

export const V2_ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "validation_failed",
  "service_unavailable",
  "provider_degraded",
  "invalid_contract_version",
] as const;
export type V2ErrorCode = (typeof V2_ERROR_CODES)[number];

export type UniverseObjectStatus = "draft" | "canon" | "alternative" | "deprecated";
export type UniverseVisibility = "private" | "team" | "shared";
export type ProjectContentType = "novel" | "script" | "short_drama" | "song" | "storyboard" | "video" | "other";
export type ProjectProductionStage = "idea" | "structure" | "script" | "art" | "storyboard" | "video" | "exported";

export interface Universe {
  id: string;
  name: string;
  summary: string;
  status: UniverseObjectStatus;
  visibility: UniverseVisibility;
  currentVersion: string;
  updatedAt: string;
}

export type UniverseEntityKind = "character" | "location" | "organization" | "object" | "rule" | "concept";

export interface UniverseEntity {
  id: string;
  universeId: string;
  kind: UniverseEntityKind;
  name: string;
  summary: string;
  status: UniverseObjectStatus;
  updatedAt: string;
}

export interface CanonFact {
  id: string;
  universeId: string;
  statement: string;
  status: "locked" | "provisional" | "deprecated";
  sourceEntityIds: string[];
  updatedAt: string;
}

export interface Relationship {
  id: string;
  universeId: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: string;
  status: UniverseObjectStatus;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  universeId: string;
  title: string;
  description: string;
  occurredAt: string;
  status: UniverseObjectStatus;
}

export interface Project {
  id: string;
  name: string;
  contentType: ProjectContentType;
  productionStage: ProjectProductionStage;
  universeId: string | null;
  inheritanceSnapshotId?: string | null;
  updatedAt: string;
}

export interface InheritanceSnapshot {
  id: string;
  projectId: string;
  universeId: string;
  universeVersion: string;
  includedObjectIds: string[];
  createdAt: string;
}

export interface ProposalFieldDiff {
  path: string;
  before: unknown;
  after: unknown;
}

export interface ChangeProposal {
  id: string;
  universeId: string;
  sourceProjectId: string;
  sourceStep: string;
  status: ChangeProposalStatus;
  confidence: number;
  fieldDiffs: ProposalFieldDiff[];
  sourceReference?: {
    kind: "text" | "asset" | "decision";
    label: string;
  };
  createdAt: string;
}

export type AssetKind = "character" | "scene" | "prop" | "style" | "universe_package";

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  status: AssetStatus;
  currentVersionId: string | null;
  createdAt: string;
}

export interface AssetVersion {
  id: string;
  assetId: string;
  parentVersionId: string | null;
  sourceProjectId: string | null;
  previewUrl?: string | null;
  createdAt: string;
}

export type GenerationJobType = "text" | "image" | "video" | "audio" | "transfer" | "export" | "analysis";

export interface JobProgress {
  completed: number;
  total: number;
}

export interface JobTiming {
  elapsedSeconds: number;
  estimatedSecondsMin?: number | null;
  estimatedSecondsMax?: number | null;
  estimateConfidence?: "low" | "medium" | "high" | null;
}

export type JobAction = "retry" | "cancel" | "view_details" | "view_results";

export interface GenerationJob {
  id: string;
  projectId: string | null;
  jobType: GenerationJobType;
  status: GenerationJobStatus;
  phase: GenerationJobPhase;
  progress: JobProgress;
  timing?: JobTiming;
  resultReferences?: string[];
  failedItemCount?: number;
  actions?: JobAction[];
  createdAt: string;
  completedAt?: string | null;
  // Phase 0 Task 0.3: optional target/result metadata for dashboard & job
  // detail navigation. All optional for backward compatibility with existing
  // rows that don't carry these fields yet.
  workId?: string | null;
  workbenchType?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  detailUrl?: string | null;
  resultUrl?: string | null;
}

export interface ModelDecision {
  mode: "smart" | "professional";
  recommendationReason: string;
  estimatedSpeed?: "fast" | "medium" | "slow";
  estimatedCostTier: "low" | "medium" | "high";
  selectedModelKey?: string | null;
  actualModelKey?: string | null;
  wasDegraded: boolean;
  degradationReason?: string | null;
}

export interface Actor {
  id: string;
  name: string;
  status: AssetStatus;
  rightsState?: "ai_generated" | "portrait_confirmed" | "portrait_pending";
}

export interface Character {
  id: string;
  universeId: string;
  name: string;
  status: UniverseObjectStatus;
  summary?: string;
}

export interface Portrayal {
  id: string;
  actorId: string;
  characterId: string;
  projectId: string;
  assetVersionId?: string | null;
}

export interface LicenseOfferTerms {
  commercial: boolean;
  scope: "platform_free" | "non_commercial" | "single_project" | "team_internal" | "custom";
  territory?: string[];
  durationDays?: number | null;
  modificationAllowed?: boolean;
}

export interface LicenseOffer {
  id: string;
  assetId: string;
  assetVersionId: string;
  terms: LicenseOfferTerms;
  priceCents?: number;
  currency?: string;
}

export interface UsageGrant {
  id: string;
  offerId: string;
  assetVersionId: string;
  projectId: string;
  status: UsageGrantStatus;
  expiresAt?: string | null;
}

export type EvidenceEventType =
  | "generation_completed"
  | "asset_confirmed"
  | "asset_published"
  | "license_granted"
  | "export_released";

export interface EvidenceEvent {
  id: string;
  eventType: EvidenceEventType;
  subjectType: "project" | "universe" | "asset" | "asset_version" | "usage_grant";
  subjectId: string;
  occurredAt: string;
  summary?: string;
}
