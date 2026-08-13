import type { Asset, AssetKind, AssetStatus, AssetVersion } from "@/lib/contracts/v2";

export type AssetFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export class AssetError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "service_unavailable";

  constructor(code: AssetError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "AssetError";
    this.code = code;
  }
}

const ASSET_KINDS: AssetKind[] = ["character", "scene", "prop", "style", "universe_package"];
const ASSET_STATUSES: AssetStatus[] = ["draft", "ready", "published", "suspended", "archived"];

type AssetRow = { id: string; owner_id: string; kind: string; name: string; status: string; current_version_id?: string | null; actor_id?: string | null; rights_state?: string | null; project_id?: string | null; metadata?: Record<string, unknown> | null; created_at: string; updated_at?: string | null };
type VersionRow = { id: string; asset_id: string; parent_version_id?: string | null; source_asset_id?: string | null; source_project_id: string; source_step: string; model_key?: string | null; generation_job_id?: string | null; selected_by_user_id?: string | null; change_description: string; storage_bucket: string; storage_path: string; preview_storage_bucket?: string | null; preview_storage_path?: string | null; metadata?: Record<string, unknown> | null; created_by: string; created_at: string };
type UsageRow = { id: string; asset_id: string; version_id?: string | null; project_id?: string | null; work_id?: string | null; usage_kind: string; created_at: string };

export interface CreateAssetInput { kind: AssetKind; name: string; projectId?: string; actorId?: string; rightsState?: "ai_generated" | "portrait_confirmed" | "portrait_pending"; metadata?: Record<string, unknown> }
export interface CreateAssetVersionInput { parentVersionId?: string; sourceAssetId?: string; sourceProjectId: string; sourceStep: string; modelKey?: string; generationJobId?: string; selectedByUserId?: string; changeDescription: string; storageBucket: string; storagePath: string; previewStorageBucket?: string; previewStoragePath?: string; metadata?: Record<string, unknown> }

export async function createAsset(params: { fetcher: AssetFetcher; userId: string; input: CreateAssetInput }) {
  if (!params.userId) throw new AssetError("unauthenticated", "Authentication is required.");
  validateCreateAsset(params.input);
  const rows = await query<AssetRow[]>(params.fetcher, "/rest/v1/storyflow_v2_assets", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ owner_id: params.userId, kind: params.input.kind, name: params.input.name.trim(), status: "draft", project_id: params.input.projectId || null, actor_id: params.input.actorId || null, rights_state: params.input.rightsState || "ai_generated", metadata: params.input.metadata || {} }) });
  const row = rows?.[0];
  if (!row) throw new AssetError("service_unavailable", "Unable to create asset.");
  return { asset: toAsset(row) };
}

export async function listAssets(params: { fetcher: AssetFetcher; userId: string; kind?: string | null; status?: string | null; projectId?: string | null }) {
  if (!params.userId) throw new AssetError("unauthenticated", "Authentication is required.");
  const filters = [`owner_id=eq.${encodeURIComponent(params.userId)}`];
  if (params.kind) { if (!ASSET_KINDS.includes(params.kind as AssetKind)) throw new AssetError("validation_failed", "Unsupported asset kind."); filters.push(`kind=eq.${encodeURIComponent(params.kind)}`); }
  if (params.status) { if (!ASSET_STATUSES.includes(params.status as AssetStatus)) throw new AssetError("validation_failed", "Unsupported asset status."); filters.push(`status=eq.${encodeURIComponent(params.status)}`); }
  if (params.projectId) filters.push(`project_id=eq.${encodeURIComponent(params.projectId)}`);
  const rows = await query<AssetRow[]>(params.fetcher, `/rest/v1/storyflow_v2_assets?${filters.join("&")}&select=*&order=created_at.desc&limit=500`);
  return { items: (rows || []).map(toAsset) };
}

export async function readAsset(params: { fetcher: AssetFetcher; userId: string; assetId: string }) { const asset = await loadAsset(params); const versions = await loadVersions(params.fetcher, params.assetId); return { asset: { ...asset, versions: versions.map(toAssetVersion) } }; }

