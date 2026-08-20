import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureStageWork,
  getUnifiedWorkbenchContext,
} from "../../../lib/server/v2/unified-workbench/index.ts";

function makeFetcher({ project, works = [], workVersions = [], workVersionResolver, universe = null, universeVersions = [], ensureResult, ensureError } = {}) {
  return async (path, init) => {
    if (path.startsWith("/rest/v1/storyflow_projects?")) {
      return project ? [project] : [];
    }
    if (path.startsWith("/rest/v1/storyflow_works?")) {
      return works;
    }
    if (path.startsWith("/rest/v1/storyflow_work_versions?")) {
      if (workVersionResolver) return workVersionResolver(path);
      return workVersions;
    }
    if (path.startsWith("/rest/v1/storyflow_universes?")) {
      return universe ? [universe] : [];
    }
    if (path.startsWith("/rest/v1/storyflow_universe_versions?")) {
      return universeVersions;
    }
    if (path === "/rest/v1/rpc/ensure_project_stage_work" && init?.method === "POST") {
      if (ensureError) throw ensureError;
      return ensureResult;
    }
    throw new Error(`unexpected fetch: ${path}`);
  };
}

const ownedProject = {
  id: "p1",
  title: "Project One",
  owner_id: "u1",
  user_id: "u1",
  universe_id: null,
  data: {},
};

test("context rejects a project owned by another user", async () => {
  const fetcher = makeFetcher({
    project: { ...ownedProject, owner_id: "u1", user_id: "u1" },
  });
  await assert.rejects(
    () => getUnifiedWorkbenchContext({ projectId: "p1", ownerId: "u2", fetcher }),
    (error) => error.code === "forbidden",
  );
});

test("context returns one slot for each production stage", async () => {
  const fetcher = makeFetcher({ project: ownedProject });
  const result = await getUnifiedWorkbenchContext({ projectId: "p1", ownerId: "u1", fetcher });
  assert.deepEqual(Object.keys(result.stages), ["script", "art", "storyboard", "video"]);
  assert.deepEqual(result.stages, {
    script: null,
    art: null,
    storyboard: null,
    video: null,
  });
});

test("context returns the highest-priority active work for each stage without creating missing works", async () => {
  const fetcher = makeFetcher({
    project: ownedProject,
    works: [
      {
        id: "script-primary",
        owner_id: "u1",
        work_type: "script",
        status: "editing_draft",
        is_primary: true,
        current_version_id: "version-1",
        updated_at: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "ignored-song",
        owner_id: "u1",
        work_type: "song",
        status: "editing_draft",
        is_primary: false,
        current_version_id: null,
        updated_at: "2026-08-20T00:00:00.000Z",
      },
    ],
  });

  const result = await getUnifiedWorkbenchContext({ projectId: "p1", ownerId: "u1", fetcher });
  assert.deepEqual(result.stages.script, {
    workId: "script-primary",
    status: "editing_draft",
    currentVersionId: "version-1",
    updatedAt: "2026-08-20T00:00:00.000Z",
  });
  assert.equal(result.stages.art, null);
});

test("context falls back to the latest immutable Work Version when a legacy work has no current version pointer", async () => {
  const fetcher = makeFetcher({
    project: ownedProject,
    works: [{
      id: "art-legacy",
      owner_id: "u1",
      work_type: "art",
      status: "editing_draft",
      is_primary: false,
      current_version_id: null,
      updated_at: "2026-08-20T00:00:00.000Z",
    }],
    workVersions: [
      { id: "art-version-2", work_id: "art-legacy" },
      { id: "art-version-1", work_id: "art-legacy" },
    ],
  });

  const result = await getUnifiedWorkbenchContext({ projectId: "p1", ownerId: "u1", fetcher });
  assert.equal(result.stages.art?.currentVersionId, "art-version-2");
});

test("context resolves the latest version for a selected legacy stage beyond 400 combined version rows", async () => {
  const competingVersions = Array.from({ length: 401 }, (_, index) => ({
    id: `script-version-${index + 1}`,
    work_id: "script-unselected",
  }));
  const workVersions = [
    ...competingVersions,
    { id: "art-version-latest", work_id: "art-legacy" },
  ];
  const versionRequests = [];
  const fetcher = makeFetcher({
    project: ownedProject,
    works: [
      {
        id: "art-legacy",
        owner_id: "u1",
        work_type: "art",
        status: "editing_draft",
        is_primary: true,
        current_version_id: null,
        updated_at: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "script-unselected",
        owner_id: "u1",
        work_type: "script",
        status: "editing_draft",
        is_primary: false,
        current_version_id: "script-current",
        updated_at: "2026-08-19T00:00:00.000Z",
      },
    ],
    workVersions,
    workVersionResolver(path) {
      versionRequests.push(path);
      if (path.includes("work_id=eq.art-legacy")) {
        return [{ id: "art-version-latest", work_id: "art-legacy" }];
      }
      return workVersions.slice(0, 400);
    },
  });

  const result = await getUnifiedWorkbenchContext({ projectId: "p1", ownerId: "u1", fetcher });

  assert.equal(result.stages.art?.currentVersionId, "art-version-latest");
  assert.equal(versionRequests.length, 1);
  assert.match(versionRequests[0], /work_id=eq\.art-legacy/);
  assert.match(versionRequests[0], /order=created_at\.desc&limit=1/);
});

test("context rejects a missing project", async () => {
  await assert.rejects(
    () => getUnifiedWorkbenchContext({ projectId: "missing", ownerId: "u1", fetcher: makeFetcher() }),
    (error) => error.code === "not_found",
  );
});

test("ensure returns the existing active stage work", async () => {
  const fetcher = makeFetcher({
    ensureResult: [{ work_id: "art-existing", created: false }],
  });
  assert.deepEqual(
    await ensureStageWork({ projectId: "p1", ownerId: "u1", stage: "art", idempotencyKey: "k1", fetcher }),
    { workId: "art-existing", created: false },
  );
});

test("ensure rejects an unsupported stage", async () => {
  await assert.rejects(
    () => ensureStageWork({ projectId: "p1", ownerId: "u1", stage: "song", idempotencyKey: "k1", fetcher: makeFetcher() }),
    (error) => error.code === "validation_failed",
  );
});

test("ensure rejects an incomplete RPC response", async () => {
  await assert.rejects(
    () => ensureStageWork({ projectId: "p1", ownerId: "u1", stage: "art", idempotencyKey: "k1", fetcher: makeFetcher({ ensureResult: [{}] }) }),
    (error) => error.code === "service_unavailable",
  );
});

test("ensure maps an RPC ownership rejection to forbidden", async () => {
  await assert.rejects(
    () => ensureStageWork({
      projectId: "p1",
      ownerId: "u1",
      stage: "art",
      idempotencyKey: "k1",
      fetcher: makeFetcher({ ensureError: new Error("PROJECT_NOT_OWNED") }),
    }),
    (error) => error.code === "forbidden",
  );
});
