import type { ChangeProposal, ProposalFieldDiff } from "@/lib/contracts/v2";

export type ProposalFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export type ProposalAction = "accept" | "edit_accept" | "reject" | "defer";

export class ProposalError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "service_unavailable";

  constructor(code: ProposalError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "ProposalError";
    this.code = code;
  }
}

type ProposalRow = {
  id: string;
  universe_id: string;
  user_id: string;
  source_project_id: string;
  source_step: string;
  source_text?: string | null;
  source_asset_id?: string | null;
  source_reference?: Record<string, unknown> | null;
  confidence: number;
  field_diffs?: ProposalFieldDiff[] | null;
  suggested_action?: string | null;
  idempotency_key: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type ProposalItemRow = {
  id: string;
  proposal_id: string;
  object_type: string;
  object_id?: string | null;
  current_payload?: Record<string, unknown> | null;
  proposed_payload?: Record<string, unknown> | null;
  field_diffs?: ProposalFieldDiff[] | null;
};

type UniverseRow = { id: string; user_id?: string | null; team_id?: string | null; name?: string };
type ProjectRow = { id: string; owner_id?: string | null; user_id?: string | null; universe_id?: string | null };

export interface ProposalInput {
  sourceProjectId: string;
  sourceStep: string;
  originalText?: string;
  sourceAssetId?: string;
  sourceReference?: { kind: "text" | "asset" | "decision"; label: string };
  confidence: number;
  fieldDiffs: ProposalFieldDiff[];
  suggestedAction: string;
  idempotencyKey: string;
  target: { objectType: string; objectId?: string };
  proposedPayload: Record<string, unknown>;
  currentPayload?: Record<string, unknown>;
  items?: Array<{
    objectType: string;
    objectId?: string;
    proposedPayload: Record<string, unknown>;
    currentPayload?: Record<string, unknown>;
    fieldDiffs?: ProposalFieldDiff[];
  }>;
}

export type ProposalDto = ChangeProposal & {
  originalText: string;
  sourceAssetId: string | null;
  suggestedAction: string;
  idempotencyKey: string;
};

export async function createProposal(params: { fetcher: ProposalFetcher; userId: string; universeId: string; input: ProposalInput }) {
  await assertUniverseAccess(params);
  validateProposalInput(params.input);
  await assertSourceProject(params.fetcher, params.userId, params.input.sourceProjectId);
  const existing = await query<ProposalRow[]>(params.fetcher, proposalPath(params.universeId, params.userId, params.input.idempotencyKey));
  if (existing?.[0]) return { proposal: toProposalDto(existing[0]), created: false };

  const rows = await query<ProposalRow[]>(params.fetcher, "/rest/v1/storyflow_change_proposals", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({
      universe_id: params.universeId,
      user_id: params.userId,
      source_project_id: params.input.sourceProjectId,
      source_step: params.input.sourceStep,
      source_text: params.input.originalText || "",
      source_asset_id: params.input.sourceAssetId || null,
      source_reference: params.input.sourceReference || null,
      confidence: params.input.confidence,
      field_diffs: params.input.fieldDiffs,
      suggested_action: params.input.suggestedAction,
      idempotency_key: params.input.idempotencyKey,
      status: "pending_review",
    }),
  });
  const proposal = rows?.[0] || (await query<ProposalRow[]>(params.fetcher, proposalPath(params.universeId, params.userId, params.input.idempotencyKey)))[0];
  if (!proposal) throw new ProposalError("service_unavailable", "Unable to create change proposal.");

  const items = params.input.items?.length ? params.input.items : [{
    objectType: params.input.target.objectType,
    objectId: params.input.target.objectId,
    proposedPayload: params.input.proposedPayload,
    currentPayload: params.input.currentPayload,
    fieldDiffs: params.input.fieldDiffs,
  }];
  await query(params.fetcher, "/rest/v1/storyflow_change_proposal_items", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify(items.map((item) => ({
      proposal_id: proposal.id,
      object_type: item.objectType,
      object_id: item.objectId || null,
      current_payload: item.currentPayload || null,
      proposed_payload: item.proposedPayload,
      field_diffs: item.fieldDiffs || [],
    }))),
  });
  return { proposal: toProposalDto(proposal), created: proposal.id === rows?.[0]?.id };
}