export async function createAssetVersion(params: { fetcher: AssetFetcher; userId: string; assetId: string; input: CreateAssetVersionInput }) {
  const asset = await loadAsset(params); validateCreateVersion(params.input); if (asset.status === "archived") throw new AssetError("conflict", "Archived assets cannot receive new versions.");
  await assertVersionReferences(params);
  const rows = await query<VersionRow[]>(params.fetcher, "/rest/v1/storyflow_v2_asset_versions", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ asset_id: params.assetId, parent_version_id: params.input.parentVersionId || null, source_asset_id: params.input.sourceAssetId || null, source_project_id: params.input.sourceProjectId, source_step: params.input.sourceStep, model_key: params.input.modelKey || null, generation_job_id: params.input.generationJobId || null, selected_by_user_id: params.input.selectedByUserId || null, change_description: params.input.changeDescription.trim(), storage_bucket: params.input.storageBucket.trim(), storage_path: params.input.storagePath.trim(), preview_storage_bucket: params.input.previewStorageBucket || null, preview_storage_path: params.input.previewStoragePath || null, metadata: params.input.metadata || {}, created_by: params.userId }) });
  const row = rows?.[0]; if (!row) throw new AssetError("service_unavailable", "Unable to create asset version."); return { version: toAssetVersion(row) };
}

async function assertVersionReferences(params: { fetcher: AssetFetcher; userId: string; assetId: string; input: CreateAssetVersionInput }) {
  for (const [field, id, path] of [["parentVersionId", params.input.parentVersionId, "storyflow_v2_asset_versions"], ["sourceAssetId", params.input.sourceAssetId, "storyflow_v2_assets"]] as const) {
    if (!id) continue;
    const rows = await query<Array<{ id: string }>>(params.fetcher, `/rest/v1/${path}?id=eq.${encodeURIComponent(id)}${path === "storyflow_v2_asset_versions" ? `&asset_id=eq.${encodeURIComponent(params.assetId)}` : `&owner_id=eq.${encodeURIComponent(params.userId)}`}&select=id&limit=1`);
    if (!rows?.length) throw new AssetError("validation_failed", `${field} must reference an accessible record.`);
  }
}

export async function readAssetVersion(params: { fetcher: AssetFetcher; userId: string; assetId: string; versionId: string }) { await loadAsset(params); const rows = await query<VersionRow[]>(params.fetcher, `/rest/v1/storyflow_v2_asset_versions?id=eq.${encodeURIComponent(params.versionId)}&asset_id=eq.${encodeURIComponent(params.assetId)}&select=*&limit=1`); const row = rows?.[0]; if (!row) throw new AssetError("not_found", "Asset version not found."); return { version: toAssetVersion(row) }; }

