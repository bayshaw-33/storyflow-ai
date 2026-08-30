import type { ProposalFieldDiff } from "../../../contracts/v2/index.ts";
import { createProposal } from "../proposals/index.ts";

export type LocalStateFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export type LocalStateEntityType = "entity" | "fact" | "relationship" | "timeline_event" | "asset";

export class InheritanceLocalStateError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "service_unavailable";

  constructor(code: InheritanceLocalStateError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "InheritanceLocalStateError";
    this.code = code;
  }
}

type WorkRow = { id: string; owner_id: string; project_id?: string | null };
type ManifestRow = { id: string; work_id: string; universe_id: string; is_active: boolean };
type SnapshotRow = { object_snapshot?: Record<string, unknown> | null };
type ProjectStepRow = { step_key: string };
type LocalStateRow = {
  id: string;
  work_id: string;
  base_manifest_id: string;
  entity_type: LocalStateEntityType;
  entity_id: string;
  patch_json?: Record<string, unknown> | null;
  revision: number;
  status: "active" | "superseded";
  created_by: string;
  created_at: string;
  updated_at: string;
};

export interface WorkLocalState {
  id: string;
  workId: string;
  baseManifestId: string;
  entityType: LocalStateEntityType;
  entityId: string;
  patch: Record<string, unknown>;
  revision: number;
  status: "active" | "superseded";
  createdAt: string;
  updatedAt: string;
}

const ENTITY_TYPES = new Set<LocalStateEntityType>(["entity", "fact", "relationship", "timeline_event", "asset"]);
const LOCAL_STATE_SELECT = "id,work_id,base_manifest_id,entity_type,entity_id,patch_json,revision,status,created_by,created_at,updated_at";

export async function listLocalStates(params: {
  fetcher: LocalStateFetcher;
  ownerId: string;
  workId: string;
}): Promise<WorkLocalState[]> {
  await loadOwnedWork(params.fetcher, params.workId, params.ownerId);
  const rows = await query<LocalStateRow[]>(
    params.fetcher,
    `/rest/v1/storyflow_work_local_states?work_id=eq.${encodeURIComponent(params.workId)}&status=eq.active&select=${LOCAL_STATE_SELECT}&order=updated_at.desc&limit=500`,
  );
  return (rows ?? []).map(toDto);
}

