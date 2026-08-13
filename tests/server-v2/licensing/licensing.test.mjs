import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const {
  LicensingError,
  createLicenseOffer,
  createUsageGrant,
  listUsageGrants,
  invokeUsageGrant,
  revokeUsageGrant,
} = await import("../../../lib/server/v2/licensing/index.ts");

const asset = { id: "asset-1", owner_id: "owner-1", kind: "character", name: "Mara", status: "ready", current_version_id: "version-1", actor_id: "actor-1", rights_state: "portrait_confirmed" };
const version = { id: "version-1", asset_id: "asset-1", storage_bucket: "assets", storage_path: "assets/asset-1/version-1.png" };
const offer = { id: "offer-1", asset_id: "asset-1", asset_version_id: "version-1", owner_id: "owner-1", template: "commercial", terms: { commercial: true, scope: "single_project", modificationAllowed: false }, status: "active", created_at: "2026-08-13T00:00:00Z" };
const grant = { id: "grant-1", offer_id: "offer-1", asset_id: "asset-1", asset_version_id: "version-1", licensor_id: "owner-1", licensee_id: "consumer-1", target_project_id: "project-2", status: "pending", expires_at: null, created_at: "2026-08-13T00:01:00Z" };

function createFetcher(overrides = {}) {
  const calls = [];
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    for (const [needle, value] of Object.entries(overrides)) if (path.includes(needle)) return typeof value === "function" ? value(path, init) : value;
    if (path.includes("storyflow_v2_assets")) return [asset];
    if (path.includes("storyflow_v2_asset_versions")) return [version];
    if (path.includes("storyflow_v2_license_offers")) return [offer];
    if (path.includes("storyflow_v2_usage_grants") && init.method === "POST") return [grant];
    if (path.includes("storyflow_v2_usage_grants")) return [grant];
    if (path.includes("storyflow_v2_asset_copies")) return [{ id: "copy-1", source_asset_id: "asset-1", source_version_id: "version-1", target_project_id: "project-2", copy_asset_id: "copy-asset-1", created_at: "2026-08-13T00:02:00Z" }];
    if (path.includes("storyflow_projects")) return [{ id: "project-2", owner_id: "consumer-1", user_id: "consumer-1", organization_id: null }];
    throw new Error(`unexpected query: ${path}`);
  };
  fetcher.calls = calls;
  return fetcher;
}

test("createLicenseOffer supports six standard templates and returns an offer", async () => {
  const fetcher = createFetcher();
  const result = await createLicenseOffer({ fetcher, userId: "owner-1", assetId: "asset-1", input: { assetVersionId: "version-1", template: "commercial", terms: { commercial: true, scope: "single_project" }, priceCents: 1999, currency: "USD" } });
  assert.equal(result.offer.id, "offer-1");
  const insert = fetcher.calls.find(({ init }) => init.method === "POST");
  assert.match(insert.init.body, /"template":"commercial"/);
});

test("license offers reject public or commercial use for an unconfirmed real-person portrait", async () => {
  const fetcher = createFetcher({ storyflow_v2_assets: [{ ...asset, rights_state: "portrait_pending" }] });
  await assert.rejects(createLicenseOffer({ fetcher, userId: "owner-1", assetId: "asset-1", input: { assetVersionId: "version-1", template: "commercial", terms: { commercial: true, scope: "single_project" } } }), (error) => error instanceof LicensingError && error.code === "forbidden");
  assert.equal(fetcher.calls.some(({ init }) => init.method === "POST" && init.body.includes("storyflow_v2_license_offers")), false);
});

test("all marketplace offers reject an unconfirmed real-person portrait, including non-commercial terms", async () => {
  const fetcher = createFetcher({ storyflow_v2_assets: [{ ...asset, rights_state: "portrait_pending" }] });
  await assert.rejects(createLicenseOffer({ fetcher, userId: "owner-1", assetId: "asset-1", input: { assetVersionId: "version-1", template: "non_commercial", terms: { commercial: false, scope: "non_commercial" } } }), (error) => error instanceof LicensingError && error.code === "forbidden");
});

