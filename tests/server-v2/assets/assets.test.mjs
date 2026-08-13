import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const {
  AssetError,
  createAsset,
  createAssetVersion,
  listAssets,
  readAsset,
  readAssetLineage,
  readAssetUsage,
  setMasterVersion,
} = await import("../../../lib/server/v2/assets/index.ts");

const assetRow = {
  id: "asset-1",
  owner_id: "user-1",
  kind: "character",
  name: "Mara",
  status: "draft",
  current_version_id: null,
  actor_id: null,
  rights_state: "ai_generated",
  project_id: "project-1",
  metadata: { role: "lead" },
  created_at: "2026-08-13T00:00:00Z",
  updated_at: "2026-08-13T00:00:00Z",
};

const versionRow = {
  id: "version-1",
  asset_id: "asset-1",
  parent_version_id: null,
  source_asset_id: null,
  source_project_id: "project-1",
  source_step: "character_design",
  model_key: "image-model-1",
  generation_job_id: "job-1",
  selected_by_user_id: "user-1",
  change_description: "Initial approved identity anchor.",
  storage_bucket: "assets",
  storage_path: "assets/asset-1/version-1.png",
  preview_storage_bucket: "assets",
  preview_storage_path: "assets/asset-1/version-1-preview.png",
  metadata: { seed: 42 },
  created_by: "user-1",
  created_at: "2026-08-13T00:01:00Z",
};

function createFetcher(overrides = {}) {
  const calls = [];
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    for (const [needle, value] of Object.entries(overrides)) {
      if (path.includes(needle)) return typeof value === "function" ? value(path, init) : value;
    }
    if (path.includes("storyflow_v2_assets") && init.method === "POST") return [assetRow];
    if (path.includes("storyflow_v2_assets") && init.method === "PATCH") return [{ ...assetRow, current_version_id: "version-1" }];
    if (path.includes("storyflow_v2_assets") && path.includes("id=eq.asset-1")) return [assetRow];
    if (path.includes("storyflow_v2_assets")) return [assetRow];
    if (path.includes("storyflow_v2_asset_versions")) return [versionRow];
    if (path.includes("storyflow_v2_asset_usages")) return [{ id: "usage-1", asset_id: "asset-1", version_id: "version-1", project_id: "project-2", work_id: "work-1", usage_kind: "storyboard", created_at: "2026-08-13T00:02:00Z" }];
    throw new Error(`unexpected query: ${path}`);
  };
  fetcher.calls = calls;
  return fetcher;
}

test("createAsset creates an asset identity in draft state", async () => {
  const fetcher = createFetcher();
  const result = await createAsset({ fetcher, userId: "user-1", input: { kind: "character", name: "Mara", projectId: "project-1" } });
  assert.equal(result.asset.id, "asset-1");
  assert.equal(result.asset.status, "draft");
  const insert = fetcher.calls.find(({ init }) => init.method === "POST");
  assert.ok(insert);
  assert.match(insert.init.body, /"owner_id":"user-1"/);
  assert.match(insert.init.body, /"status":"draft"/);
});

test("listAssets applies kind, status, and project filters", async () => {
  const fetcher = createFetcher({ storyflow_v2_assets: [assetRow] });
  const result = await listAssets({ fetcher, userId: "user-1", kind: "character", status: "ready", projectId: "project-1" });
  assert.equal(result.items.length, 1);
  const path = fetcher.calls[0].path;
  assert.match(path, /kind=eq.character/);
  assert.match(path, /status=eq.ready/);
  assert.match(path, /project_id=eq.project-1/);
});

test("createAssetVersion rejects provider URLs before persistence", async () => {
  const fetcher = createFetcher();
  await assert.rejects(
    createAssetVersion({ fetcher, userId: "user-1", assetId: "asset-1", input: { sourceProjectId: "project-1", sourceStep: "generate", changeDescription: "bad", storageBucket: "assets", storagePath: "https://provider.example/temp.png" } }),
    (error) => error instanceof AssetError && error.code === "validation_failed",
  );
  assert.equal(fetcher.calls.some(({ init }) => init.method === "POST"), false);
});

test("createAssetVersion persists complete provenance and durable storage only", async () => {
  const fetcher = createFetcher({ storyflow_v2_asset_versions: [versionRow], "storyflow_v2_asset_versions?id=eq.version-0": [{ id: "version-0" }], "storyflow_v2_assets?id=eq.source-asset-1": [{ id: "source-asset-1" }] });
  const result = await createAssetVersion({
    fetcher,
    userId: "user-1",
    assetId: "asset-1",
    input: {
      parentVersionId: "version-0",
      sourceAssetId: "source-asset-1",
      sourceProjectId: "project-1",
      sourceStep: "character_design",
      modelKey: "image-model-1",
      generationJobId: "job-1",
      selectedByUserId: "user-1",
      changeDescription: "Initial approved identity anchor.",
      storageBucket: "assets",
      storagePath: "assets/asset-1/version-1.png",
      previewStorageBucket: "assets",
      previewStoragePath: "assets/asset-1/version-1-preview.png",
    },
  });
  assert.equal(result.version.id, "version-1");
  const insert = fetcher.calls.find(({ init }) => init.method === "POST" && init.body.includes("source_project_id"));
  assert.ok(insert);
  const body = JSON.parse(insert.init.body);
  assert.equal(body.source_asset_id, "source-asset-1");
  assert.equal(body.source_step, "character_design");
  assert.equal(body.model_key, "image-model-1");
  assert.equal(body.generation_job_id, "job-1");
  assert.equal(body.selected_by_user_id, "user-1");
  assert.equal(body.storage_path, "assets/asset-1/version-1.png");
  assert.equal(Object.hasOwn(body, "provider_url"), false);
});

