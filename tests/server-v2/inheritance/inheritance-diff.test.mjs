/**
 * Phase 2 Task 2.4 — Universe update Diff & per-item adoption tests.
 *
 * Verifies (PRD Task 2.4 Step 1-3):
 *   - Stale detection: Universe publishes U2, Work bound to U1 → isStale=true, Work content unchanged
 *   - Object added in U2 → diff impact=added
 *   - Object changed in U2 → diff impact=changed, fieldPath set
 *   - Object removed in U2 → diff impact=deprecated
 *   - Object with conflicting local state → diff impact=conflict
 *   - Same Universe Version → isStale=false, empty diffs
 *   - Determinism: same inputs → same diff order
 *   - adopt: selected diffs create new manifest + checkpoint, unselected keep old
 *   - adopt: idempotent (same diffIds → same new manifest)
 *   - adopt: empty diffIds → validation_failed
 *
 * Run: node --test tests/server-v2/inheritance/inheritance-diff.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  computeInheritanceDiff,
  categorizeObjectChange,
  adoptInheritanceDiff,
} from "../../../lib/server/v2/inheritance/diff.ts";
import {
  InheritanceV22Error,
} from "../../../lib/server/v2/inheritance/index.ts";

const OWNER = "owner-001";
const WORK = "work-001";
const UNIVERSE = "universe-001";
const VERSION_1 = "version-001";
const VERSION_2 = "version-002";
const MANIFEST_1 = "manifest-001";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshotObject(type, id, content, versionId) {
  return { type, id, content, versionId: versionId || JSON.stringify(content) };
}

function makeDiffInput(overrides = {}) {
  return {
    currentSnapshotObjects: [],
    latestUniverseObjects: [],
    currentUniverseVersionId: VERSION_1,
    latestUniverseVersionId: VERSION_1,
    currentManifestId: MANIFEST_1,
    workId: WORK,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock fetcher for adopt tests
// ---------------------------------------------------------------------------

/**
 * Create a mock fetcher that returns predetermined rows based on path needles.
 * Overrides are checked in insertion order; the first match wins. A function
 * override receives (path, init) so it can branch on method.
 */
function createFetcher(overrides = {}) {
  const calls = [];
  const entries = Object.entries(overrides);
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    for (const [needle, value] of entries) {
      if (path.includes(needle)) {
        return typeof value === "function" ? value(path, init) : value;
      }
    }
    return [];
  };
  fetcher.calls = calls;
  return fetcher;
}

// DB row fixtures for adopt tests

const manifestRowV1 = {
  id: MANIFEST_1,
  work_id: WORK,
  universe_id: UNIVERSE,
  universe_version_id: VERSION_1,
  relation: "sequel",
  timeline_anchor_id: null,
  canon_policy: "strict",
  included_entity_version_ids: ["entity-001", "entity-002"],
  included_fact_version_ids: [],
  included_relationship_version_ids: [],
  included_timeline_event_version_ids: [],
  included_asset_version_ids: [],
  is_active: true,
  superseded_by: null,
  created_by: OWNER,
  created_at: "2026-08-14T00:00:00.000Z",
};

const versionRowV1 = {
  id: VERSION_1,
  universe_id: UNIVERSE,
  version_no: 1,
  content_hash: "a".repeat(64),
  object_index: {
    entities: ["entity-001", "entity-002"],
    facts: [],
    relationships: [],
    timeline_events: [],
    assets: [],
  },
  created_by: OWNER,
  created_at: "2026-08-14T00:00:00.000Z",
};

const versionRowV2 = {
  id: VERSION_2,
  universe_id: UNIVERSE,
  version_no: 2,
  content_hash: "b".repeat(64),
  object_index: {
    entities: ["entity-001", "entity-002", "entity-003"],
    facts: [],
    relationships: [],
    timeline_events: [],
    assets: [],
  },
  created_by: OWNER,
  created_at: "2026-08-14T01:00:00.000Z",
};

