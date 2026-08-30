import type { PrevisCapabilityTranslation } from "../director/previs-version.ts";

export type VideoJobSubStatus =
  | "queued"
  | "accepted"
  | "generating"
  | "result_ingesting"
  | "completed"
  | "failed"
  | "provider_timeout"
  | "submission_unknown";

export type VideoPrevisProvenance = {
  previsVersionId: string;
  previsSnapshotHash: string;
  firstframeJobId: string;
  capabilityTranslation: PrevisCapabilityTranslation;
  adoptedAt: string;
};

export function buildVideoJobMetadata(
  subStatus: VideoJobSubStatus,
  provenance: Partial<VideoPrevisProvenance> = {},
  current: Record<string, unknown> = {},
): Record<string, unknown> & { sub_status: VideoJobSubStatus } {
  return {
    ...current,
    ...provenance,
    sub_status: subStatus,
  };
}

export function isAmbiguousVideoSubmissionError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "AbortError") return true;
  return /timeout|timed out|network|fetch failed|connection|socket|econnreset|econnaborted/i.test(message);
}