test("createAssetVersion rejects a parent version from another asset", async () => {
  const fetcher = createFetcher({ "storyflow_v2_asset_versions?id=eq.version-0": [] });
  await assert.rejects(
    createAssetVersion({ fetcher, userId: "user-1", assetId: "asset-1", input: { parentVersionId: "version-0", sourceProjectId: "project-1", sourceStep: "edit", changeDescription: "Cross asset", storageBucket: "assets", storagePath: "assets/asset-1/version-2.png" } }),
    (error) => error instanceof AssetError && error.code === "validation_failed",
  );
});

test("createAssetVersion rejects a source asset the caller does not own", async () => {
  const fetcher = createFetcher({ "storyflow_v2_assets?id=eq.source-asset-1": [] });
  await assert.rejects(
    createAssetVersion({ fetcher, userId: "user-1", assetId: "asset-1", input: { sourceAssetId: "source-asset-1", sourceProjectId: "project-1", sourceStep: "edit", changeDescription: "Cross owner", storageBucket: "assets", storagePath: "assets/asset-1/version-2.png" } }),
    (error) => error instanceof AssetError && error.code === "validation_failed",
  );
});

test("setMasterVersion switches the pointer without deleting historical versions", async () => {
  const fetcher = createFetcher({
    "storyflow_v2_asset_versions?id=eq.version-1": [versionRow],
    "storyflow_v2_assets?id=eq.asset-1": [{ ...assetRow, current_version_id: "version-1" }],
  });
  const result = await setMasterVersion({ fetcher, userId: "user-1", assetId: "asset-1", versionId: "version-1" });
  assert.equal(result.asset.currentVersionId, "version-1");
  assert.equal(fetcher.calls.some(({ init }) => init.method === "DELETE"), false);
  assert.ok(fetcher.calls.some(({ init }) => init.method === "PATCH"));
});

test("readAsset returns all versions and lineage exposes readable evolution nodes", async () => {
  const child = { ...versionRow, id: "version-2", parent_version_id: "version-1", change_description: "Adjusted wardrobe." };
  const fetcher = createFetcher({
    "storyflow_v2_assets?id=eq.asset-1": [assetRow],
    storyflow_v2_asset_versions: [versionRow, child],
  });
  const detail = await readAsset({ fetcher, userId: "user-1", assetId: "asset-1" });
  assert.equal(detail.asset.versions.length, 2);
  const lineage = await readAssetLineage({ fetcher, userId: "user-1", assetId: "asset-1" });
  assert.equal(lineage.roots.length, 1);
  assert.equal(lineage.roots[0].children[0].changeDescription, "Adjusted wardrobe.");
  assert.match(lineage.roots[0].label, /Initial approved identity anchor/);
});

test("readAssetUsage returns projects and works using the asset", async () => {
  const fetcher = createFetcher({ storyflow_v2_asset_usages: [{ id: "usage-1", asset_id: "asset-1", version_id: "version-1", project_id: "project-2", work_id: "work-1", usage_kind: "storyboard", created_at: "2026-08-13T00:02:00Z" }] });
  const result = await readAssetUsage({ fetcher, userId: "user-1", assetId: "asset-1" });
  assert.deepEqual(result.projects, ["project-2"]);
  assert.deepEqual(result.works, ["work-1"]);
  assert.equal(result.items[0].usageKind, "storyboard");
});

test("C-07 migration defines lifecycle, durable version storage, and lineage tables", async () => {
  const migrationPath = new URL("../../../supabase/migrations/20260813000000_K2-C-07_asset_lineage.sql", import.meta.url);
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE (?:IF NOT EXISTS )?public\.storyflow_v2_assets/i);
  assert.match(sql, /CHECK \(status IN \('draft', 'ready', 'published', 'suspended', 'archived'\)\)/i);
  assert.match(sql, /CREATE TABLE (?:IF NOT EXISTS )?public\.storyflow_v2_asset_versions/i);
  assert.match(sql, /storage_bucket/);
  assert.match(sql, /storage_path/);
  assert.doesNotMatch(sql, /provider_url/i);
  assert.match(sql, /source_project_id/);
  assert.match(sql, /source_step/);
  assert.match(sql, /storyflow_v2_asset_usages/i);
  assert.match(sql, /enforce_storyflow_v2_asset_status_transition/i);
  assert.match(sql, /storyflow_v2_asset_status_transition/i);
});
