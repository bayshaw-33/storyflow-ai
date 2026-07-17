import type { EvidenceEventInput } from "./types.ts";

export function snapshotEvidenceEvent(input: {
  ownerId: string;
  projectId: string;
  sourceUnitId: string;
  snapshotId: string;
  revision: number;
  reason: "manual" | "before_reanalysis" | "restore";
  sceneCount: number;
}): EvidenceEventInput {
  return {
    ownerId: input.ownerId,
    projectId: input.projectId,
    sourceUnitId: input.sourceUnitId,
    eventType: "storyboard_snapshot_saved",
    subjectType: "storyboard_snapshot",
    subjectId: input.snapshotId,
    subjectVersionId: String(input.revision),
    payload: { revision: input.revision, reason: input.reason, sceneCount: input.sceneCount },
    idempotencyKey: `snapshot:${input.snapshotId}`,
  };
}

export function completedGenerationEvidenceEvent(input: {
  ownerId: string;
  projectId: string;
  sourceUnitId: string;
  jobId: string;
  jobType: "image" | "video";
  targetId: string;
  provider: string;
  durationSeconds?: number;
}): EvidenceEventInput {
  return {
    ownerId: input.ownerId,
    projectId: input.projectId,
    sourceUnitId: input.sourceUnitId,
    eventType: "generation_completed",
    subjectType: `${input.jobType}_generation_job`,
    subjectId: input.jobId,
    subjectVersionId: input.targetId,
    payload: {
      jobType: input.jobType,
      targetId: input.targetId,
      provider: input.provider,
      ...(input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds }),
    },
    idempotencyKey: `generation:${input.jobId}`,
  };
}

export function exportEvidenceEvent(input: {
  ownerId: string;
  projectId: string;
  sourceUnitId: string;
  exportId: string;
  exportType: string;
  contentId: string;
  metadataHash: string | null;
}): EvidenceEventInput {
  return {
    ownerId: input.ownerId,
    projectId: input.projectId,
    sourceUnitId: input.sourceUnitId,
    eventType: "export_released",
    subjectType: "export_artifact",
    subjectId: input.exportId,
    subjectVersionId: input.contentId,
    payload: { exportType: input.exportType, contentId: input.contentId },
    objectSha256: input.metadataHash && /^[0-9a-f]{64}$/.test(input.metadataHash) ? input.metadataHash : null,
    idempotencyKey: `export:${input.exportId}`,
  };
}