export async function upsertLocalState(params: {
  fetcher: LocalStateFetcher;
  ownerId: string;
  workId: string;
  entityType: LocalStateEntityType | string;
  entityId: string;
  note: string;
  expectedRevision?: number;
}): Promise<{ state: WorkLocalState; created: boolean }> {
  validateInput(params);
  const work = await loadOwnedWork(params.fetcher, params.workId, params.ownerId);
  const { manifest, object } = await loadInheritedObject(
    params.fetcher,
    work.id,
    params.entityType as LocalStateEntityType,
    params.entityId,
  );
  if (!object) {
    throw new InheritanceLocalStateError("validation_failed", "The selected object is not part of the Work inheritance snapshot.");
  }

  const existing = await query<LocalStateRow[]>(
    params.fetcher,
    `/rest/v1/storyflow_work_local_states?work_id=eq.${encodeURIComponent(work.id)}&entity_type=eq.${encodeURIComponent(params.entityType)}&entity_id=eq.${encodeURIComponent(params.entityId)}&status=eq.active&select=${LOCAL_STATE_SELECT}&limit=1`,
  );
  const current = existing?.[0];
  const patch = { note: params.note.trim() };

  if (current) {
    if (!Number.isInteger(params.expectedRevision) || params.expectedRevision !== Number(current.revision)) {
      throw new InheritanceLocalStateError("conflict", "The local override changed. Reload it before saving again.");
    }
    const rows = await query<LocalStateRow[]>(
      params.fetcher,
      `/rest/v1/storyflow_work_local_states?id=eq.${encodeURIComponent(current.id)}&revision=eq.${current.revision}&select=${LOCAL_STATE_SELECT}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ patch_json: patch, revision: current.revision + 1 }),
      },
    );
    const updated = rows?.[0];
    if (!updated) throw new InheritanceLocalStateError("conflict", "The local override changed while it was being saved.");
    return { state: toDto(updated), created: false };
  }

  const rows = await query<LocalStateRow[]>(params.fetcher, "/rest/v1/storyflow_work_local_states", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      work_id: work.id,
      base_manifest_id: manifest.id,
      entity_type: params.entityType,
      entity_id: params.entityId,
      patch_json: patch,
      revision: 1,
      status: "active",
      created_by: params.ownerId,
    }),
  });
  const created = rows?.[0];
  if (!created) throw new InheritanceLocalStateError("service_unavailable", "The local override was not saved.");
  return { state: toDto(created), created: true };
}

export async function proposeLocalState(params: {
  fetcher: LocalStateFetcher;
  ownerId: string;
  workId: string;
  stateId: string;
}) {
  if (!params.stateId) throw new InheritanceLocalStateError("validation_failed", "stateId is required.");
  const work = await loadOwnedWork(params.fetcher, params.workId, params.ownerId);
  if (!work.project_id) throw new InheritanceLocalStateError("validation_failed", "The Work has no source Project.");

  const states = await query<LocalStateRow[]>(
    params.fetcher,
    `/rest/v1/storyflow_work_local_states?id=eq.${encodeURIComponent(params.stateId)}&work_id=eq.${encodeURIComponent(work.id)}&status=eq.active&select=${LOCAL_STATE_SELECT}&limit=1`,
  );
  const state = states?.[0];
  if (!state) throw new InheritanceLocalStateError("not_found", "Local override not found.");

  const { manifest, object } = await loadInheritedObject(params.fetcher, work.id, state.entity_type, state.entity_id);
  if (!object) throw new InheritanceLocalStateError("conflict", "The inherited object is no longer available.");

  const steps = await query<ProjectStepRow[]>(
    params.fetcher,
    `/rest/v1/storyflow_project_steps?project_id=eq.${encodeURIComponent(work.project_id)}&user_id=eq.${encodeURIComponent(params.ownerId)}&select=step_key&order=updated_at.desc&limit=1`,
  );
  const sourceStep = steps?.[0]?.step_key;
  if (!sourceStep) throw new InheritanceLocalStateError("conflict", "The source Project has no eligible workflow step.");

  const patch = state.patch_json ?? {};
  const currentPayload = asRecord(object);
  const proposedPayload = { ...currentPayload, ...patch };
  const fieldDiffs: ProposalFieldDiff[] = Object.entries(patch).map(([path, after]) => ({
    path,
    before: currentPayload[path],
    after,
  }));

  return createProposal({
    fetcher: params.fetcher,
    userId: params.ownerId,
    universeId: manifest.universe_id,
    input: {
      sourceProjectId: work.project_id,
      sourceStep,
      originalText: typeof patch.note === "string" ? patch.note : JSON.stringify(patch),
      sourceReference: { kind: "decision", label: `Work local override r${state.revision}` },
      confidence: 1,
      fieldDiffs,
      suggestedAction: "review_local_override",
      idempotencyKey: `work-local:${state.id}:r${state.revision}`,
      target: { objectType: state.entity_type, objectId: state.entity_id },
      currentPayload,
      proposedPayload,
    },
  });
}

async function loadOwnedWork(fetcher: LocalStateFetcher, workId: string, ownerId: string): Promise<WorkRow> {
  if (!ownerId) throw new InheritanceLocalStateError("unauthenticated", "Authentication is required.");
  if (!workId) throw new InheritanceLocalStateError("validation_failed", "workId is required.");
  const rows = await query<WorkRow[]>(fetcher, `/rest/v1/storyflow_works?id=eq.${encodeURIComponent(workId)}&select=id,owner_id,project_id&limit=1`);
  const work = rows?.[0];
  if (!work) throw new InheritanceLocalStateError("not_found", "Work not found.");
  if (work.owner_id !== ownerId) throw new InheritanceLocalStateError("forbidden", "Work access denied.");
  return work;
}

async function loadInheritedObject(
  fetcher: LocalStateFetcher,
  workId: string,
  entityType: LocalStateEntityType,
  entityId: string,
): Promise<{ manifest: ManifestRow; object: unknown | null }> {
  const manifests = await query<ManifestRow[]>(fetcher, `/rest/v1/storyflow_work_inheritance_manifests?work_id=eq.${encodeURIComponent(workId)}&is_active=eq.true&select=id,work_id,universe_id,is_active&limit=1`);
  const manifest = manifests?.[0];
  if (!manifest) throw new InheritanceLocalStateError("conflict", "The Work is not bound to an active Universe inheritance manifest.");
  const snapshots = await query<SnapshotRow[]>(fetcher, `/rest/v1/storyflow_work_inheritance_snapshots?manifest_id=eq.${encodeURIComponent(manifest.id)}&select=object_snapshot&limit=1`);
  const snapshot = snapshots?.[0]?.object_snapshot ?? {};
  const object = findSnapshotObject(snapshot, entityType, entityId);
  return { manifest, object };
}

function findSnapshotObject(snapshot: Record<string, unknown>, entityType: LocalStateEntityType, entityId: string): unknown | null {
  const keys: Record<LocalStateEntityType, string[]> = {
    entity: ["entities"],
    fact: ["facts"],
    relationship: ["relationships"],
    timeline_event: ["timeline_events", "timelineEvents"],
    asset: ["assets"],
  };
  for (const key of keys[entityType]) {
    const rows = snapshot[key];
    if (!Array.isArray(rows)) continue;
    const match = rows.find((item) => {
      if (typeof item === "string") return item === entityId;
      return Boolean(item && typeof item === "object" && String((item as Record<string, unknown>).id ?? "") === entityId);
    });
    if (match !== undefined) return match;
  }
  return null;
}

function validateInput(params: { entityType: string; entityId: string; note: string }) {
  if (!ENTITY_TYPES.has(params.entityType as LocalStateEntityType)) {
    throw new InheritanceLocalStateError("validation_failed", "Unsupported local override object type.");
  }
  if (!params.entityId?.trim()) throw new InheritanceLocalStateError("validation_failed", "entityId is required.");
  const note = params.note?.trim();
  if (!note) throw new InheritanceLocalStateError("validation_failed", "A local override note is required.");
  if (note.length > 2000) throw new InheritanceLocalStateError("validation_failed", "The local override note must be at most 2000 characters.");
}

function toDto(row: LocalStateRow): WorkLocalState {
  return {
    id: row.id,
    workId: row.work_id,
    baseManifestId: row.base_manifest_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    patch: row.patch_json ?? {},
    revision: Number(row.revision) || 0,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function query<T>(fetcher: LocalStateFetcher, path: string, init?: RequestInit): Promise<T> {
  try {
    return await fetcher<T>(path, init);
  } catch (error) {
    if (error instanceof InheritanceLocalStateError) throw error;
    throw new InheritanceLocalStateError("service_unavailable", error instanceof Error ? error.message : "Local override service unavailable.");
  }
}