export async function createProposalBatch(params: {
  fetcher: ProposalFetcher;
  userId: string;
  universeId: string;
  inputs?: ProposalInput[];
  proposalIds?: string[];
  action?: "create" | "preview_accept" | "accept";
}) {
  await assertUniverseAccess(params);
  if (params.action === "preview_accept") {
    if (!params.proposalIds?.length) throw new ProposalError("validation_failed", "proposalIds are required for a batch impact preview.");
    return previewBatch({ fetcher: params.fetcher, userId: params.userId, universeId: params.universeId, proposalIds: params.proposalIds });
  }
  if (params.action === "accept") {
    if (!params.proposalIds?.length) throw new ProposalError("validation_failed", "proposalIds are required for batch acceptance.");
    return query<{ items: Array<Record<string, unknown>> }>(params.fetcher, "/rpc/apply_change_proposal_batch", {
      method: "POST",
      body: JSON.stringify({ p_user_id: params.userId, p_universe_id: params.universeId, p_proposal_ids: params.proposalIds }),
    });
  }
  if (!params.inputs?.length) throw new ProposalError("validation_failed", "inputs are required for a batch proposal.");
  const results = [];
  for (const input of params.inputs) results.push(await createProposal({ ...params, input }));
  return { items: results.map((result) => result.proposal), createdCount: results.filter((result) => result.created).length };
}

export async function listProposals(params: { fetcher: ProposalFetcher; userId: string; universeId: string; status?: string }) {
  await assertUniverseAccess(params);
  const status = params.status ? `&status=eq.${encodeURIComponent(params.status)}` : "";
  const rows = await query<ProposalRow[]>(params.fetcher, `/rest/v1/storyflow_change_proposals?universe_id=eq.${encodeURIComponent(params.universeId)}&user_id=eq.${encodeURIComponent(params.userId)}${status}&select=*&order=created_at.desc&limit=500`);
  return { items: (rows || []).map(toProposalDto) };
}

export async function readProposal(params: { fetcher: ProposalFetcher; userId: string; universeId: string; proposalId: string }) {
  await assertUniverseAccess(params);
  const rows = await query<ProposalRow[]>(params.fetcher, `/rest/v1/storyflow_change_proposals?id=eq.${encodeURIComponent(params.proposalId)}&universe_id=eq.${encodeURIComponent(params.universeId)}&user_id=eq.${encodeURIComponent(params.userId)}&select=*&limit=1`);
  const row = rows?.[0];
  if (!row) throw new ProposalError("not_found", "Change proposal not found.");
  const items = await query<ProposalItemRow[]>(params.fetcher, `/rest/v1/storyflow_change_proposal_items?proposal_id=eq.${encodeURIComponent(row.id)}&select=*&order=id.asc&limit=500`);
  return { proposal: toProposalDto(row), items: (items || []).map(toItemDto) };
}

export async function updateProposal(params: {
  fetcher: ProposalFetcher;
  userId: string;
  universeId: string;
  proposalId: string;
  action: ProposalAction | string;
  editedPayload?: Record<string, unknown>;
}) {
  await assertUniverseAccess(params);
  if (!["accept", "edit_accept", "reject", "defer"].includes(params.action)) throw new ProposalError("validation_failed", "Unsupported proposal action.");
  const result = await query<{ proposalId: string; status: string; versionId?: string | null; affected?: Array<{ objectType: string; count: number }> }>(params.fetcher, "/rpc/apply_change_proposal", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: params.userId,
      p_universe_id: params.universeId,
      p_proposal_id: params.proposalId,
      p_action: params.action,
      p_edited_payload: params.editedPayload || null,
    }),
  });
  return { ...result, id: result.proposalId };
}

async function previewBatch(params: { fetcher: ProposalFetcher; userId: string; universeId: string; proposalIds: string[] }) {
  const idFilter = params.proposalIds.map(encodeURIComponent).join(",");
  const rows = await query<ProposalRow[]>(params.fetcher, `/rest/v1/storyflow_change_proposals?id=in.(${idFilter})&universe_id=eq.${encodeURIComponent(params.universeId)}&user_id=eq.${encodeURIComponent(params.userId)}&select=*&limit=500`);
  const items = await query<ProposalItemRow[]>(params.fetcher, `/rest/v1/storyflow_change_proposal_items?proposal_id=in.(${idFilter})&select=*&limit=2000`);
  const objects = new Map<string, number>();
  for (const item of items || []) objects.set(`${item.object_type}:${item.object_id || item.id}`, (objects.get(`${item.object_type}:${item.object_id || item.id}`) || 0) + 1);
  const affectedObjectTypes: Record<string, number> = {};
  for (const key of objects.keys()) {
    const type = key.split(":", 1)[0];
    affectedObjectTypes[type] = (affectedObjectTypes[type] || 0) + 1;
  }
  return { proposals: (rows || []).map(toProposalDto), impactSummary: { proposalCount: rows?.length || 0, affectedObjectCount: objects.size, affectedObjectTypes } };
}

