/**
 * KIIKIS V2.2 Work identity contracts.
 *
 * Phase 0 introduces the minimal Work identity surface: WorkType, WorkStatus,
 * Work DTO and the ProjectStartResult returned by POST /api/v2/project-start.
 *
 * contract_version = 2.2.0-alpha.1. Existing V2 2.0.0-alpha.1 consumers are
 * unaffected; this module is additive and does not modify legacy DTOs.
 *
 * Phase 1 will extend `Work` with version / conversation ledgers without
 * rebuilding this identity surface.
 */

export const WORK_CONTRACT_VERSION = "2.2.0-alpha.1" as const;
export type WorkContractVersion = typeof WORK_CONTRACT_VERSION;

/**
 * Top-level creation modules in V2.2.
 * `novel` is intentionally absent — V2.2 scope is script-only for prose.
 */
export const WORK_TYPES = [
  "script",
  "song",
  "art",
  "storyboard",
  "video",
  "voice",
  "editing",
] as const;
export type WorkType = (typeof WORK_TYPES)[number];

/**
 * Content lifecycle for a Work.
 * - editing_draft: free-form editing, may be checkpointed.
 * - checkpoint: immutable, may be referenced by downstream Work.
 * - finalized: authoritative version used for handoff / publish / license.
 * - archived: kept for history, not active.
 */
export const WORK_STATUSES = [
  "editing_draft",
  "checkpoint",
  "finalized",
  "archived",
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export interface Work {
  id: string;
  projectId: string;
  workType: WorkType;
  title: string;
  status: WorkStatus;
  isPrimary: boolean;
  ownerId: string;
  universeId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Result of POST /api/v2/project-start.
 * `workbenchRoute` is generated server-side via the shared navigation resolver;
 * clients must not supply their own route.
 */
export interface ProjectStartResult {
  contractVersion: WorkContractVersion;
  projectId: string;
  work: {
    id: string;
    workType: WorkType;
    title: string;
  };
  workbenchRoute: string;
}

export const DEFAULT_WORK_TITLES: Record<WorkType, string> = {
  script: "未命名剧本",
  song: "未命名歌曲",
  art: "未命名美术",
  storyboard: "未命名分镜",
  video: "未命名视频",
  voice: "未命名配音",
  editing: "未命名剪辑",
};

export function isWorkType(value: unknown): value is WorkType {
  return (
    typeof value === "string" &&
    (WORK_TYPES as readonly string[]).includes(value)
  );
}

export function isWorkStatus(value: unknown): value is WorkStatus {
  return (
    typeof value === "string" &&
    (WORK_STATUSES as readonly string[]).includes(value)
  );
}

export class WorkContractError extends Error {
  readonly code: "validation_failed" | "invalid_contract_version";
  readonly field?: string;

  constructor(
    code: WorkContractError["code"],
    message: string,
    field?: string,
  ) {
    super(message);
    this.name = "WorkContractError";
    this.code = code;
    this.field = field;
  }
}

export function assertWorkType(value: unknown): asserts value is WorkType {
  if (!isWorkType(value)) {
    throw new WorkContractError(
      "validation_failed",
      `Unsupported work type: ${String(value)}`,
      "workType",
    );
  }
}
