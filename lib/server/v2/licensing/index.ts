import type { LicenseOffer, LicenseOfferTerms, UsageGrant, UsageGrantStatus } from "@/lib/contracts/v2";

export type LicensingFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
export class LicensingError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "service_unavailable";
  constructor(code: LicensingError["code"], message: string) { super(`${code}: ${message}`); this.name = "LicensingError"; this.code = code; }
}

export const LICENSE_TEMPLATES = ["platform_free", "non_commercial", "single_project", "team_internal", "commercial", "custom"] as const;
export type LicenseTemplate = (typeof LICENSE_TEMPLATES)[number];
const GRANT_STATUSES: UsageGrantStatus[] = ["pending", "active", "expired", "revoked_for_new_use", "cancelled", "disputed"];

type AssetRow = { id: string; owner_id: string; kind: string; name: string; status: string; current_version_id?: string | null; actor_id?: string | null; rights_state?: string | null };
type VersionRow = { id: string; asset_id: string; storage_bucket?: string; storage_path?: string };
type OfferRow = { id: string; asset_id: string; asset_version_id: string; owner_id: string; template: string; terms: LicenseOfferTerms; price_cents?: number | null; currency?: string | null; status: string; created_at: string };
type GrantRow = { id: string; offer_id: string; asset_id: string; asset_version_id: string; licensor_id: string; licensee_id: string; target_project_id: string; status: string; expires_at?: string | null; created_at: string };

export interface CreateOfferInput { assetVersionId: string; template: LicenseTemplate; terms: LicenseOfferTerms; priceCents?: number; currency?: string }

export async function createLicenseOffer(params: { fetcher: LicensingFetcher; userId: string; assetId: string; input: CreateOfferInput }) {
  assertUser(params.userId); validateOffer(params.input); const asset = await loadAsset(params); if (asset.owner_id !== params.userId) throw new LicensingError("forbidden", "Only the asset owner can create a license offer.");
  const version = await loadVersion(params.fetcher, params.assetId, params.input.assetVersionId); assertRights(asset, params.input.terms);
  const rows = await query<OfferRow[]>(params.fetcher, "/rest/v1/storyflow_v2_license_offers", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ asset_id: params.assetId, asset_version_id: version.id, owner_id: params.userId, template: params.input.template, terms: params.input.terms, price_cents: params.input.priceCents ?? 0, currency: params.input.currency || "USD", status: "active" }) });
  const row = rows?.[0]; if (!row) throw new LicensingError("service_unavailable", "Unable to create license offer."); return { offer: toOffer(row) };
}

export async function createUsageGrant(params: { fetcher: LicensingFetcher; userId: string; input: { offerId: string; targetProjectId: string; expiresAt?: string } }) {
  assertUser(params.userId); if (!params.input.offerId || !params.input.targetProjectId) throw new LicensingError("validation_failed", "offerId and targetProjectId are required.");
  const offers = await query<OfferRow[]>(params.fetcher, `/rest/v1/storyflow_v2_license_offers?id=eq.${encodeURIComponent(params.input.offerId)}&status=eq.active&select=*&limit=1`); const offer = offers?.[0]; if (!offer) throw new LicensingError("not_found", "Active license offer not found.");
  const asset = await loadAssetById(params.fetcher, params.userId, offer.asset_id); assertRights(asset, offer.terms);
  await assertTargetProjectAccess(params.fetcher, params.userId, params.input.targetProjectId);
  const rows = await query<GrantRow[]>(params.fetcher, "/rest/v1/storyflow_v2_usage_grants", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ offer_id: offer.id, asset_id: offer.asset_id, asset_version_id: offer.asset_version_id, licensor_id: offer.owner_id, licensee_id: params.userId, target_project_id: params.input.targetProjectId, status: "pending", expires_at: params.input.expiresAt || null }) });
  const row = rows?.[0]; if (!row) throw new LicensingError("service_unavailable", "Unable to create usage grant."); return { grant: toGrant(row) };
}

export async function listUsageGrants(params: { fetcher: LicensingFetcher; userId: string; status?: string | null }) {
  assertUser(params.userId); if (params.status && !GRANT_STATUSES.includes(params.status as UsageGrantStatus)) throw new LicensingError("validation_failed", "Unsupported usage grant status.");
  const filters = [`or=(licensee_id.eq.${encodeURIComponent(params.userId)},licensor_id.eq.${encodeURIComponent(params.userId)})`]; if (params.status) filters.push(`status=eq.${encodeURIComponent(params.status)}`);
  const rows = await query<GrantRow[]>(params.fetcher, `/rest/v1/storyflow_v2_usage_grants?${filters.join("&")}&select=*&order=created_at.desc&limit=500`); return { items: (rows || []).map(toGrant) };
}

export async function invokeUsageGrant(params: { fetcher: LicensingFetcher; userId: string; grantId: string }) {
  assertUser(params.userId); if (!params.grantId) throw new LicensingError("validation_failed", "Grant id is required.");
  const result = await query<{ grant: GrantRow; copy: { id: string; copy_asset_id: string; target_project_id: string } }>(params.fetcher, "/rpc/invoke_usage_grant", { method: "POST", body: JSON.stringify({ p_grant_id: params.grantId, p_user_id: params.userId }) });
  if (!result?.grant || !result.copy) throw new LicensingError("service_unavailable", "Unable to invoke usage grant."); return { grant: toGrant(result.grant), copy: { id: result.copy.id, copyAssetId: result.copy.copy_asset_id, targetProjectId: result.copy.target_project_id } };
}