test("createUsageGrant starts a pending grant from an active offer", async () => {
  const fetcher = createFetcher();
  const result = await createUsageGrant({ fetcher, userId: "consumer-1", input: { offerId: "offer-1", targetProjectId: "project-2" } });
  assert.equal(result.grant.status, "pending");
  assert.match(fetcher.calls.find(({ init }) => init.method === "POST").init.body, /"licensee_id":"consumer-1"/);
  assert.ok(fetcher.calls.some(({ path }) => path.includes("storyflow_v2_assets?id=eq.asset-1")));
});

test("createUsageGrant rejects a target project the consumer cannot access", async () => {
  const fetcher = createFetcher({ storyflow_projects: [] });
  await assert.rejects(createUsageGrant({ fetcher, userId: "consumer-1", input: { offerId: "offer-1", targetProjectId: "private-project" } }), (error) => error instanceof LicensingError && error.code === "not_found");
  assert.equal(fetcher.calls.some(({ init }) => init.method === "POST" && init.body.includes("storyflow_v2_usage_grants")), false);
});

test("listUsageGrants filters by status and caller", async () => {
  const fetcher = createFetcher();
  const result = await listUsageGrants({ fetcher, userId: "consumer-1", status: "pending" });
  assert.equal(result.items.length, 1);
  assert.match(fetcher.calls[0].path, /licensee_id\.eq\.consumer-1/);
  assert.match(fetcher.calls[0].path, /status=eq.pending/);
});

test("invokeUsageGrant creates a project-level copy and activates the grant without mutating the source asset", async () => {
  const fetcher = createFetcher({ "/rpc/invoke_usage_grant": { grant: { ...grant, status: "active" }, copy: { id: "copy-1", copy_asset_id: "copy-asset-1", target_project_id: "project-2" } } });
  const result = await invokeUsageGrant({ fetcher, userId: "consumer-1", grantId: "grant-1" });
  assert.equal(result.grant.status, "active");
  assert.equal(result.copy.copyAssetId, "copy-asset-1");
  assert.ok(fetcher.calls.some(({ path }) => path.includes("/rpc/invoke_usage_grant")));
  assert.equal(fetcher.calls.some(({ path, init }) => path.includes("storyflow_v2_assets") && init.method === "PATCH"), false);
});

test("revokeUsageGrant blocks new use but preserves the existing project copy", async () => {
  const fetcher = createFetcher({ "/rpc/revoke_usage_grant": { grant: { ...grant, status: "revoked_for_new_use" }, preservedCopyCount: 1 } });
  const result = await revokeUsageGrant({ fetcher, userId: "owner-1", grantId: "grant-1", reason: "Rights withdrawn" });
  assert.equal(result.grant.status, "revoked_for_new_use");
  assert.equal(result.preservedCopyCount, 1);
  assert.match(fetcher.calls.find(({ path }) => path.includes("/rpc/revoke_usage_grant")).init.body, /Rights withdrawn/);
  assert.equal(fetcher.calls.some(({ init }) => init.method === "DELETE"), false);
});

test("C-08 migration defines six templates, grant state machine, rights guard, and non-destructive revoke", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/20260813010000_K2-C-08_licensing.sql", import.meta.url), "utf8");
  for (const template of ["platform_free", "non_commercial", "single_project", "team_internal", "commercial", "custom"]) assert.match(sql, new RegExp(template));
  for (const status of ["pending", "active", "expired", "revoked_for_new_use", "cancelled", "disputed"]) assert.match(sql, new RegExp(status));
  assert.match(sql, /portrait_confirmed/);
  assert.match(sql, /invoke_usage_grant/);
  assert.match(sql, /revoke_usage_grant/);
  assert.match(sql, /prevent_unconfirmed_portrait_publication/);
  assert.match(sql, /target project access denied/);
  assert.match(sql, /storyflow_organization_members/);
  assert.match(sql, /storyflow_v2_asset_usages/);
  assert.doesNotMatch(sql, /DELETE FROM public\.storyflow_v2_asset_copies/i);
});