export async function setMasterVersion(params: { fetcher: AssetFetcher; userId: string; assetId: string; versionId: string }) {
  await loadAsset(params); const versions = await query<VersionRow[]>(params.fetcher, `/rest/v1/storyflow_v2_asset_versions?id=eq.${encodeURIComponent(params.versionId)}&asset_id=eq.${encodeURIComponent(params.assetId)}&select=id&limit=1`); if (!versions?.length) throw new AssetError("not_found", "Asset version not found.");
  const rows = await query<AssetRow[]>(params.fetcher, `/rest/v1/storyflow_v2_assets?id=eq.${encodeURIComponent(params.assetId)}&owner_id=eq.${encodeURIComponent(params.userId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ current_version_id: params.versionId }) }); const row = rows?.[0]; if (!row) throw new AssetError("service_unavailable", "Unable to switch master version."); return { asset: toAsset(row) };
}

export async function readAssetLineage(params: { fetcher: AssetFetcher; userId: string; assetId: string }) {
  await loadAsset(params); const rows = await loadVersions(params.fetcher, params.assetId); const nodes = new Map(rows.map((row) => [row.id, { id: row.id, versionId: row.id, parentVersionId: row.parent_version_id || null, sourceAssetId: row.source_asset_id || null, sourceProjectId: row.source_project_id, sourceStep: row.source_step, changeDescription: row.change_description, createdAt: row.created_at, children: [] as unknown[], label: `${row.source_step}: ${row.change_description}` }])); const roots: Array<Record<string, unknown>> = [];
  for (const node of nodes.values()) { if (node.parentVersionId && nodes.has(node.parentVersionId)) (nodes.get(node.parentVersionId)!.children as unknown[]).push(node); else roots.push(node); } return { roots, nodes: [...nodes.values()] };
}

export async function readAssetUsage(params: { fetcher: AssetFetcher; userId: string; assetId: string }) { await loadAsset(params); const rows = await query<UsageRow[]>(params.fetcher, `/rest/v1/storyflow_v2_asset_usages?asset_id=eq.${encodeURIComponent(params.assetId)}&select=*&order=created_at.desc&limit=1000`); const items = (rows || []).map((row) => ({ id: row.id, versionId: row.version_id || null, projectId: row.project_id || null, workId: row.work_id || null, usageKind: row.usage_kind, createdAt: row.created_at })); return { items, projects: [...new Set(items.map((item) => item.projectId).filter((id): id is string => Boolean(id)))], works: [...new Set(items.map((item) => item.workId).filter((id): id is string => Boolean(id)))] }; }

async function loadAsset(params: { fetcher: AssetFetcher; userId: string; assetId: string }) { if (!params.userId) throw new AssetError("unauthenticated", "Authentication is required."); if (!params.assetId) throw new AssetError("validation_failed", "Asset id is required."); const rows = await query<AssetRow[]>(params.fetcher, `/rest/v1/storyflow_v2_assets?id=eq.${encodeURIComponent(params.assetId)}&owner_id=eq.${encodeURIComponent(params.userId)}&select=*&limit=1`); const row = rows?.[0]; if (!row) throw new AssetError("not_found", "Asset not found."); return toAsset(row); }
async function loadVersions(fetcher: AssetFetcher, assetId: string) { return query<VersionRow[]>(fetcher, `/rest/v1/storyflow_v2_asset_versions?asset_id=eq.${encodeURIComponent(assetId)}&select=*&order=created_at.asc&limit=1000`); }
function validateCreateAsset(input: CreateAssetInput) { if (!ASSET_KINDS.includes(input.kind) || !input.name?.trim()) throw new AssetError("validation_failed", "kind and name are required."); }
function validateCreateVersion(input: CreateAssetVersionInput) { if (!input.sourceProjectId?.trim() || !input.sourceStep?.trim() || !input.changeDescription?.trim() || !input.storageBucket?.trim() || !input.storagePath?.trim()) throw new AssetError("validation_failed", "sourceProjectId, sourceStep, changeDescription, storageBucket, and storagePath are required."); if (/^https?:\/\//i.test(input.storagePath.trim()) || /^https?:\/\//i.test(input.previewStoragePath?.trim() || "")) throw new AssetError("validation_failed", "Formal asset versions must use durable object storage paths, not provider URLs."); }
function toAsset(row: AssetRow): Asset & { actorId: string | null; rightsState: string | null; projectId: string | null; metadata: Record<string, unknown> } { return { id: row.id, kind: row.kind as AssetKind, name: row.name, status: row.status as AssetStatus, currentVersionId: row.current_version_id || null, createdAt: row.created_at, actorId: row.actor_id || null, rightsState: row.rights_state || null, projectId: row.project_id || null, metadata: row.metadata || {} }; }
function toAssetVersion(row: VersionRow): AssetVersion & Record<string, unknown> { return { id: row.id, assetId: row.asset_id, parentVersionId: row.parent_version_id || null, sourceProjectId: row.source_project_id, previewUrl: row.preview_storage_path ? `${row.preview_storage_bucket || "assets"}/${row.preview_storage_path}` : null, createdAt: row.created_at, sourceAssetId: row.source_asset_id || null, sourceStep: row.source_step, modelKey: row.model_key || null, generationJobId: row.generation_job_id || null, selectedByUserId: row.selected_by_user_id || null, changeDescription: row.change_description, storageBucket: row.storage_bucket, storagePath: row.storage_path, previewStorageBucket: row.preview_storage_bucket || null, previewStoragePath: row.preview_storage_path || null, metadata: row.metadata || {}, createdBy: row.created_by }; }
async function query<T>(fetcher: AssetFetcher, path: string, init?: RequestInit): Promise<T> { try { return await fetcher<T>(path, init); } catch (error) { if (error instanceof AssetError) throw error; throw new AssetError("service_unavailable", error instanceof Error ? error.message : "Asset service unavailable."); } }
