import assert from "node:assert/strict";
import test from "node:test";

import { resolvePublicationReuseCapabilities } from "../../../lib/server/v2/community/reuse.ts";

const base = {
  id: "pub-1",
  source_type: "project",
  source_id: "project-1",
  source_version: null,
  publisher_id: "owner-1",
  work_id: "work-1",
  project_id: "project-1",
};

function createFetcher(overrides = {}) {
  const calls = [];
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    for (const [needle, value] of Object.entries(overrides)) {
      if (path.includes(needle)) return typeof value === "function" ? value(path, init) : value;
    }
    return [];
  };
  fetcher.calls = calls;
  return fetcher;
}

test("anonymous viewers receive no reusable capability", async () => {
  const fetcher = createFetcher();
  const result = await resolvePublicationReuseCapabilities(fetcher, [base], null);
  assert.equal(result.get(base.id).mode, "none");
  assert.equal(fetcher.calls.length, 0);
});

test("source owner receives owned Work reuse backed by a real immutable version", async () => {
  const fetcher = createFetcher({
    "storyflow_work_versions": [{ id: "work-version-3", work_id: "work-1" }],
  });
  const result = await resolvePublicationReuseCapabilities(fetcher, [base], "owner-1");
  assert.deepEqual(result.get(base.id), {
    mode: "owned",
    sourceWorkId: "work-1",
    sourceWorkVersionId: "work-version-3",
    grantId: null,
    offerId: null,
    reason: "Source Work is owned by the viewer.",
  });
});

test("non-owner Work reuse requires a real active grant", async () => {
  const fetcher = createFetcher({
    "storyflow_resource_grants": [{ id: "grant-1", resource_id: "work-1", scope: "adaptation", status: "active" }],
    "storyflow_work_versions": [{ id: "work-version-2", work_id: "work-1" }],
  });
  const result = await resolvePublicationReuseCapabilities(fetcher, [base], "viewer-1");
  assert.equal(result.get(base.id).mode, "granted");
  assert.equal(result.get(base.id).grantId, "grant-1");
  assert.equal(result.get(base.id).sourceWorkVersionId, "work-version-2");
});

test("non-owner Work without a grant stays disabled even when rights copy claims reuse", async () => {
  const fetcher = createFetcher({
    "storyflow_resource_grants": [],
    "storyflow_work_versions": [{ id: "work-version-2", work_id: "work-1" }],
  });
  const result = await resolvePublicationReuseCapabilities(fetcher, [{ ...base, rights_summary: "可自由改编" }], "viewer-1");
  assert.equal(result.get(base.id).mode, "none");
});

test("asset licensing is enabled only by a real active offer", async () => {
  const asset = { ...base, id: "pub-asset", source_type: "asset", source_id: "asset-1", work_id: null, project_id: null };
  const fetcher = createFetcher({
    "storyflow_v2_license_offers": [{ id: "offer-1", asset_id: "asset-1", status: "active" }],
  });
  const result = await resolvePublicationReuseCapabilities(fetcher, [asset], "viewer-1");
  assert.equal(result.get(asset.id).mode, "offer");
  assert.equal(result.get(asset.id).offerId, "offer-1");
});

test("asset without an active offer never exposes a fake license action", async () => {
  const asset = { ...base, id: "pub-asset", source_type: "asset", source_id: "asset-1", work_id: null, project_id: null };
  const fetcher = createFetcher({ "storyflow_v2_license_offers": [] });
  const result = await resolvePublicationReuseCapabilities(fetcher, [asset], "viewer-1");
  assert.equal(result.get(asset.id).mode, "none");
});

test("asset publisher is not misclassified as reusable Work ownership", async () => {
  const asset = {
    ...base,
    id: "pub-owned-asset",
    source_type: "asset",
    source_id: "asset-owned-1",
    work_id: null,
    project_id: null,
  };
  const fetcher = createFetcher({
    "storyflow_v2_license_offers": [{ id: "offer-owned", asset_id: "asset-owned-1", status: "active" }],
  });
  const result = await resolvePublicationReuseCapabilities(fetcher, [asset], "owner-1");
  assert.equal(result.get(asset.id).mode, "none");
  assert.equal(result.get(asset.id).sourceWorkId, null);
});