const snapshotRowV1 = {
  id: "snapshot-001",
  manifest_id: MANIFEST_1,
  work_id: WORK,
  universe_version_id: VERSION_1,
  snapshot_hash: "a".repeat(64),
  object_snapshot: {
    universe_id: UNIVERSE,
    universe_version_id: VERSION_1,
    entities: [
      { id: "entity-001", type: "character", name: "Mara", summary: "Original.", status: "canon" },
      { id: "entity-002", type: "character", name: "Kael", summary: "Old.", status: "draft" },
    ],
    facts: [],
    relationships: [],
    timeline_events: [],
    assets: [],
  },
  created_at: "2026-08-14T00:00:00.000Z",
};

const workRow = { id: WORK, owner_id: OWNER };

// Latest universe entities (V2 state)
const latestEntityRows = [
  { id: "entity-001", type: "character", name: "Mara", summary: "Updated.", status: "canon", universe_id: UNIVERSE, created_at: "2026-08-14T00:00:00Z", updated_at: "2026-08-14T01:00:00Z" },
  { id: "entity-002", type: "character", name: "Kael", summary: "Old.", status: "draft", universe_id: UNIVERSE, created_at: "2026-08-14T00:00:00Z", updated_at: "2026-08-14T00:00:00Z" },
  { id: "entity-003", type: "character", name: "Rei", summary: "New character.", status: "draft", universe_id: UNIVERSE, created_at: "2026-08-14T01:00:00Z", updated_at: "2026-08-14T01:00:00Z" },
];

const newManifestRow = {
  id: "manifest-002",
  work_id: WORK,
  universe_id: UNIVERSE,
  universe_version_id: VERSION_2,
  relation: "sequel",
  timeline_anchor_id: null,
  canon_policy: "strict",
  included_entity_version_ids: ["entity-001", "entity-002", "entity-003"],
  included_fact_version_ids: [],
  included_relationship_version_ids: [],
  included_timeline_event_version_ids: [],
  included_asset_version_ids: [],
  is_active: true,
  superseded_by: null,
  created_by: OWNER,
  created_at: "2026-08-14T02:00:00.000Z",
};

const checkpointRow = {
  id: "checkpoint-001",
  work_id: WORK,
  parent_version_id: null,
  kind: "checkpoint",
  content_schema: "kiikis.inheritance-adopt/1",
  content_json: {},
  content_hash: "c".repeat(64),
  source: "manual",
  source_message_ids: [],
  source_job_id: null,
  idempotency_key: "adopt-key",
  created_by: OWNER,
  created_at: "2026-08-14T02:00:00.000Z",
};

// ============================================================
// 1. Stale detection: U2 published, Work bound to U1 → isStale=true
// ============================================================

test("stale detection: Universe publishes U2, Work bound to U1 → isStale=true, Work content unchanged", () => {
  const oldObj = makeSnapshotObject("entity", "entity-001", { name: "Mara" }, "v1");
  const newObj = makeSnapshotObject("entity", "entity-001", { name: "Mara" }, "v1");

  const result = computeInheritanceDiff(makeDiffInput({
    currentSnapshotObjects: [oldObj],
    latestUniverseObjects: [newObj],
    currentUniverseVersionId: VERSION_1,
    latestUniverseVersionId: VERSION_2,
  }));

  assert.equal(result.isStale, true);
  assert.equal(result.currentUniverseVersionId, VERSION_1);
  assert.equal(result.latestUniverseVersionId, VERSION_2);
  assert.equal(result.workId, WORK);
  assert.equal(result.currentManifestId, MANIFEST_1);
  // Work content is NOT changed — the snapshot object is still the same.
  assert.deepEqual(oldObj.content, { name: "Mara" });
});

// ============================================================
// 2. Object added in U2 → impact=added
// ============================================================