async function recordProposalEvent(fetcher: ProposalFetcher, userId: string, universeId: string, proposalId: string, action: string) {
  await query(fetcher, "/rpc/record_change_proposal_event", {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId, p_universe_id: universeId, p_proposal_id: proposalId, p_action: action }),
  });
}

async function assertUniverseAccess(params: { fetcher: ProposalFetcher; userId: string; universeId: string }) {
  if (!params.userId) throw new ProposalError("unauthenticated", "Authentication is required.");
  if (!params.universeId) throw new ProposalError("validation_failed", "Universe id is required.");
  const rows = await query<UniverseRow[]>(params.fetcher, `/rest/v1/storyflow_universes?id=eq.${encodeURIComponent(params.universeId)}&select=id,user_id,team_id,name&limit=1`);
  const universe = rows?.[0];
  if (!universe) throw new ProposalError("not_found", "Universe not found.");
  if (universe.user_id !== params.userId && universe.team_id) {
    const members = await query<Array<{ team_id: string }>>(params.fetcher, `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(universe.team_id)}&user_id=eq.${encodeURIComponent(params.userId)}&status=eq.active&select=team_id&limit=1`);
    if (!members?.length) throw new ProposalError("forbidden", "Universe access denied.");
  } else if (universe.user_id !== params.userId) {
    throw new ProposalError("forbidden", "Universe access denied.");
  }
}

async function assertSourceProject(fetcher: ProposalFetcher, userId: string, projectId: string) {
  const rows = await query<ProjectRow[]>(fetcher, `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&select=id,owner_id,user_id,universe_id&limit=1`);
  const project = rows?.[0];
  if (!project) throw new ProposalError("not_found", "Source project not found.");
  if (project.owner_id !== userId && project.user_id !== userId) throw new ProposalError("forbidden", "Source project access denied.");
}

function validateProposalInput(input: ProposalInput) {
  if (!input.sourceProjectId || !input.sourceStep || !input.idempotencyKey || !input.target?.objectType) throw new ProposalError("validation_failed", "sourceProjectId, sourceStep, target, and idempotencyKey are required.");
  if (!input.originalText && !input.sourceAssetId) throw new ProposalError("validation_failed", "Proposal must include original text or an asset reference.");
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) throw new ProposalError("validation_failed", "confidence must be between 0 and 1.");
  if (!Array.isArray(input.fieldDiffs)) throw new ProposalError("validation_failed", "fieldDiffs must be an array.");
}

function proposalPath(universeId: string, userId: string, idempotencyKey: string) {
  return `/rest/v1/storyflow_change_proposals?universe_id=eq.${encodeURIComponent(universeId)}&user_id=eq.${encodeURIComponent(userId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=*&limit=1`;
}

function toProposalDto(row: ProposalRow): ChangeProposal {
  return {
    id: row.id,
    universeId: row.universe_id,
    sourceProjectId: row.source_project_id,
    sourceStep: row.source_step,
    status: row.status === "edited_and_accepted" ? "edited_and_accepted" : row.status === "accepted" ? "accepted" : row.status === "rejected" ? "rejected" : row.status === "deferred" ? "deferred" : row.status === "draft" ? "draft" : "pending_review",
    confidence: Number(row.confidence),
    fieldDiffs: row.field_diffs || [],
    sourceReference: row.source_reference as ChangeProposal["sourceReference"],
    createdAt: row.created_at,
    originalText: row.source_text || "",
    sourceAssetId: row.source_asset_id || null,
    suggestedAction: row.suggested_action || "",
    idempotencyKey: row.idempotency_key,
  } as ProposalDto;
}

function toItemDto(row: ProposalItemRow) {
  return { id: row.id, proposalId: row.proposal_id, objectType: row.object_type, objectId: row.object_id || null, currentPayload: row.current_payload || null, proposedPayload: row.proposed_payload || {}, fieldDiffs: row.field_diffs || [] };
}

async function query<T>(fetcher: ProposalFetcher, path: string, init?: RequestInit): Promise<T> {
  try {
    return await fetcher<T>(path, init);
  } catch (error) {
    if (error instanceof ProposalError) throw error;
    throw new ProposalError("service_unavailable", error instanceof Error ? error.message : "Proposal service unavailable.");
  }
}
