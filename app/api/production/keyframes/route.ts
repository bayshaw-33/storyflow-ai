import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import type {
  KeyframeCandidate,
  KeyframeCandidateStatus,
  KeyframeSet,
  KeyframeSlot,
  KeyframeSlotRole,
} from "@/lib/production/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* DB row shapes (snake_case from PostgREST)                           */
/* ------------------------------------------------------------------ */

type DbSetRow = {
  id: string;
  project_id: string;
  shot_id: string;
  name: string;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type DbSlotRow = {
  id: string;
  keyframe_set_id: string;
  shot_id: string;
  slot_role: KeyframeSlotRole;
  timestamp_ratio: number | string;
  selected_candidate_id: string | null;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type DbCandidateRow = {
  id: string;
  keyframe_slot_id: string;
  image_url: string | null;
  prompt: string;
  negative_prompt: string;
  provider: string | null;
  model: string | null;
  generation_job_id: string | null;
  status: KeyframeCandidateStatus;
  is_selected: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/* Row → domain mappers                                                */
/* ------------------------------------------------------------------ */

function mapCandidate(row: DbCandidateRow): KeyframeCandidate {
  return {
    id: row.id,
    keyframe_slot_id: row.keyframe_slot_id,
    image_url: row.image_url || undefined,
    prompt: row.prompt || "",
    negative_prompt: row.negative_prompt || "",
    provider: row.provider || undefined,
    model: row.model || undefined,
    generation_job_id: row.generation_job_id || undefined,
    status: row.status,
    is_selected: Boolean(row.is_selected),
    sort_order: row.sort_order,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapSlot(row: DbSlotRow, candidates: KeyframeCandidate[]): KeyframeSlot {
  return {
    id: row.id,
    keyframe_set_id: row.keyframe_set_id,
    shot_id: row.shot_id,
    slot_role: row.slot_role,
    timestamp_ratio: Number(row.timestamp_ratio),
    selected_candidate_id: row.selected_candidate_id || undefined,
    label: row.label || "",
    sort_order: row.sort_order,
    candidates,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapSet(row: DbSetRow, slots: KeyframeSlot[]): KeyframeSet {
  return {
    id: row.id,
    project_id: row.project_id,
    shot_id: row.shot_id,
    name: row.name || "",
    sort_order: row.sort_order,
    slots,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/* GET ?shotId=xxx — 返回该 shot 的所有 keyframe sets（含 slots/candidates） */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const shotId = request.nextUrl.searchParams.get("shotId") || "";
    if (!shotId) return apiError(new Error("MISSING_SHOT_ID"), "缺少 shotId 参数。");

    const sets = await serviceFetch<DbSetRow[]>(
      `/rest/v1/storyflow_keyframe_sets?shot_id=eq.${encodeURIComponent(shotId)}&select=*&order=sort_order.asc,created_at.asc`,
    );

    const slots = await serviceFetch<DbSlotRow[]>(
      `/rest/v1/storyflow_keyframe_slots?shot_id=eq.${encodeURIComponent(shotId)}&select=*&order=sort_order.asc,created_at.asc`,
    );

    const slotIds = slots.map((s) => s.id);
    let candidates: DbCandidateRow[] = [];
    if (slotIds.length > 0) {
      const inFilter = slotIds.map((id) => encodeURIComponent(id)).join(",");
      candidates = await serviceFetch<DbCandidateRow[]>(
        `/rest/v1/storyflow_keyframe_candidates?keyframe_slot_id=in.(${inFilter})&select=*&order=sort_order.asc,created_at.asc`,
      );
    }

    const candidatesBySlot = new Map<string, KeyframeCandidate[]>();
    for (const c of candidates) {
      const list = candidatesBySlot.get(c.keyframe_slot_id) || [];
      list.push(mapCandidate(c));
      candidatesBySlot.set(c.keyframe_slot_id, list);
    }

    const slotsBySet = new Map<string, KeyframeSlot[]>();
    for (const s of slots) {
      const list = slotsBySet.get(s.keyframe_set_id) || [];
      list.push(mapSlot(s, candidatesBySlot.get(s.id) || []));
      slotsBySet.set(s.keyframe_set_id, list);
    }

    const result = (sets || []).map((set) => mapSet(set, slotsBySet.get(set.id) || []));
    return ok({ sets: result });
  } catch (error) {
    return apiError(error, "获取关键帧数据失败。");
  }
}

/* ------------------------------------------------------------------ */
/* POST — 创建 keyframe set / slot / candidate（body.type 区分）        */
/* ------------------------------------------------------------------ */

type CreateSetBody = {
  type: "set";
  shotId: string;
  projectId: string;
  name?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

type CreateSlotBody = {
  type: "slot";
  setId: string;
  shotId: string;
  slotRole?: KeyframeSlotRole;
  timestampRatio?: number;
  label?: string;
  sortOrder?: number;
};

type CreateCandidateBody = {
  type: "candidate";
  slotId: string;
  prompt?: string;
  negativePrompt?: string;
  provider?: string;
  model?: string;
  imageUrl?: string;
  generationJobId?: string;
  status?: KeyframeCandidateStatus;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

type CreateBody = CreateSetBody | CreateSlotBody | CreateCandidateBody;

export async function POST(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const body = (await request.json()) as CreateBody;
    if (!body || !body.type) return apiError(new Error("INVALID_BODY"), "请求体缺少 type 字段。");

    if (body.type === "set") {
      if (!body.shotId || !body.projectId) {
        return apiError(new Error("MISSING_FIELDS"), "缺少 shotId 或 projectId。");
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const row = {
        id,
        project_id: body.projectId,
        shot_id: body.shotId,
        name: body.name || "",
        sort_order: body.sortOrder ?? 0,
        metadata: body.metadata || {},
        created_at: now,
        updated_at: now,
      };
      await serviceFetch(`/rest/v1/storyflow_keyframe_sets`, {
        method: "POST",
        body: JSON.stringify(row),
      });
      const created = await serviceFetch<DbSetRow[]>(
        `/rest/v1/storyflow_keyframe_sets?id=eq.${encodeURIComponent(id)}&select=*`,
      );
      return ok({ set: mapSet(created[0], []) });
    }

    if (body.type === "slot") {
      if (!body.setId || !body.shotId) {
        return apiError(new Error("MISSING_FIELDS"), "缺少 setId 或 shotId。");
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const role: KeyframeSlotRole = body.slotRole || "single";
      const ratio = typeof body.timestampRatio === "number" ? clampRatio(body.timestampRatio) : 0;
      const row = {
        id,
        keyframe_set_id: body.setId,
        shot_id: body.shotId,
        slot_role: role,
        timestamp_ratio: ratio,
        selected_candidate_id: null,
        label: body.label || "",
        sort_order: body.sortOrder ?? 0,
        created_at: now,
        updated_at: now,
      };
      await serviceFetch(`/rest/v1/storyflow_keyframe_slots`, {
        method: "POST",
        body: JSON.stringify(row),
      });
      const created = await serviceFetch<DbSlotRow[]>(
        `/rest/v1/storyflow_keyframe_slots?id=eq.${encodeURIComponent(id)}&select=*`,
      );
      return ok({ slot: mapSlot(created[0], []) });
    }

    if (body.type === "candidate") {
      if (!body.slotId) {
        return apiError(new Error("MISSING_FIELDS"), "缺少 slotId。");
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const row = {
        id,
        keyframe_slot_id: body.slotId,
        image_url: body.imageUrl || null,
        prompt: body.prompt || "",
        negative_prompt: body.negativePrompt || "",
        provider: body.provider || null,
        model: body.model || null,
        generation_job_id: body.generationJobId || null,
        status: body.status || "draft",
        is_selected: false,
        sort_order: body.sortOrder ?? 0,
        metadata: body.metadata || {},
        created_at: now,
        updated_at: now,
      };
      await serviceFetch(`/rest/v1/storyflow_keyframe_candidates`, {
        method: "POST",
        body: JSON.stringify(row),
      });
      const created = await serviceFetch<DbCandidateRow[]>(
        `/rest/v1/storyflow_keyframe_candidates?id=eq.${encodeURIComponent(id)}&select=*`,
      );
      return ok({ candidate: mapCandidate(created[0]) });
    }

    return apiError(new Error("INVALID_TYPE"), "type 必须是 set / slot / candidate。");
  } catch (error) {
    return apiError(error, "创建关键帧失败。");
  }
}

/* ------------------------------------------------------------------ */
/* PATCH — 更新（选中 candidate、更新 prompt 等）                       */
/* ------------------------------------------------------------------ */

type PatchSetBody = {
  type: "set";
  id: string;
  patch: {
    name?: string;
    sortOrder?: number;
    metadata?: Record<string, unknown>;
  };
};

type PatchSlotBody = {
  type: "slot";
  id: string;
  patch: {
    slotRole?: KeyframeSlotRole;
    timestampRatio?: number;
    selectedCandidateId?: string | null;
    label?: string;
    sortOrder?: number;
  };
};

type PatchCandidateBody = {
  type: "candidate";
  id: string;
  patch: {
    imageUrl?: string | null;
    prompt?: string;
    negativePrompt?: string;
    provider?: string | null;
    model?: string | null;
    generationJobId?: string | null;
    status?: KeyframeCandidateStatus;
    isSelected?: boolean;
    sortOrder?: number;
    metadata?: Record<string, unknown>;
  };
};

type PatchBody = PatchSetBody | PatchSlotBody | PatchCandidateBody;

export async function PATCH(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const body = (await request.json()) as PatchBody;
    if (!body || !body.type || !body.id) {
      return apiError(new Error("INVALID_BODY"), "请求体缺少 type 或 id 字段。");
    }
    if (!body.patch || typeof body.patch !== "object") {
      return apiError(new Error("INVALID_BODY"), "请求体缺少 patch 字段。");
    }

    if (body.type === "set") {
      const updates = buildSetUpdates(body.patch);
      if (Object.keys(updates).length === 0) return apiError(new Error("EMPTY_PATCH"), "没有可更新的字段。");
      updates.updated_at = new Date().toISOString();
      await serviceFetch(`/rest/v1/storyflow_keyframe_sets?id=eq.${encodeURIComponent(body.id)}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      const updated = await serviceFetch<DbSetRow[]>(
        `/rest/v1/storyflow_keyframe_sets?id=eq.${encodeURIComponent(body.id)}&select=*`,
      );
      return ok({ set: updated[0] ? mapSet(updated[0], []) : null });
    }

    if (body.type === "slot") {
      // 选中 candidate 的特殊流程：同时更新 slot.selected_candidate_id 和所有 candidate.is_selected
      if (Object.prototype.hasOwnProperty.call(body.patch, "selectedCandidateId")) {
        const candidateId = body.patch.selectedCandidateId || null;
        await selectCandidateFlow(body.id, candidateId);
        const updated = await serviceFetch<DbSlotRow[]>(
          `/rest/v1/storyflow_keyframe_slots?id=eq.${encodeURIComponent(body.id)}&select=*`,
        );
        const candidates = await fetchCandidatesForSlot(body.id);
        return ok({ slot: updated[0] ? mapSlot(updated[0], candidates) : null });
      }

      const updates = buildSlotUpdates(body.patch);
      if (Object.keys(updates).length === 0) return apiError(new Error("EMPTY_PATCH"), "没有可更新的字段。");
      updates.updated_at = new Date().toISOString();
      await serviceFetch(`/rest/v1/storyflow_keyframe_slots?id=eq.${encodeURIComponent(body.id)}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      const updated = await serviceFetch<DbSlotRow[]>(
        `/rest/v1/storyflow_keyframe_slots?id=eq.${encodeURIComponent(body.id)}&select=*`,
      );
      const candidates = await fetchCandidatesForSlot(body.id);
      return ok({ slot: updated[0] ? mapSlot(updated[0], candidates) : null });
    }

    if (body.type === "candidate") {
      const updates = buildCandidateUpdates(body.patch);
      if (Object.keys(updates).length === 0) return apiError(new Error("EMPTY_PATCH"), "没有可更新的字段。");
      updates.updated_at = new Date().toISOString();
      await serviceFetch(`/rest/v1/storyflow_keyframe_candidates?id=eq.${encodeURIComponent(body.id)}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      const updated = await serviceFetch<DbCandidateRow[]>(
        `/rest/v1/storyflow_keyframe_candidates?id=eq.${encodeURIComponent(body.id)}&select=*`,
      );
      return ok({ candidate: updated[0] ? mapCandidate(updated[0]) : null });
    }

    return apiError(new Error("INVALID_TYPE"), "type 必须是 set / slot / candidate。");
  } catch (error) {
    return apiError(error, "更新关键帧失败。");
  }
}

/* ------------------------------------------------------------------ */
/* DELETE ?id=xxx&type=set|slot|candidate                              */
/* ------------------------------------------------------------------ */

export async function DELETE(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const id = request.nextUrl.searchParams.get("id") || "";
    const type = (request.nextUrl.searchParams.get("type") || "") as "set" | "slot" | "candidate";
    if (!id || !type) return apiError(new Error("MISSING_PARAMS"), "缺少 id 或 type 参数。");

    let table = "";
    if (type === "set") table = "storyflow_keyframe_sets";
    else if (type === "slot") table = "storyflow_keyframe_slots";
    else if (type === "candidate") table = "storyflow_keyframe_candidates";
    else return apiError(new Error("INVALID_TYPE"), "type 必须是 set / slot / candidate。");

    await serviceFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return ok({ deleted: true, id, type });
  } catch (error) {
    return apiError(error, "删除关键帧失败。");
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function buildSetUpdates(patch: PatchSetBody["patch"]): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "name")) updates.name = patch.name || "";
  if (Object.prototype.hasOwnProperty.call(patch, "sortOrder")) updates.sort_order = patch.sortOrder ?? 0;
  if (Object.prototype.hasOwnProperty.call(patch, "metadata")) updates.metadata = patch.metadata || {};
  return updates;
}

function buildSlotUpdates(patch: PatchSlotBody["patch"]): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "slotRole")) updates.slot_role = patch.slotRole || "single";
  if (Object.prototype.hasOwnProperty.call(patch, "timestampRatio")) {
    updates.timestamp_ratio = clampRatio(Number(patch.timestampRatio) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "label")) updates.label = patch.label || "";
  if (Object.prototype.hasOwnProperty.call(patch, "sortOrder")) updates.sort_order = patch.sortOrder ?? 0;
  return updates;
}

function buildCandidateUpdates(patch: PatchCandidateBody["patch"]): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "imageUrl")) {
    updates.image_url = patch.imageUrl || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "prompt")) updates.prompt = patch.prompt || "";
  if (Object.prototype.hasOwnProperty.call(patch, "negativePrompt")) {
    updates.negative_prompt = patch.negativePrompt || "";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "provider")) updates.provider = patch.provider || null;
  if (Object.prototype.hasOwnProperty.call(patch, "model")) updates.model = patch.model || null;
  if (Object.prototype.hasOwnProperty.call(patch, "generationJobId")) {
    updates.generation_job_id = patch.generationJobId || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) updates.status = patch.status || "draft";
  if (Object.prototype.hasOwnProperty.call(patch, "isSelected")) {
    updates.is_selected = Boolean(patch.isSelected);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "sortOrder")) updates.sort_order = patch.sortOrder ?? 0;
  if (Object.prototype.hasOwnProperty.call(patch, "metadata")) updates.metadata = patch.metadata || {};
  return updates;
}

async function selectCandidateFlow(slotId: string, candidateId: string | null): Promise<void> {
  const now = new Date().toISOString();
  // 1. 清空该 slot 下所有 candidate 的 is_selected
  await serviceFetch(
    `/rest/v1/storyflow_keyframe_candidates?keyframe_slot_id=eq.${encodeURIComponent(slotId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ is_selected: false, updated_at: now }),
    },
  );
  // 2. 更新 slot.selected_candidate_id
  await serviceFetch(`/rest/v1/storyflow_keyframe_slots?id=eq.${encodeURIComponent(slotId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      selected_candidate_id: candidateId,
      updated_at: now,
    }),
  });
  // 3. 标记被选中的 candidate
  if (candidateId) {
    await serviceFetch(`/rest/v1/storyflow_keyframe_candidates?id=eq.${encodeURIComponent(candidateId)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_selected: true, updated_at: now }),
    });
  }
}

async function fetchCandidatesForSlot(slotId: string): Promise<KeyframeCandidate[]> {
  const rows = await serviceFetch<DbCandidateRow[]>(
    `/rest/v1/storyflow_keyframe_candidates?keyframe_slot_id=eq.${encodeURIComponent(slotId)}&select=*&order=sort_order.asc,created_at.asc`,
  );
  return (rows || []).map(mapCandidate);
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return Math.round(ratio * 10000) / 10000;
}