test("object added in U2 → diff impact=added", () => {
  const oldObj = makeSnapshotObject("entity", "entity-001", { name: "Mara" }, "v1");
  const newObj = makeSnapshotObject("entity", "entity-001", { name: "Mara" }, "v1");
  const addedObj = makeSnapshotObject("entity", "entity-002", { name: "Kael" }, "v2");

  const result = computeInheritanceDiff(makeDiffInput({
    currentSnapshotObjects: [oldObj],
    latestUniverseObjects: [newObj, addedObj],
    currentUniverseVersionId: VERSION_1,
    latestUniverseVersionId: VERSION_2,
  }));

  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].impact, "added");
  assert.equal(result.diffs[0].objectId, "entity-002");
  assert.equal(result.diffs[0].oldVersionId, null);
  assert.equal(result.diffs[0].newVersionId, "v2");
  assert.equal(result.diffs[0].fieldPath, null);
  assert.equal(result.diffs[0].before, null);
  assert.deepEqual(result.diffs[0].after, { name: "Kael" });
});

// ============================================================
// 3. Object changed in U2 → impact=changed, fieldPath set
// ============================================================

test("object changed in U2 → diff impact=changed, fieldPath set", () => {
  const oldObj = makeSnapshotObject("entity", "entity-001", { name: "Mara", summary: "Old." }, "v1");
  const newObj = makeSnapshotObject("entity", "entity-001", { name: "Mara", summary: "New!" }, "v2");

  const result = computeInheritanceDiff(makeDiffInput({
    currentSnapshotObjects: [oldObj],
    latestUniverseObjects: [newObj],
    currentUniverseVersionId: VERSION_1,
    latestUniverseVersionId: VERSION_2,
  }));

  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].impact, "changed");
  assert.equal(result.diffs[0].objectId, "entity-001");
  assert.equal(result.diffs[0].oldVersionId, "v1");
  assert.equal(result.diffs[0].newVersionId, "v2");
  assert.equal(result.diffs[0].fieldPath, "summary");
  assert.deepEqual(result.diffs[0].before, { name: "Mara", summary: "Old." });
  assert.deepEqual(result.diffs[0].after, { name: "Mara", summary: "New!" });
});

// ============================================================
// 4. Object removed in U2 → impact=deprecated
// ============================================================

test("object removed in U2 → diff impact=deprecated", () => {
  const oldObj = makeSnapshotObject("entity", "entity-001", { name: "Mara" }, "v1");
  const newObj = makeSnapshotObject("entity", "entity-002", { name: "Kael" }, "v1");

  const result = computeInheritanceDiff(makeDiffInput({
    currentSnapshotObjects: [oldObj, newObj],
    latestUniverseObjects: [newObj],
    currentUniverseVersionId: VERSION_1,
    latestUniverseVersionId: VERSION_2,
  }));

  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].impact, "deprecated");
  assert.equal(result.diffs[0].objectId, "entity-001");
  assert.equal(result.diffs[0].oldVersionId, "v1");
  assert.equal(result.diffs[0].newVersionId, null);
  assert.equal(result.diffs[0].fieldPath, null);
  assert.deepEqual(result.diffs[0].before, { name: "Mara" });
  assert.equal(result.diffs[0].after, null);
});

// ============================================================
// 5. Object with conflicting local state → impact=conflict
// ============================================================

test("object with conflicting local state → diff impact=conflict", () => {
  // Old object has localModified: true — Work locally modified it.
  const oldObj = makeSnapshotObject(
    "entity",
    "entity-001",
    { name: "Mara", summary: "Locally edited.", localModified: true },
    "v1-local",
  );
  // New object has different content — Universe also updated it.
  const newObj = makeSnapshotObject(
    "entity",
    "entity-001",
    { name: "Mara", summary: "Universe updated." },
    "v2",
  );

  const result = computeInheritanceDiff(makeDiffInput({
    currentSnapshotObjects: [oldObj],
    latestUniverseObjects: [newObj],
    currentUniverseVersionId: VERSION_1,
    latestUniverseVersionId: VERSION_2,
  }));

  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].impact, "conflict");
  assert.equal(result.diffs[0].objectId, "entity-001");
  assert.equal(result.diffs[0].fieldPath, "summary");
});

