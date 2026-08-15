/**
 * KIIKIS V2.2 WorkUsageLink contract — Phase 5 Task 5.1.
 *
 * A single cross-workflow relationship type: one Work Version (or Asset
 * Version) is *used by* another Work. Append-only; source versions are
 * locked at link creation time.
 *
 * Contract module: zero node:crypto, no I/O.
 */

export const USAGE_ROLES = [
  "source_script",
  "art_reference",
  "storyboard_source",
  "video_source",
  "universe_theme",
  "character_theme",
  "work_theme",
  "episode_theme",
  "scene_cue",
  "diegetic_song",
  "character_voice",
  "narration",
  "dialogue_line",
  "editing_input",
] as const;

export type UsageRole = (typeof USAGE_ROLES)[number];

export interface WorkUsageLinkV1 {
  id: string;
  sourceWorkId: string;
  sourceWorkVersionId: string;
  targetProjectId: string;
  targetWorkId: string;
  targetWorkVersionId: string | null;
  targetEntityType: string | null;
  targetEntityId: string | null;
  usageRole: UsageRole;
  assetVersionId: string | null;
  rightsSnapshotId: string | null;
  createdAt: string;
}

export function isUsageRole(value: unknown): value is UsageRole {
  return typeof value === "string" && (USAGE_ROLES as readonly string[]).includes(value);
}

export function isWorkUsageLinkV1(value: unknown): value is WorkUsageLinkV1 {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.sourceWorkId === "string" &&
    typeof v.sourceWorkVersionId === "string" &&
    typeof v.targetProjectId === "string" &&
    typeof v.targetWorkId === "string" &&
    (v.targetWorkVersionId === null || typeof v.targetWorkVersionId === "string") &&
    (v.targetEntityType === null || typeof v.targetEntityType === "string") &&
    (v.targetEntityId === null || typeof v.targetEntityId === "string") &&
    isUsageRole(v.usageRole) &&
    (v.assetVersionId === null || typeof v.assetVersionId === "string") &&
    (v.rightsSnapshotId === null || typeof v.rightsSnapshotId === "string") &&
    typeof v.createdAt === "string"
  );
}

/** Stable fingerprint for idempotency (same identity + role + entity). */
export function usageLinkFingerprint(input: {
  sourceWorkId: string;
  sourceWorkVersionId: string;
  targetWorkId: string;
  targetEntityType: string | null;
  targetEntityId: string | null;
  usageRole: UsageRole;
}): string {
  return [
    input.sourceWorkId,
    input.sourceWorkVersionId,
    input.targetWorkId,
    input.targetEntityType ?? "",
    input.targetEntityId ?? "",
    input.usageRole,
  ].join("|");
}

/**
 * Cycle detection: adding edge candidateSource→candidateTarget closes a loop
 * iff there is an existing path candidateTarget → … → candidateSource along
 * the edge direction (source → target). Walk forward edges from the target.
 */
export function wouldCreateCycle(
  links: Array<{ sourceWorkId: string; targetWorkId: string }>,
  candidateSource: string,
  candidateTarget: string,
): boolean {
  if (candidateSource === candidateTarget) return true;
  const visited = new Set<string>();
  const stack = [candidateTarget];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const link of links) {
      if (link.sourceWorkId === current) {
        if (link.targetWorkId === candidateSource) return true;
        if (!visited.has(link.targetWorkId)) stack.push(link.targetWorkId);
      }
    }
  }
  return false;
}

export class WorkUsageContractError extends Error {
  readonly code: "validation_failed" | "conflict";
  constructor(code: WorkUsageContractError["code"], message: string) {
    super(message);
    this.name = "WorkUsageContractError";
    this.code = code;
  }
}
