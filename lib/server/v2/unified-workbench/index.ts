import {
  UNIFIED_PRODUCTION_STAGES,
  isUnifiedProductionStage,
  type UnifiedProductionStage,
  type UnifiedWorkbenchContextV1,
  type UnifiedWorkbenchStageContext,
} from "../../../contracts/v2/unified-workbench.ts";
import { DEFAULT_WORK_TITLES, WORK_CONTRACT_VERSION, type WorkStatus } from "../../../contracts/v2/work.ts";

export type UnifiedWorkbenchFetcher = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

type UnifiedWorkbenchErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "schema_missing"
  | "service_unavailable";

export class UnifiedWorkbenchServiceError extends Error {
  readonly code: UnifiedWorkbenchErrorCode;
  readonly correlationId?: string;

  constructor(
    code: UnifiedWorkbenchErrorCode,
    message: string,
    correlationId?: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "UnifiedWorkbenchServiceError";
    this.code = code;
    this.correlationId = correlationId;
  }
}

type ProjectRow = {
  id: string;
  title?: string | null;
  owner_id?: string | null;
  user_id?: string | null;
  universe_id?: string | null;
  data?: Record<string, unknown> | null;
};

type WorkRow = {
  id: string;
  owner_id: string;
  work_type: string;
  status: WorkStatus;
  is_primary: boolean;
  current_version_id?: string | null;
  updated_at: string;
};

type WorkVersionRow = { id: string; work_id: string };
type UniverseRow = { id: string; name: string };
type UniverseVersionRow = { id: string };
type EnsureStageWorkRpcRow = { work_id?: string; created?: boolean };

const STAGE_TITLES: Record<UnifiedProductionStage, string> = {
  script: DEFAULT_WORK_TITLES.script,
  art: DEFAULT_WORK_TITLES.art,
  storyboard: DEFAULT_WORK_TITLES.storyboard,
  video: DEFAULT_WORK_TITLES.video,
};

export async function getUnifiedWorkbenchContext(input: {
  projectId: string;
  ownerId: string;
  fetcher: UnifiedWorkbenchFetcher;
}): Promise<UnifiedWorkbenchContextV1> {
  assertIdentity(input);

  const project = await readProject(input);
  assertProjectOwner(project, input.ownerId);

  const works = await readWorks(input);
  const activeStageWorks = works.filter((work) => isUnifiedProductionStage(work.work_type));
  const selectedStageWorks = selectStageWorks(activeStageWorks);
  const legacyStageWorks = Object.values(selectedStageWorks).filter(
    (work): work is WorkRow => work !== null && !work.current_version_id,
  );
  const [versions, universe] = await Promise.all([
    readWorkVersions(input.fetcher, legacyStageWorks),
    readUniverseContext(input.fetcher, project.universe_id ?? null),
  ]);

  const latestVersionByWorkId = new Map<string, string>();
  for (const version of versions) {
    if (!latestVersionByWorkId.has(version.work_id)) {
      latestVersionByWorkId.set(version.work_id, version.id);
    }
  }
  const stages = emptyStageSlots();
  for (const stage of UNIFIED_PRODUCTION_STAGES) {
    const work = selectedStageWorks[stage];
    if (work) {
      stages[stage] = toStageContext(work, latestVersionByWorkId.get(work.id) ?? null);
    }
  }

  return {
    contractVersion: WORK_CONTRACT_VERSION,
    project: {
      id: project.id,
      title: project.title?.trim() || "Untitled project",
      ownerId: input.ownerId,
    },
    universe,
    stages,
    legacy: {
      sourceUnitId: readSourceUnitId(project.data),
      resolvedFromProjectOnly: true,
    },
  };
}

export async function ensureStageWork(input: {
  projectId: string;
  ownerId: string;
  stage: UnifiedProductionStage;
  idempotencyKey: string;
  fetcher: UnifiedWorkbenchFetcher;
}): Promise<{ workId: string; created: boolean }> {
  assertIdentity(input);
  if (!isUnifiedProductionStage(input.stage)) {
    throw new UnifiedWorkbenchServiceError(
      "validation_failed",
      `Unsupported production stage: ${String(input.stage)}`,
    );
  }
  if (!input.idempotencyKey) {
    throw new UnifiedWorkbenchServiceError(
      "validation_failed",
      "Idempotency key is required.",
    );
  }

  let response: EnsureStageWorkRpcRow | EnsureStageWorkRpcRow[];
  try {
    response = await input.fetcher<EnsureStageWorkRpcRow>(
      "/rest/v1/rpc/ensure_project_stage_work",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_owner_id: input.ownerId,
          p_project_id: input.projectId,
          p_work_type: input.stage,
          p_title: STAGE_TITLES[input.stage],
          p_idempotency_key: input.idempotencyKey,
        }),
      },
    );
  } catch (error) {
    throw toUnifiedWorkbenchError(error, "Stage Work service is unavailable.");
  }

  const result = Array.isArray(response) ? response[0] : response;
  if (!result || !result.work_id || typeof result.created !== "boolean") {
    throw new UnifiedWorkbenchServiceError(
      "service_unavailable",
      "Stage Work RPC returned an incomplete result.",
    );
  }
  return { workId: result.work_id, created: result.created };
}

function assertIdentity(input: { projectId: string; ownerId: string }): void {
  if (!input.ownerId) {
    throw new UnifiedWorkbenchServiceError("unauthenticated", "Authentication is required.");
  }
  if (!input.projectId) {
    throw new UnifiedWorkbenchServiceError("validation_failed", "Project id is required.");
  }
}

