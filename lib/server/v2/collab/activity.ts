/**
 * KIIKIS 2.1 Phase 4 — 活动轨迹服务 (Task 4.2, CO-006)
 *
 * CO-006: 项目级活动流, append-only, 锚定 resourceType + resourceId。
 * 通过 RPC append_activity_event 写入 (客户端不可直接 INSERT)。
 */
import {
  parseActivity,
  validateAppendActivity,
  CollabValidationError,
  type AppendActivityInput,
  type Activity,
  type ActivityRow,
} from "../../../contracts/v2/collab.ts";
import { CollabServiceError } from "./index.ts";
import type { CollabFetcher } from "./comments.ts";

/** 追加活动事件 (CO-006: append-only via RPC) */
export async function appendActivity(
  fetcher: CollabFetcher,
  input: AppendActivityInput,
): Promise<Activity> {
  let validated: AppendActivityInput;
  try {
    validated = validateAppendActivity(input);
  } catch (err) {
    if (err instanceof CollabValidationError) {
      throw new CollabServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  const row = await fetcher<ActivityRow>(
    `/rest/v1/rpc/append_activity_event`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_project_id: validated.projectId ?? null,
        p_resource_type: validated.resourceType,
        p_resource_id: validated.resourceId,
        p_activity_type: validated.activityType,
        p_actor_id: validated.actorId,
        p_details: validated.details ?? {},
      }),
    },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to append activity", 503, err);
  });

  return parseActivity(row);
}

/** 列出项目级活动流 (CO-006) */
export async function listProjectActivity(
  fetcher: CollabFetcher,
  projectId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<Activity[]> {
  if (!projectId) throw new CollabServiceError("validation_failed", "projectId is required", 400);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await fetcher<ActivityRow[]>(
    `/rest/v1/storyflow_activity?project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc&limit=${limit}&offset=${offset}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to list project activity", 503, err);
  });

  return (rows ?? []).map(parseActivity);
}

/** 列出资源的活动历史 (CO-006: 锚定资源) */
export async function listResourceActivity(
  fetcher: CollabFetcher,
  params: { resourceType: string; resourceId: string },
  options: { limit?: number; offset?: number } = {},
): Promise<Activity[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await fetcher<ActivityRow[]>(
    `/rest/v1/storyflow_activity?resource_type=eq.${params.resourceType}&resource_id=eq.${encodeURIComponent(params.resourceId)}&order=created_at.desc&limit=${limit}&offset=${offset}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to list resource activity", 503, err);
  });

  return (rows ?? []).map(parseActivity);
}