// ============================================================
// 6. Same Universe Version → isStale=false, empty diffs
// ============================================================

test("same Universe Version → isStale=false, empty diffs", () => {
  const oldObj = makeSnapshotObject("entity", "entity-001", { name: "Mara" }, "v1");
  const newObj = makeSnapshotObject("entity", "entity-001", { name: "Mara", extra: "ignored" }, "v2");

  const result = computeInheritanceDiff(makeDiffInput({
    currentSnapshotObjects: [oldObj],
    latestUniverseObjects: [newObj],
    currentUniverseVersionId: VERSION_1,
    latestUniverseVersionId: VERSION_1,
  }));

  assert.equal(result.isStale, false);
  assert.equal(result.diffs.length, 0);
});

// ============================================================
// 7. Determinism: same inputs → same diff order
// ============================================================

test("determinism: same inputs → same diff order", () => {
  const oldObjs = [
    makeSnapshotObject("entity", "entity-002", { name: "Kael" }, "v1"),
    makeSnapshotObject("entity", "entity-001", { name: "Mara" }, "v1"),
    makeSnapshotObject("fact", "fact-001", { text: "Fact" }, "v1"),
  ];
  const newObjs = [
    makeSnapshotObject("fact", "fact-001", { text: "Fact updated" }, "v2"),
    makeSnapshotObject("entity", "entity-001", { name: "Mara updated" }, "v2"),
    makeSnapshotObject("entity", "entity-002", { name: "Kael" }, "v1"),
  ];

  const input = makeDiffInput({
    currentSnapshotObjects: oldObjs,
    latestUniverseObjects: newObjs,
    currentUniverseVersionId: VERSION_1,
    latestUniverseVersionId: VERSION_2,
  });

  const result1 = computeInheritanceDiff(input);
  const result2 = computeInheritanceDiff({
    ...input,
    // Reverse input order to verify output is still deterministic.
    currentSnapshotObjects: [...oldObjs].reverse(),
    latestUniverseObjects: [...newObjs].reverse(),
  });

  assert.deepEqual(result1.diffs, result2.diffs);
  // Verify sort order: entity before fact, entity-001 before entity-002.
  assert.equal(result1.diffs[0].objectType, "entity");
  assert.equal(result1.diffs[0].objectId, "entity-001");
  assert.equal(result1.diffs[1].objectType, "fact");
  assert.equal(result1.diffs[1].objectId, "fact-001");
});

// ============================================================
// 8. categorizeObjectChange direct tests
// ============================================================

test("categorizeObjectChange: oldObj null, newObj exists → added", () => {
  const newObj = makeSnapshotObject("entity", "e1", { name: "Mara" }, "v1");
  const result = categorizeObjectChange(null, newObj);
  assert.equal(result.impact, "added");
  assert.equal(result.fieldPath, null);
  assert.equal(result.before, null);
  assert.deepEqual(result.after, { name: "Mara" });
});

test("categorizeObjectChange: oldObj exists, newObj null → deprecated", () => {
  const oldObj = makeSnapshotObject("entity", "e1", { name: "Mara" }, "v1");
  const result = categorizeObjectChange(oldObj, null);
  assert.equal(result.impact, "deprecated");
  assert.equal(result.fieldPath, null);
  assert.deepEqual(result.before, { name: "Mara" });
  assert.equal(result.after, null);
});

test("categorizeObjectChange: both exist, different versionId, no localModified → changed", () => {
  const oldObj = makeSnapshotObject("entity", "e1", { name: "Mara", summary: "Old" }, "v1");
  const newObj = makeSnapshotObject("entity", "e1", { name: "Mara", summary: "New" }, "v2");
  const result = categorizeObjectChange(oldObj, newObj);
  assert.equal(result.impact, "changed");
  assert.equal(result.fieldPath, "summary");
});