async function readProject(input: {
  projectId: string;
  fetcher: UnifiedWorkbenchFetcher;
}): Promise<ProjectRow> {
  try {
    const rows = await input.fetcher<ProjectRow[]>(
      `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(input.projectId)}&select=id,title,owner_id,user_id,universe_id,data&limit=1`,
    );
    const project = rows?.[0];
    if (!project) {
      throw new UnifiedWorkbenchServiceError("not_found", "Project not found.");
    }
    return project;
  } catch (error) {
    if (error instanceof UnifiedWorkbenchServiceError) throw error;
    throw toUnifiedWorkbenchError(error, "Project service is unavailable.");
  }
}

function assertProjectOwner(project: ProjectRow, ownerId: string): void {
  if ((project.owner_id ?? project.user_id) !== ownerId) {
    throw new UnifiedWorkbenchServiceError("forbidden", "Project access denied.");
  }
}

async function readWorks(input: {
  projectId: string;
  ownerId: string;
  fetcher: UnifiedWorkbenchFetcher;
}): Promise<WorkRow[]> {
  try {
    const rows = await input.fetcher<WorkRow[]>(
      `/rest/v1/storyflow_works?project_id=eq.${encodeURIComponent(input.projectId)}&owner_id=eq.${encodeURIComponent(input.ownerId)}&status=neq.archived&select=id,owner_id,work_type,status,is_primary,current_version_id,updated_at&order=is_primary.desc,updated_at.desc&limit=100`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    throw toUnifiedWorkbenchError(error, "Work service is unavailable.");
  }
}

async function readWorkVersions(
  fetcher: UnifiedWorkbenchFetcher,
  works: WorkRow[],
): Promise<WorkVersionRow[]> {
  if (!works.length) return [];
  try {
    const versions = await Promise.all(works.map(async (work) => {
      const rows = await fetcher<WorkVersionRow[]>(
        `/rest/v1/storyflow_work_versions?work_id=eq.${encodeURIComponent(work.id)}&select=id,work_id&order=created_at.desc&limit=1`,
      );
      return Array.isArray(rows) ? rows[0] ?? null : null;
    }));
    return versions.filter((version): version is WorkVersionRow => version !== null);
  } catch (error) {
    throw toUnifiedWorkbenchError(error, "Work version service is unavailable.");
  }
}

async function readUniverseContext(
  fetcher: UnifiedWorkbenchFetcher,
  universeId: string | null,
): Promise<UnifiedWorkbenchContextV1["universe"]> {
  if (!universeId) return null;
  try {
    const [universes, versions] = await Promise.all([
      fetcher<UniverseRow[]>(
        `/rest/v1/storyflow_universes?id=eq.${encodeURIComponent(universeId)}&select=id,name&limit=1`,
      ),
      fetcher<UniverseVersionRow[]>(
        `/rest/v1/storyflow_universe_versions?universe_id=eq.${encodeURIComponent(universeId)}&select=id&order=version_no.desc&limit=1`,
      ),
    ]);
    const universe = universes?.[0];
    if (!universe) return null;
    return {
      id: universe.id,
      name: universe.name,
      versionId: versions?.[0]?.id ?? null,
      hasUpdate: false,
    };
  } catch (error) {
    throw toUnifiedWorkbenchError(error, "Universe service is unavailable.");
  }
}

function emptyStageSlots(): Record<UnifiedProductionStage, UnifiedWorkbenchStageContext | null> {
  return Object.fromEntries(
    UNIFIED_PRODUCTION_STAGES.map((stage) => [stage, null]),
  ) as Record<UnifiedProductionStage, UnifiedWorkbenchStageContext | null>;
}

function selectStageWorks(
  works: WorkRow[],
): Record<UnifiedProductionStage, WorkRow | null> {
  const selected = Object.fromEntries(
    UNIFIED_PRODUCTION_STAGES.map((stage) => [stage, null]),
  ) as Record<UnifiedProductionStage, WorkRow | null>;
  for (const work of works) {
    if (isUnifiedProductionStage(work.work_type) && !selected[work.work_type]) {
      selected[work.work_type] = work;
    }
  }
  return selected;
}

function toStageContext(
  work: WorkRow,
  fallbackVersionId: string | null,
): UnifiedWorkbenchStageContext {
  return {
    workId: work.id,
    status: work.status,
    currentVersionId: work.current_version_id ?? fallbackVersionId,
    updatedAt: work.updated_at,
  };
}

function readSourceUnitId(data: Record<string, unknown> | null | undefined): string | null {
  const value = data?.sourceUnitId ?? data?.source_unit_id;
  return typeof value === "string" && value ? value : null;
}

function toUnifiedWorkbenchError(error: unknown, fallback: string): UnifiedWorkbenchServiceError {
  if (error instanceof UnifiedWorkbenchServiceError) return error;
  const message = error instanceof Error ? error.message : fallback;
  const code = /PGRST202|PGRST205|42P01/.test(message)
    ? "schema_missing"
    : /PROJECT_NOT_OWNED|42501/.test(message)
      ? "forbidden"
      : /INVALID_PRODUCTION_STAGE|check_violation/.test(message)
        ? "validation_failed"
        : "service_unavailable";
  return new UnifiedWorkbenchServiceError(code, fallback);
}
