import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  deleteTestAccountProjects,
  isTestCleanupEmail,
  normalizeTestCleanupSelections,
} from "../../../lib/server/v2/project-library/test-cleanup.ts";

test("only the configured test email can use bulk cleanup", () => {
  assert.equal(isTestCleanupEmail("BAYSHAW33@gmail.com"), true);
  assert.equal(isTestCleanupEmail("other@example.com"), false);
});

test("cleanup selections are unique, typed, and bounded", () => {
  assert.deepEqual(normalizeTestCleanupSelections([
    { source: "project", sourceId: "p-1" },
    { source: "project", sourceId: "p-1" },
    { source: "art", sourceId: "a-1" },
  ]), [
    { source: "project", sourceId: "p-1" },
    { source: "art", sourceId: "a-1" },
  ]);
  assert.throws(() => normalizeTestCleanupSelections([]), /INVALID_TEST_CLEANUP_SELECTIONS/);
  assert.throws(
    () => normalizeTestCleanupSelections([{ source: "unknown", sourceId: "x" }]),
    /INVALID_TEST_CLEANUP_SELECTIONS/,
  );
  assert.throws(
    () => normalizeTestCleanupSelections(Array.from({ length: 201 }, (_, index) => ({ source: "project", sourceId: `p-${index}` }))),
    /INVALID_TEST_CLEANUP_SELECTIONS/,
  );
});

test("batch cleanup deletes owned rows and an exclusive empty Universe", async () => {
  const calls = [];
  const deletedStorageObjects = [];
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    const method = init.method || "GET";
    if (method === "GET" && path.startsWith("/rest/v1/storyflow_projects?id=eq.p-1")) {
      return [{ id: "p-1", owner_id: "owner-1", universe_id: "u-empty" }];
    }
    if (method === "GET" && path.startsWith("/rest/v1/storyflow_art_projects?id=eq.a-1")) {
      return [{ id: "a-1", owner_id: "owner-1" }];
    }
    if (method === "GET" && path.startsWith("/rest/v1/storyflow_viral_projects?id=eq.v-1")) {
      return [{ id: "v-1", user_id: "owner-1", source_video_path: "owner-1/source.mp4" }];
    }
    if (method === "GET" && path.startsWith("/rest/v1/storyflow_viral_projects?id=eq.foreign")) return [];
    if (method === "GET" && path.includes("storyflow_universe_project_links?project_id=eq.p-1")) {
      return [{ universe_id: "u-empty" }];
    }
    if (method === "GET" && path.includes("storyflow_assets?project_id=eq.p-1")) {
      return [{ asset_type: "audio", storage_path: "owner-1/p-1/test.mp3" }];
    }
    if (method === "GET" && path.includes("storyflow_art_assets?project_id=eq.a-1")) {
      return [{ id: "art-asset-1" }];
    }
    if (method === "GET" && path.includes("storyflow_art_asset_variants?asset_id=in.(art-asset-1)")) {
      return [{ id: "variant-1" }];
    }
    if (method === "GET" && path.includes("storyflow_art_asset_versions?variant_id=in.(variant-1)")) {
      return [{ storage_path: "owner-1/a-1/render.png" }];
    }
    if (method === "GET" && path.startsWith("/rest/v1/storyflow_universes?id=eq.u-empty")) {
      return [{ id: "u-empty", user_id: "owner-1", share_status: "private", status: "active" }];
    }
    if (method === "GET" && path.includes("universe_id=eq.u-empty")) return [];
    if (method === "DELETE" && path.startsWith("/rest/v1/storyflow_projects?id=eq.p-1")) return [{ id: "p-1" }];
    if (method === "DELETE" && path.startsWith("/rest/v1/storyflow_art_projects?id=eq.a-1")) return [{ id: "a-1" }];
    if (method === "DELETE" && path.startsWith("/rest/v1/storyflow_viral_projects?id=eq.v-1")) return [{ id: "v-1" }];
    if (method === "DELETE" && path.startsWith("/rest/v1/storyflow_universes?id=eq.u-empty")) return [{ id: "u-empty" }];
    if (method === "DELETE") return [];
    throw new Error(`unexpected request: ${method} ${path}`);
  };

  const result = await deleteTestAccountProjects(fetcher, "owner-1", [
    { source: "project", sourceId: "p-1" },
    { source: "art", sourceId: "a-1" },
    { source: "viral", sourceId: "v-1" },
    { source: "viral", sourceId: "foreign" },
  ], async (objects) => { deletedStorageObjects.push(...objects); });

  assert.deepEqual(result.deleted, [
    { source: "project", sourceId: "p-1" },
    { source: "art", sourceId: "a-1" },
    { source: "viral", sourceId: "v-1" },
  ]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].sourceId, "foreign");
  assert.deepEqual(result.deletedUniverseIds, ["u-empty"]);
  assert.deepEqual(result.storageWarnings, []);
  assert.deepEqual(deletedStorageObjects, [
    { bucket: "audio-assets", path: "owner-1/p-1/test.mp3" },
    { bucket: "art-assets", path: "owner-1/a-1/render.png" },
    { bucket: "viral-assets", path: "owner-1/source.mp4" },
  ]);
  assert.ok(calls.some(({ path }) => path.includes("storyflow_generation_jobs")));
  assert.ok(calls.some(({ path }) => path.includes("storyflow_generation_tasks") && path.includes("project_ref.eq.p-1")));
  assert.ok(calls.some(({ path }) => path.includes("storyflow_assets")));
  assert.ok(calls.every(({ path }) => !path.includes("owner-2")));
});