test("categorizeObjectChange: both exist, old has localModified → conflict", () => {
  const oldObj = makeSnapshotObject("entity", "e1", { name: "Mara", summary: "Local", localModified: true }, "v1");
  const newObj = makeSnapshotObject("entity", "e1", { name: "Mara", summary: "Universe" }, "v2");
  const result = categorizeObjectChange(oldObj, newObj);
  assert.equal(result.impact, "conflict");
});

// ============================================================
// 9. adopt: selected diffs create new manifest + checkpoint, unselected keep old
// ============================================================

test("adopt: selected diffs create new manifest + checkpoint, unselected keep old", async () => {
  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests": (path, init) => {
      // Active manifest GET (path has work_id query param)
      if (!init.method || init.method === "GET") return [manifestRowV1];
      // New manifest POST (path has no query param)
      if (init.method === "POST") return [newManifestRow];
      // PATCH (supersede or backfill superseded_by)
      if (init.method === "PATCH") return [];
      return [];
    },
    "storyflow_works?id=eq": [workRow],
    "storyflow_universe_versions?universe_id": (path, init) => {
      // Latest version GET (ordered by version_no.desc)
      if (!init.method || init.method === "GET") return [versionRowV2];
      return [];
    },
    "storyflow_universe_versions?id=eq": [versionRowV1],
    "storyflow_work_inheritance_snapshots?manifest_id": (path, init) => {
      // Snapshot GET
      if (!init.method || init.method === "GET") return [snapshotRowV1];
      // New snapshot POST
      if (init.method === "POST") return [];
      return [];
    },
    "storyflow_universe_entities?id=in": latestEntityRows,
    "/rest/v1/rpc/append_work_version": checkpointRow,
  });

  const result = await adoptInheritanceDiff({
    fetcher,
    ownerId: OWNER,
    workId: WORK,
    diffIds: ["entity-003"], // adopt only the new entity
  });

  assert.equal(result.idempotent, false);
  assert.equal(result.manifest.id, "manifest-002");
  assert.equal(result.manifest.universeVersionId, VERSION_2);

  // Verify supersede PATCH was called.
  const patches = fetcher.calls.filter(
    (c) => c.path.includes("storyflow_work_inheritance_manifests?id=eq") && c.init.method === "PATCH",
  );
  assert.ok(patches.length >= 2, "supersede + backfill superseded_by PATCHes");

  // Verify new manifest POST was called with latest version.
  const manifestPost = fetcher.calls.find(
    (c) => c.path.includes("storyflow_work_inheritance_manifests") && c.init.method === "POST" && !c.path.includes("?"),
  );
  assert.ok(manifestPost);
  const postBody = JSON.parse(manifestPost.init.body);
  assert.equal(postBody.universe_version_id, VERSION_2);
  assert.equal(postBody.is_active, true);

  // Verify checkpoint was created.
  const checkpointCalls = fetcher.calls.filter((c) => c.path.includes("/rpc/append_work_version"));
  assert.equal(checkpointCalls.length, 1);
  const checkpointBody = JSON.parse(checkpointCalls[0].init.body);
  assert.equal(checkpointBody.p_kind, "checkpoint");
  assert.match(checkpointBody.p_idempotency_key, /^adopt:/);
});

// ============================================================
// 10. adopt: idempotent (same diffIds → same new manifest)
// ============================================================

