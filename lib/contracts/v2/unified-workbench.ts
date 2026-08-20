import { WORK_CONTRACT_VERSION, type WorkStatus } from "./work.ts";

export const UNIFIED_PRODUCTION_STAGES = [
  "script",
  "art",
  "storyboard",
  "video",
] as const;
export type UnifiedProductionStage = (typeof UNIFIED_PRODUCTION_STAGES)[number];

export interface UnifiedWorkbenchStageContext {
  workId: string;
  status: WorkStatus;
  currentVersionId: string | null;
  updatedAt: string;
}

export interface UnifiedWorkbenchContextV1 {
  contractVersion: typeof WORK_CONTRACT_VERSION;
  project: { id: string; title: string; ownerId: string };
  universe: {
    id: string;
    name: string;
    versionId: string | null;
    hasUpdate: boolean;
  } | null;
  stages: Record<UnifiedProductionStage, UnifiedWorkbenchStageContext | null>;
  legacy: { sourceUnitId: string | null; resolvedFromProjectOnly: boolean };
}

export function isUnifiedProductionStage(
  value: unknown,
): value is UnifiedProductionStage {
  return (
    typeof value === "string" &&
    (UNIFIED_PRODUCTION_STAGES as readonly string[]).includes(value)
  );
}

export function buildUnifiedWorkbenchUrl(input: {
  projectId: string;
  workId?: string | null;
  tab: UnifiedProductionStage;
  unitId?: string | null;
}): string {
  const query = new URLSearchParams({ projectId: input.projectId });
  if (input.workId) query.set("workId", input.workId);
  query.set("tab", input.tab);
  if (input.unitId) query.set("unitId", input.unitId);
  return `/production?${query.toString()}`;
}

export function parseUnifiedWorkbenchQuery(search: string | URLSearchParams): {
  projectId: string | null;
  workId: string | null;
  tab: UnifiedProductionStage;
  unitId: string | null;
} {
  const query =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const rawTab = query.get("tab");
  return {
    projectId: query.get("projectId"),
    workId: query.get("workId"),
    tab:
      rawTab === "grid" || rawTab === "dynamic"
        ? "storyboard"
        : isUnifiedProductionStage(rawTab)
          ? rawTab
          : "script",
    unitId: query.get("unitId") ?? query.get("sourceUnitId"),
  };
}
