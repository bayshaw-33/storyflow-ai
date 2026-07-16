import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  owner_id: string;
  job_type: string;
  provider: string;
  model: string | null;
  provider_task_id: string | null;
  prompt: string;
  input_params: Record<string, unknown>;
  status: string;
  error: string | null;
  result_url: string | null;
  result_metadata: Record<string, unknown>;
  target_type: string;
  target_id: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type UpdatePatch = {
  status?: string;
  providerTaskId?: string | null;
  resultUrl?: string | null;
  resultMetadata?: Record<string, unknown>;
  error?: string | null;
};

const TABLE = "/rest/v1/storyflow_generation_jobs";

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function unauthorized() {
  return NextResponse.json({ success: false, error: "请先登录后使用此功能。" }, { status: 401 });
}

function notFound() {
  return NextResponse.json({ success: false, error: "任务不存在。" }, { status: 404 });
}

function serverError() {
  return NextResponse.json({ success: false, error: "操作失败，请稍后再试。" }, { status: 500 });
}

function isAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("MISSING_AUTH_TOKEN") || message.includes("INVALID_AUTH_TOKEN");
}

function assertUuid(value: string): boolean {
  return typeof value === "string" && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value.trim());
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch (error) {
    if (isAuthError(error)) return unauthorized();
    return serverError();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("请求格式不正确。");
  }

  if (!body || typeof body !== "object") {
    return badRequest("请求格式不正确。");
  }

  const data = body as Record<string, unknown>;
  const action = typeof data.action === "string" ? data.action : "";

  try {
    if (action === "create") {
      return await handleCreate(userId, data);
    }
    if (action === "list") {
      return await handleList(userId, data);
    }
    if (action === "get") {
      return await handleGet(userId, data);
    }
    if (action === "update") {
      return await handleUpdate(userId, data);
    }
    if (action === "cancel") {
      return await handleCancel(userId, data);
    }
    return badRequest("缺少必要参数。");
  } catch (error) {
    if (isAuthError(error)) return unauthorized();
    return serverError();
  }
}

async function handleCreate(userId: string, data: Record<string, unknown>) {
  const jobType = typeof data.jobType === "string" ? data.jobType.trim() : "";
  const provider = typeof data.provider === "string" ? data.provider.trim() : "";
  const prompt = typeof data.prompt === "string" ? data.prompt : "";

  if (!jobType || !provider || !prompt) {
    return badRequest("缺少必要参数。");
  }

  const model = typeof data.model === "string" && data.model.trim() ? data.model.trim() : null;
  const inputParams =
    data.inputParams && typeof data.inputParams === "object" ? (data.inputParams as Record<string, unknown>) : {};
  const targetType = typeof data.targetType === "string" && data.targetType.trim() ? data.targetType.trim() : "standalone";
  const targetId =
    typeof data.targetId === "string" && data.targetId.trim() ? data.targetId.trim() : null;
  const projectId =
    typeof data.projectId === "string" && data.projectId.trim() ? data.projectId.trim() : null;

  const insertPayload = {
    owner_id: userId,
    job_type: jobType,
    provider,
    model,
    provider_task_id: null,
    prompt,
    input_params: inputParams,
    status: "queued",
    error: null,
    result_url: null,
    result_metadata: {},
    target_type: targetType,
    target_id: targetId,
    project_id: projectId,
  };

  const rows = await serviceFetch<JobRow[]>(TABLE, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(insertPayload),
  });

  const job = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!job) {
    return serverError();
  }

  return NextResponse.json({ success: true, job });
}

async function handleList(userId: string, data: Record<string, unknown>) {
  const status =
    typeof data.status === "string" && data.status.trim() ? data.status.trim() : null;
  const targetType =
    typeof data.targetType === "string" && data.targetType.trim() ? data.targetType.trim() : null;
  const targetId =
    typeof data.targetId === "string" && data.targetId.trim() ? data.targetId.trim() : null;
  const rawLimit = typeof data.limit === "number" ? data.limit : Number.parseInt(String(data.limit ?? "50"), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;

  const parts: string[] = [`owner_id=eq.${encodeURIComponent(userId)}`];
  if (status) parts.push(`status=eq.${encodeURIComponent(status)}`);
  if (targetType) parts.push(`target_type=eq.${encodeURIComponent(targetType)}`);
  if (targetId) parts.push(`target_id=eq.${encodeURIComponent(targetId)}`);
  parts.push(`order=created_at.desc`);
  parts.push(`limit=${limit}`);

  const jobs = await serviceFetch<JobRow[]>(`${TABLE}?${parts.join("&")}`);
  return NextResponse.json({ success: true, jobs: Array.isArray(jobs) ? jobs : [] });
}

async function handleGet(userId: string, data: Record<string, unknown>) {
  const jobId = typeof data.jobId === "string" ? data.jobId.trim() : "";
  if (!assertUuid(jobId)) {
    return badRequest("缺少必要参数。");
  }

  const jobs = await serviceFetch<JobRow[]>(
    `${TABLE}?id=eq.${encodeURIComponent(jobId)}&owner_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );

  if (!Array.isArray(jobs) || jobs.length === 0) {
    return notFound();
  }

  return NextResponse.json({ success: true, job: jobs[0] });
}

async function handleUpdate(userId: string, data: Record<string, unknown>) {
  const jobId = typeof data.jobId === "string" ? data.jobId.trim() : "";
  if (!assertUuid(jobId)) {
    return badRequest("缺少必要参数。");
  }

  const patch = (data.patch && typeof data.patch === "object" ? data.patch : {}) as UpdatePatch;

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof patch.status === "string" && patch.status.trim()) {
    updatePayload.status = patch.status.trim();
    if (patch.status === "completed" || patch.status === "failed") {
      updatePayload.completed_at = new Date().toISOString();
    }
  }
  if (typeof patch.providerTaskId === "string") {
    updatePayload.provider_task_id = patch.providerTaskId;
  } else if (patch.providerTaskId === null) {
    updatePayload.provider_task_id = null;
  }
  if (typeof patch.resultUrl === "string") {
    updatePayload.result_url = patch.resultUrl;
  } else if (patch.resultUrl === null) {
    updatePayload.result_url = null;
  }
  if (patch.resultMetadata && typeof patch.resultMetadata === "object") {
    updatePayload.result_metadata = patch.resultMetadata;
  }
  if (typeof patch.error === "string") {
    updatePayload.error = patch.error;
  } else if (patch.error === null) {
    updatePayload.error = null;
  }

  const rows = await serviceFetch<JobRow[]>(
    `${TABLE}?id=eq.${encodeURIComponent(jobId)}&owner_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(updatePayload),
    },
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return notFound();
  }

  return NextResponse.json({ success: true, job: rows[0] });
}

async function handleCancel(userId: string, data: Record<string, unknown>) {
  const jobId = typeof data.jobId === "string" ? data.jobId.trim() : "";
  if (!assertUuid(jobId)) {
    return badRequest("缺少必要参数。");
  }

  const rows = await serviceFetch<JobRow[]>(
    `${TABLE}?id=eq.${encodeURIComponent(jobId)}&owner_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      }),
    },
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return notFound();
  }

  const job = rows[0];
  return NextResponse.json({ success: true, job: { id: job.id, status: job.status } });
}
