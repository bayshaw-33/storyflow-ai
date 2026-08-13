/**
 * KIIKIS 2.1 Phase 4 — 项目协作服务统一入口 (Task 4.2)
 */
export class CollabServiceError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "validation_failed"
    | "idempotent_skip"
    | "service_unavailable";
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    code: CollabServiceError["code"],
    message: string,
    status: number,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    this.name = "CollabServiceError";
    this.code = code;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

export { appendActivity } from "./activity.ts";
export type { CollabFetcher } from "./comments.ts";

// 任务指派 (CO-002) — 在 index 中实现以复用 appendActivity
import { parseTaskAssignment, validateAssignTask, CollabValidationError, type AssignTaskInput, type TaskAssignment, type TaskAssignmentRow } from "../../../contracts/v2/collab.ts";
import type { CollabFetcher } from "./comments.ts";

/** CO-002: 指派任务 (内部校验 collaboration grant) */
export async function assignTask(
  fetcher: CollabFetcher,
  input: AssignTaskInput,
): Promise<TaskAssignment> {
  let validated: AssignTaskInput;
  try {
    validated = validateAssignTask(input);
  } catch (err) {
    if (err instanceof CollabValidationError) {
      throw new CollabServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  const row = await fetcher<TaskAssignmentRow>(
    `/rest/v1/rpc/assign_task`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_project_id: validated.projectId,
        p_task_id: validated.taskId,
        p_assignee_id: validated.assigneeId,
        p_assigned_by: validated.assignedBy,
        p_idempotency_key: validated.idempotencyKey,
      }),
    },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 403) {
      throw new CollabServiceError(
        "forbidden",
        "CO-002: assignee has no collaboration grant on project",
        403,
        err,
      );
    }
    throw new CollabServiceError("service_unavailable", "failed to assign task", 503, err);
  });

  return parseTaskAssignment(row);
}

/** CO-002: 列出任务的指派历史 */
export async function listTaskAssignments(
  fetcher: CollabFetcher,
  taskId: string,
): Promise<TaskAssignment[]> {
  if (!taskId) throw new CollabServiceError("validation_failed", "taskId is required", 400);

  const rows = await fetcher<TaskAssignmentRow[]>(
    `/rest/v1/storyflow_task_assignments?task_id=eq.${encodeURIComponent(taskId)}&order=assigned_at.desc`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to list task assignments", 503, err);
  });

  return (rows ?? []).map(parseTaskAssignment);
}

/** CO-002: 取消指派 */
export async function unassignTask(
  fetcher: CollabFetcher,
  assignmentId: string,
): Promise<TaskAssignment> {
  if (!assignmentId) throw new CollabServiceError("validation_failed", "assignmentId is required", 400);

  const rows = await fetcher<TaskAssignmentRow[]>(
    `/rest/v1/storyflow_task_assignments?id=eq.${encodeURIComponent(assignmentId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        status: "unassigned",
        unassigned_at: new Date().toISOString(),
      }),
    },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to unassign task", 503, err);
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new CollabServiceError("not_found", `assignment ${assignmentId} not found`, 404);
  return parseTaskAssignment(row);
}