test("adopt: idempotent — second call with same diffIds returns current manifest without creating new", async () => {
  // After the first adoption, the active manifest already points to V2.
  const activeManifestV2 = { ...manifestRowV1, id: "manifest-002", universe_version_id: VERSION_2 };

  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests?work_id": (path, init) => {
      if (!init.method || init.method === "GET") return [activeManifestV2];
      return [];
    },
    "storyflow_works?id=eq": [workRow],
    "storyflow_universe_versions?universe_id": [versionRowV2],
    "storyflow_universe_versions?id=eq": [versionRowV2],
    "storyflow_work_inheritance_snapshots?manifest_id": [{ ...snapshotRowV1, manifest_id: "manifest-002", universe_version_id: VERSION_2 }],
    "storyflow_universe_entities?id=in": latestEntityRows,
  });

  const result = await adoptInheritanceDiff({
    fetcher,
    ownerId: OWNER,
    workId: WORK,
    diffIds: ["entity-003"],
  });

  assert.equal(result.idempotent, true);
  assert.equal(result.manifest.id, "manifest-002");
  assert.equal(result.manifest.universeVersionId, VERSION_2);

  // No manifest POST or checkpoint should have been made.
  const manifestPosts = fetcher.calls.filter(
    (c) => c.path.includes("storyflow_work_inheritance_manifests") && c.init.method === "POST" && !c.path.includes("?"),
  );
  assert.equal(manifestPosts.length, 0, "no new manifest should be created when idempotent");

  const checkpointCalls = fetcher.calls.filter((c) => c.path.includes("/rpc/append_work_version"));
  assert.equal(checkpointCalls.length, 0, "no checkpoint should be created when idempotent");
});

// ============================================================
// 11. adopt: empty diffIds → validation_failed
// ============================================================

test("adopt: empty diffIds → validation_failed", async () => {
  const fetcher = createFetcher();

  await assert.rejects(
    adoptInheritanceDiff({
      fetcher,
      ownerId: OWNER,
      workId: WORK,
      diffIds: [],
    }),
    (err) => err instanceof InheritanceV22Error && err.code === "validation_failed",
  );

  // No fetcher calls should have been made.
  assert.equal(fetcher.calls.length, 0);
});

// ============================================================
// 12. adopt: invalid diffId → validation_failed
// ============================================================

test("adopt: invalid diffId not in computed diff → validation_failed", async () => {
  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests?work_id": [manifestRowV1],
    "storyflow_works?id=eq": [workRow],
    "storyflow_universe_versions?universe_id": [versionRowV2],
    "storyflow_universe_versions?id=eq": [versionRowV1],
    "storyflow_work_inheritance_snapshots?manifest_id": [snapshotRowV1],
    "storyflow_universe_entities?id=in": latestEntityRows,
  });

  await assert.rejects(
    adoptInheritanceDiff({
      fetcher,
      ownerId: OWNER,
      workId: WORK,
      diffIds: ["nonexistent-entity"],
    }),
    (err) => err instanceof InheritanceV22Error && err.code === "validation_failed",
  );
});

// ============================================================
// 13. adopt: unadopted changed object keeps old content in new snapshot
// ============================================================

test("adopt: unadopted changed object keeps old content in new snapshot", async () => {
  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests": (path, init) => {
      if (!init.method || init.method === "GET") return [manifestRowV1];
      if (init.method === "POST") return [newManifestRow];
      if (init.method === "PATCH") return [];
      return [];
    },
    "storyflow_works?id=eq": [workRow],
    "storyflow_universe_versions?universe_id": [versionRowV2],
    "storyflow_universe_versions?id=eq": [versionRowV1],
    "storyflow_work_inheritance_snapshots?manifest_id": (path, init) => {
      if (!init.method || init.method === "GET") return [snapshotRowV1];
      if (init.method === "POST") return [];
      return [];
    },
    "storyflow_universe_entities?id=in": latestEntityRows,
    "/rest/v1/rpc/append_work_version": checkpointRow,
  });

  // Adopt only entity-003 (the added one). entity-001 (changed) is NOT adopted.
  const result = await adoptInheritanceDiff({
    fetcher,
    ownerId: OWNER,
    workId: WORK,
    diffIds: ["entity-003"],
  });

  assert.equal(result.manifest.id, "manifest-002");

  // The new snapshot POST should contain entity-001 with OLD content (summary: "Original.").
  const snapshotPost = fetcher.calls.find(
    (c) => c.path.includes("storyflow_work_inheritance_snapshots") && c.init.method === "POST" && !c.path.includes("?"),
  );
  assert.ok(snapshotPost);
  const snapshotBody = JSON.parse(snapshotPost.init.body);
  const entities = snapshotBody.object_snapshot.entities;
  const entity001 = entities.find((e) => e.id === "entity-001");
  // entity-001 was changed in U2 but NOT adopted → old content preserved.
  assert.equal(entity001.summary, "Original.");
  // entity-003 was adopted → new content present.
  const entity003 = entities.find((e) => e.id === "entity-003");
  assert.ok(entity003, "adopted entity-003 should be in the new snapshot");
});