export async function revokeUsageGrant(params: { fetcher: LicensingFetcher; userId: string; grantId: string; reason?: string }) {
  assertUser(params.userId); if (!params.grantId) throw new LicensingError("validation_failed", "Grant id is required.");
  const result = await query<{ grant: GrantRow; preservedCopyCount: number }>(params.fetcher, "/rpc/revoke_usage_grant", { method: "POST", body: JSON.stringify({ p_grant_id: params.grantId, p_user_id: params.userId, p_reason: params.reason || null }) });
  if (!result?.grant) throw new LicensingError("service_unavailable", "Unable to revoke usage grant."); return { grant: toGrant(result.grant), preservedCopyCount: Number(result.preservedCopyCount || 0) };
}

async function loadAsset(params: { fetcher: LicensingFetcher; userId: string; assetId: string }) { return loadAssetById(params.fetcher, params.userId, params.assetId); }
async function loadAssetById(fetcher: LicensingFetcher, _userId: string, assetId: string) { const rows = await query<AssetRow[]>(fetcher, `/rest/v1/storyflow_v2_assets?id=eq.${encodeURIComponent(assetId)}&select=*&limit=1`); const asset = rows?.[0]; if (!asset) throw new LicensingError("not_found", "Asset not found."); return asset; }
async function assertTargetProjectAccess(fetcher: LicensingFetcher, userId: string, projectId: string) {
  const rows = await query<Array<{ id: string; owner_id?: string | null; user_id?: string | null; organization_id?: string | null }>>(fetcher, `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&select=id,owner_id,user_id,organization_id&limit=1`);
  const project = rows?.[0];
  if (!project) throw new LicensingError("not_found", "Target project not found.");
  if (project.owner_id === userId || project.user_id === userId) return;
  if (project.organization_id) {
    const members = await query<Array<{ organization_id: string }>>(fetcher, `/rest/v1/storyflow_organization_members?organization_id=eq.${encodeURIComponent(project.organization_id)}&user_id=eq.${encodeURIComponent(userId)}&select=organization_id&limit=1`);
    if (members?.length) return;
  }
  throw new LicensingError("forbidden", "Target project access denied.");
}
async function loadVersion(fetcher: LicensingFetcher, assetId: string, versionId: string) { const rows = await query<VersionRow[]>(fetcher, `/rest/v1/storyflow_v2_asset_versions?id=eq.${encodeURIComponent(versionId)}&asset_id=eq.${encodeURIComponent(assetId)}&select=id,asset_id,storage_bucket,storage_path&limit=1`); const version = rows?.[0]; if (!version) throw new LicensingError("not_found", "Asset version not found."); if (!version.storage_bucket || !version.storage_path || /^https?:\/\//i.test(version.storage_path)) throw new LicensingError("validation_failed", "Only durable asset versions can be licensed."); return version; }
function assertRights(asset: AssetRow, _terms: LicenseOfferTerms) { if (asset.actor_id && asset.rights_state !== "portrait_confirmed") throw new LicensingError("forbidden", "Confirmed portrait rights are required before marketplace licensing."); if (asset.status !== "ready" && asset.status !== "published") throw new LicensingError("conflict", "Only ready or published assets can be licensed."); }
function validateOffer(input: CreateOfferInput) { if (!input.assetVersionId || !LICENSE_TEMPLATES.includes(input.template) || !input.terms || typeof input.terms.commercial !== "boolean" || !input.terms.scope) throw new LicensingError("validation_failed", "assetVersionId, template, and complete terms are required."); if (input.priceCents !== undefined && (!Number.isInteger(input.priceCents) || input.priceCents < 0)) throw new LicensingError("validation_failed", "priceCents must be a non-negative integer."); }
function assertUser(userId: string) { if (!userId) throw new LicensingError("unauthenticated", "Authentication is required."); }
function toOffer(row: OfferRow): LicenseOffer & { template: string; status: string; createdAt: string } { return { id: row.id, assetId: row.asset_id, assetVersionId: row.asset_version_id, terms: row.terms, priceCents: row.price_cents || 0, currency: row.currency || "USD", template: row.template, status: row.status, createdAt: row.created_at }; }
function toGrant(row: GrantRow): UsageGrant & { assetId: string; licensorId: string; licenseeId: string; targetProjectId: string; createdAt: string } { return { id: row.id, offerId: row.offer_id, assetVersionId: row.asset_version_id, projectId: row.target_project_id, status: row.status as UsageGrantStatus, expiresAt: row.expires_at || null, assetId: row.asset_id, licensorId: row.licensor_id, licenseeId: row.licensee_id, targetProjectId: row.target_project_id, createdAt: row.created_at }; }
async function query<T>(fetcher: LicensingFetcher, path: string, init?: RequestInit): Promise<T> { try { return await fetcher<T>(path, init); } catch (error) { if (error instanceof LicensingError) throw error; throw new LicensingError("service_unavailable", error instanceof Error ? error.message : "Licensing service unavailable."); } }