test("storage deletion failure preserves the project row for a safe retry", async () => {
  const calls = [];
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    const method = init.method || "GET";
    if (method === "GET" && path.startsWith("/rest/v1/storyflow_projects?id=eq.p-1")) {
      return [{ id: "p-1", owner_id: "owner-1" }];
    }
    if (method === "GET" && path.includes("storyflow_universe_project_links?project_id=eq.p-1")) return [];
    if (method === "GET" && path.includes("storyflow_assets?project_id=eq.p-1")) {
      return [{ asset_type: "audio", storage_path: "owner-1/p-1/test.mp3" }];
    }
    if (method === "DELETE") return [];
    throw new Error(`unexpected request: ${method} ${path}`);
  };

  const result = await deleteTestAccountProjects(
    fetcher,
    "owner-1",
    [{ source: "project", sourceId: "p-1" }],
    async () => { throw new Error("STORAGE_DELETE_FAILED"); },
  );

  assert.equal(result.deleted.length, 0);
  assert.equal(result.failed[0].error, "STORAGE_DELETE_FAILED");
  assert.equal(calls.some(({ path, init }) => (init.method || "GET") === "DELETE" && path.startsWith("/rest/v1/storyflow_projects")), false);
});

for (const scenario of ["surviving-link", "entity", "shared", "foreign-owner"]) {
  test(`Universe cleanup preserves ${scenario}`, async () => {
    const calls = [];
    const fetcher = async (path, init = {}) => {
      calls.push({ path, init });
      const method = init.method || "GET";
      if (method === "GET" && path.startsWith("/rest/v1/storyflow_projects?id=eq.p-1")) {
        return [{ id: "p-1", owner_id: "owner-1", universe_id: "u-keep" }];
      }
      if (method === "GET" && path.includes("storyflow_universe_project_links?project_id=eq.p-1")) {
        return [{ universe_id: "u-keep" }];
      }
      if (method === "GET" && path.includes("storyflow_assets?project_id=eq.p-1")) return [];
      if (method === "DELETE" && path.startsWith("/rest/v1/storyflow_projects?id=eq.p-1")) return [{ id: "p-1" }];
      if (method === "GET" && path.startsWith("/rest/v1/storyflow_universes?id=eq.u-keep")) {
        if (scenario === "foreign-owner") return [];
        return [{ id: "u-keep", user_id: "owner-1", share_status: scenario === "shared" ? "shared" : "private" }];
      }
      if (method === "GET" && path.includes("storyflow_universe_project_links?universe_id=eq.u-keep")) {
        return scenario === "surviving-link" ? [{ id: "other-link" }] : [];
      }
      if (method === "GET" && path.includes("storyflow_universe_entities?universe_id=eq.u-keep")) {
        return scenario === "entity" ? [{ id: "entity-1" }] : [];
      }
      if (method === "GET" && path.includes("universe_id=eq.u-keep")) return [];
      if (method === "DELETE") return [];
      throw new Error(`unexpected request: ${method} ${path}`);
    };

    const result = await deleteTestAccountProjects(fetcher, "owner-1", [
      { source: "project", sourceId: "p-1" },
    ]);

    assert.deepEqual(result.deleted, [{ source: "project", sourceId: "p-1" }]);
    assert.deepEqual(result.deletedUniverseIds, []);
    assert.equal(calls.some(({ path, init }) => (init.method || "GET") === "DELETE" && path.includes("storyflow_universes")), false);
  });
}

test("test cleanup route is hidden behind authenticated email authorization", () => {
  const routePath = "app/api/v2/project-library/test-cleanup/route.ts";
  assert.equal(existsSync(routePath), true, "test cleanup route must exist");
  const route = readFileSync(routePath, "utf8");
  assert.match(route, /authenticateRequest/);
  assert.match(route, /isTestCleanupEmail\(user\.email\)/);
  assert.match(route, /status:\s*404/);
  assert.match(route, /deleteTestAccountProjects/);
  assert.doesNotMatch(route, /getProjectDeletePreflight/);
});