// ============================================================
// 14. adopt: adopting a deprecated object removes it from the snapshot
// ============================================================

test("adopt: adopting a deprecated object removes it from the new snapshot", async () => {
  // V2 version index does NOT include entity-002 → it's deprecated.
  const versionRowV2NoEntity002 = {
    ...versionRowV2,
    object_index: {
      ...versionRowV2.object_index,
      entities: ["entity-001"],
    },
  };
  const latestRowsNoEntity002 = [latestEntityRows[0]]; // only entity-001

  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests": (path, init) => {
      if (!init.method || init.method === "GET") return [manifestRowV1];
      if (init.method === "POST") return [newManifestRow];
      if (init.method === "PATCH") return [];
      return [];
    },
    "storyflow_works?id=eq": [workRow],
    "storyflow_universe_versions?universe_id": [versionRowV2NoEntity002],
    "storyflow_universe_versions?id=eq": [versionRowV1],
    "storyflow_work_inheritance_snapshots?manifest_id": (path, init) => {
      if (!init.method || init.method === "GET") return [snapshotRowV1];
      if (init.method === "POST") return [];
      return [];
    },
    "storyflow_universe_entities?id=in": latestRowsNoEntity002,
    "/rest/v1/rpc/append_work_version": checkpointRow,
  });

  // Adopt the deprecation of entity-002.
  const result = await adoptInheritanceDiff({
    fetcher,
    ownerId: OWNER,
    workId: WORK,
    diffIds: ["entity-002"],
  });

  assert.equal(result.manifest.id, "manifest-002");

  const snapshotPost = fetcher.calls.find(
    (c) => c.path.includes("storyflow_work_inheritance_snapshots") && c.init.method === "POST" && !c.path.includes("?"),
  );
  assert.ok(snapshotPost);
  const snapshotBody = JSON.parse(snapshotPost.init.body);
  const entityIds = snapshotBody.object_snapshot.entities.map((e) => e.id);
  assert.ok(!entityIds.includes("entity-002"), "deprecated entity-002 should be removed from snapshot");
});

// ============================================================
// 15. adopt: work not bound → not_found
// ============================================================

test("adopt: work not bound to a Universe → not_found", async () => {
  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests?work_id": [],
  });

  await assert.rejects(
    adoptInheritanceDiff({
      fetcher,
      ownerId: OWNER,
      workId: WORK,
      diffIds: ["entity-001"],
    }),
    (err) => err instanceof InheritanceV22Error && err.code === "not_found",
  );
});

// ============================================================
// 16. adopt: empty ownerId → unauthenticated
// ============================================================

test("adopt: empty ownerId → unauthenticated", async () => {
  const fetcher = createFetcher();

  await assert.rejects(
    adoptInheritanceDiff({
      fetcher,
      ownerId: "",
      workId: WORK,
      diffIds: ["entity-001"],
    }),
    (err) => err instanceof InheritanceV22Error && err.code === "unauthenticated",
  );

  assert.equal(fetcher.calls.length, 0);
});
