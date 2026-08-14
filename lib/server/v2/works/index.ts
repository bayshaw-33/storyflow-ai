/**
 * KIIKIS V2.2 Work identity service.
 *
 * Phase 0 minimal: atomic Project + primary Work creation via the
 * `create_project_with_primary_work` Postgres RPC. The RPC is idempotent via
 * (owner_id, idempotency_key) and inserts into storyflow_projects +
 * storyflow_works + storyflow_project_starts in one transaction.
 *
 * ownerId is ALWAYS derived from authenticateRequest on the route; the service
 * does not accept a client-supplied owner. The RPC is SECURITY DEFINER and
 * REVOKE'd from anon/authenticated so only the service role may invoke it.
 */

import {
  DEFAULT_WORK_TITLES,
  isWorkType,
  type WorkType,
} from "../../../contracts/v2/work.ts";

export type WorksFetcher = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export class WorksServiceError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "conflict"
    | "validation_failed"
    | "service_unavailable"
    | "invalid_contract_version";
  readonly correlationId?: string;

  constructor(
    code: WorksServiceError["code"],
    message: string,
    correlationId?: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "WorksServiceError";
    this.code = code;
    this.correlationId = correlationId;
  }
}

export interface CreateProjectWithWorkInput {
  /** Authenticated owner; never trusted from the client. */
  ownerId: string;
  workType: WorkType;
  title?: string;
  universeId?: string | null;
  idempotencyKey: string;
}

export interface ProjectStartOutcome {
  projectId: string;
  workId: string;
  workType: WorkType;
  title: string;
}

interface ProjectStartRpcResponse {
  project_id: string;
  work_id: string;
}

/**
 * Calls the `create_project_with_primary_work` RPC. Idempotent: replaying the
 * same (ownerId, idempotencyKey) returns the original project/work pair.
 *
 * The RPC itself is atomic — if any of the three inserts fail, the transaction
 * rolls back and no partial project_start row survives.
 */
export async function createProjectWithPrimaryWork(
  input: CreateProjectWithWorkInput,
  fetcher: WorksFetcher,
): Promise<ProjectStartOutcome> {
  if (!input.ownerId) {
    throw new WorksServiceError(
      "unauthenticated",
      "Owner id is required (must come from auth context).",
    );
  }
  if (!input.idempotencyKey) {
    throw new WorksServiceError(
      "validation_failed",
      "Idempotency key is required.",
      "idempotencyKey",
    );
  }
  if (!isWorkType(input.workType)) {
    throw new WorksServiceError(
      "validation_failed",
      `Unsupported work type: ${String(input.workType)}`,
      "workType",
    );
  }

  const title =
    input.title && input.title.trim()
      ? input.title.trim()
      : DEFAULT_WORK_TITLES[input.workType];

  let response: ProjectStartRpcResponse;
  try {
    response = await fetcher<ProjectStartRpcResponse>(
      "/rest/v1/rpc/create_project_with_primary_work",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id: input.ownerId,
          work_type: input.workType,
          title,
          universe_id: input.universeId || null,
          idempotency_key: input.idempotencyKey,
        }),
      },
    );
  } catch (error) {
    throw new WorksServiceError(
      "service_unavailable",
      error instanceof Error ? error.message : "Project start service unavailable.",
    );
  }

  if (!response || !response.project_id || !response.work_id) {
    throw new WorksServiceError(
      "service_unavailable",
      "Project start RPC returned an incomplete result.",
    );
  }

  return {
    projectId: response.project_id,
    workId: response.work_id,
    workType: input.workType,
    title,
  };
}
