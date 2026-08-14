/**
 * Phase 2 Task 2.2 — Work-level Universe inheritance bind & read tests.
 *
 * Verifies (PRD Task 2.2 Step 1 RED→GREEN):
 *   - standalone Work first bind: creates manifest + snapshot (via atomic RPC)
 *   - from Universe create: pre-bound (idempotent — second bind with same params returns existing)
 *   - cross-user rejected (forbidden)
 *   - object not in Universe rejected (validation_failed)
 *   - manifest/snapshot atomicity: if the RPC fails (snapshot insert), no manifest is created
 *   - readWorkInheritanceV22 returns null when not bound
 *   - readWorkInheritanceV22 returns active manifest when bound
 *   - bindWorkToUniverseV22 rejects empty ownerId (unauthenticated)
 *   - bindWorkToUniverseV22 rejects empty workId (validation_failed)
 *   - bindWorkToUniverseV22 rejects unknown relation (validation_failed)
 *   - bindWorkToUniverseV22 rejects unknown canonPolicy (validation_failed)
 *
 * Run: node --test tests/server-v2/inheritance/inheritance-v22.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  bindWorkToUniverseV22,
  readWorkInheritanceV22,
  InheritanceV22Error,
} from "../../../lib/server/v2/inheritance/index.ts";

const OWNER = "owner-001";
const OTHER_USER = "owner-002";
const WORK = "work-001";
const UNIVERSE = "universe-001";

// ---------------------------------------------------------------------------
// DB row fixtures (snake_case, as returned by PostgREST)
// ---------------------------------------------------------------------------

const manifestRow = {
  id: "manifest-001",
  work_id: WORK,
  universe_id: UNIVERSE,
  universe_version_id: "version-001",
  relation: "sequel",
  timeline_anchor_id: null,
  canon_policy: "strict",
  included_entity_version_ids: ["entity-001", "entity-002"],
  included_fact_version_ids: ["fact-001"],
  included_relationship_version_ids: [],
  included_timeline_event_version_ids: [],
  included_asset_version_ids: [],
  is_active: true,
  superseded_by: null,
  created_by: OWNER,
  created_at: "2026-08-14T00:00:00.000Z",
};

const versionRow = {
  id: "version-001",
  universe_id: UNIVERSE,
  version_no: 1,
  content_hash: "a".repeat(64),
  object_index: {
    entities: ["entity-001", "entity-002"],
    facts: ["fact-001"],
    relationships: [],
    timelineEvents: [],
    assets: [],
  },
  created_by: OWNER,
  created_at: "2026-08-14T00:00:00.000Z",
};

const snapshotRow = {
  id: "snapshot-001",
  manifest_id: "manifest-001",
  work_id: WORK,
  universe_version_id: "version-001",
  snapshot_hash: "a".repeat(64),
  object_snapshot: {
    universe_id: UNIVERSE,
    entities: [{ id: "entity-001", name: "Mara" }],
  },
  created_at: "2026-08-14T00:00:00.000Z",
};

const workRow = { id: WORK, owner_id: OWNER };
const otherWorkRow = { id: WORK, owner_id: OTHER_USER };

const BIND_PARAMS = {
  ownerId: OWNER,
  workId: WORK,
  universeId: UNIVERSE,
  relation: "sequel",
  canonPolicy: "strict",
  includedEntityIds: ["entity-001", "entity-002"],
  includedFactIds: ["fact-001"],
};

// ---------------------------------------------------------------------------
// Mock fetcher factory
// ---------------------------------------------------------------------------

/**
 * Create a mock fetcher that returns predetermined rows based on path needles.
 * Overrides are checked in insertion order; the first match wins. A function
 * override receives (path, init) so it can branch on method.
 *
 * `calls` is exposed for atomicity assertions.
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

// ============================================================
// 1. standalone Work first bind: creates manifest + snapshot
// ============================================================

test("standalone Work first bind calls the atomic RPC and returns a camelCase manifest", async () => {
  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests": (path, init) => {
      // Idempotency GET returns [] (no existing active manifest).
      if (!init.method || init.method === "GET") return [];
      return [manifestRow];
    },
    "/rpc/bind_work_to_universe_v22": manifestRow,
  });

  const manifest = await bindWorkToUniverseV22({ fetcher, ...BIND_PARAMS });

  assert.equal(manifest.id, "manifest-001");
  assert.equal(manifest.workId, WORK);
  assert.equal(manifest.universeId, UNIVERSE);
  assert.equal(manifest.universeVersionId, "version-001");
  assert.equal(manifest.relation, "sequel");
  assert.equal(manifest.canonPolicy, "strict");
  assert.equal(manifest.timelineAnchorId, null);
  assert.deepEqual(manifest.includedEntityVersionIds, ["entity-001", "entity-002"]);
  assert.deepEqual(manifest.includedFactVersionIds, ["fact-001"]);
  assert.equal(manifest.isActive, true);
  assert.equal(manifest.supersededBy, null);
  assert.equal(manifest.createdBy, OWNER);
  assert.equal(manifest.createdAt, "2026-08-14T00:00:00.000Z");

  // The RPC was called exactly once with the correct params.
  const rpcCalls = fetcher.calls.filter((c) => c.path.includes("/rpc/bind_work_to_universe_v22"));
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].init.method, "POST");
  const body = JSON.parse(rpcCalls[0].init.body);
  assert.equal(body.p_work_id, WORK);
  assert.equal(body.p_universe_id, UNIVERSE);
  assert.equal(body.p_relation, "sequel");
  assert.equal(body.p_canon_policy, "strict");
  assert.equal(body.p_caller_id, OWNER);
  assert.deepEqual(body.p_included_entity_ids, ["entity-001", "entity-002"]);
});

// ============================================================
// 2. from Universe create: pre-bound (idempotent)
// ============================================================

test("idempotent bind: second call with same params returns existing manifest without calling RPC", async () => {
  let rpcCallCount = 0;
  const fetcher = async (path, init = {}) => {
    fetcher.calls.push({ path, init });
    // Idempotency GET: returns [] before the first RPC, [manifestRow] after.
    if (path.includes("storyflow_work_inheritance_manifests") && (!init.method || init.method === "GET")) {
      return rpcCallCount === 0 ? [] : [manifestRow];
    }
    if (path.includes("/rpc/bind_work_to_universe_v22")) {
      rpcCallCount += 1;
      return manifestRow;
    }
    return [];
  };
  fetcher.calls = [];

  const r1 = await bindWorkToUniverseV22({ fetcher, ...BIND_PARAMS });
  assert.equal(r1.id, "manifest-001");
  assert.equal(rpcCallCount, 1);

  const r2 = await bindWorkToUniverseV22({ fetcher, ...BIND_PARAMS });
  assert.equal(r2.id, "manifest-001");
  // RPC was NOT called again — idempotent return.
  assert.equal(rpcCallCount, 1);
});

test("idempotent bind: different includedEntityIds triggers a new RPC call", async () => {
  let rpcCallCount = 0;
  const fetcher = async (path, init = {}) => {
    fetcher.calls.push({ path, init });
    if (path.includes("storyflow_work_inheritance_manifests") && (!init.method || init.method === "GET")) {
      return rpcCallCount === 0 ? [] : [manifestRow];
    }
    if (path.includes("/rpc/bind_work_to_universe_v22")) {
      rpcCallCount += 1;
      return manifestRow;
    }
    return [];
  };
  fetcher.calls = [];

  await bindWorkToUniverseV22({ fetcher, ...BIND_PARAMS });
  assert.equal(rpcCallCount, 1);

  // Different entity set → not idempotent → RPC called again.
  await bindWorkToUniverseV22({
    fetcher,
    ...BIND_PARAMS,
    includedEntityIds: ["entity-003"],
  });
  assert.equal(rpcCallCount, 2);
});

// ============================================================
// 3. cross-user rejected (forbidden)
// ============================================================

test("cross-user bind is rejected with forbidden when RPC raises FORBIDDEN", async () => {
  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests": [],
    "/rpc/bind_work_to_universe_v22": () => {
      throw new Error("SUPABASE_SERVICE_ERROR:42501:FORBIDDEN");
    },
  });

  await assert.rejects(
    bindWorkToUniverseV22({ fetcher, ...BIND_PARAMS }),
    (err) => err instanceof InheritanceV22Error && err.code === "forbidden",
  );
});

// ============================================================
// 4. object not in Universe rejected (validation_failed)
// ============================================================

test("bind with an entity not in the Universe is rejected with validation_failed", async () => {
  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests": [],
    "/rpc/bind_work_to_universe_v22": () => {
      throw new Error("SUPABASE_SERVICE_ERROR:23503:ENTITY_NOT_IN_UNIVERSE");
    },
  });

  await assert.rejects(
    bindWorkToUniverseV22({ fetcher, ...BIND_PARAMS }),
    (err) => err instanceof InheritanceV22Error && err.code === "validation_failed",
  );
});

// ============================================================
// 5. manifest/snapshot atomicity: if RPC fails, no manifest is created
// ============================================================

test("atomicity: if the RPC fails (snapshot insert), no manifest is created and no separate inserts are attempted", async () => {
  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests": [],
    "/rpc/bind_work_to_universe_v22": () => {
      // Simulate a failure inside the RPC (e.g. snapshot insert constraint).
      throw new Error("SNAPSHOT_INSERT_FAILED");
    },
  });

  await assert.rejects(
    bindWorkToUniverseV22({ fetcher, ...BIND_PARAMS }),
    (err) => err instanceof InheritanceV22Error,
  );

  // The service must NOT attempt separate manifest or snapshot inserts —
  // atomicity is structural (single RPC call).
  const manifestInserts = fetcher.calls.filter(
    (c) => c.path.includes("storyflow_work_inheritance_manifests") && c.init.method === "POST",
  );
  assert.equal(manifestInserts.length, 0, "no direct manifest insert should be attempted");

  const snapshotInserts = fetcher.calls.filter(
    (c) => c.path.includes("storyflow_work_inheritance_snapshots") && c.init.method === "POST",
  );
  assert.equal(snapshotInserts.length, 0, "no direct snapshot insert should be attempted");

  // The RPC was called exactly once.
  const rpcCalls = fetcher.calls.filter((c) => c.path.includes("/rpc/bind_work_to_universe_v22"));
  assert.equal(rpcCalls.length, 1);
});

// ============================================================
// 6. readWorkInheritanceV22 returns null when not bound
// ============================================================

test("readWorkInheritanceV22 returns null manifest/version/snapshot when work is not bound", async () => {
  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests": [],
  });

  const result = await readWorkInheritanceV22({ fetcher, ownerId: OWNER, workId: WORK });

  assert.equal(result.manifest, null);
  assert.equal(result.universeVersion, null);
  assert.equal(result.snapshot, null);
});

// ============================================================
// 7. readWorkInheritanceV22 returns active manifest when bound
// ============================================================

test("readWorkInheritanceV22 returns active manifest + universe version + snapshot when bound", async () => {
  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests": [manifestRow],
    "storyflow_works": [workRow],
    "storyflow_universe_versions": [versionRow],
    "storyflow_work_inheritance_snapshots": [snapshotRow],
  });

  const result = await readWorkInheritanceV22({ fetcher, ownerId: OWNER, workId: WORK });

  assert.equal(result.manifest.id, "manifest-001");
  assert.equal(result.manifest.workId, WORK);
  assert.equal(result.manifest.universeId, UNIVERSE);
  assert.equal(result.manifest.relation, "sequel");
  assert.equal(result.manifest.isActive, true);

  assert.equal(result.universeVersion.id, "version-001");
  assert.equal(result.universeVersion.universeId, UNIVERSE);
  assert.equal(result.universeVersion.versionNo, 1);
  assert.equal(result.universeVersion.contentHash, "a".repeat(64));
  assert.deepEqual(result.universeVersion.objectIndex.entities, ["entity-001", "entity-002"]);
  assert.deepEqual(result.universeVersion.objectIndex.facts, ["fact-001"]);

  assert.equal(result.snapshot.id, "snapshot-001");
  assert.equal(result.snapshot.manifestId, "manifest-001");
  assert.equal(result.snapshot.snapshotHash, "a".repeat(64));
  assert.deepEqual(result.snapshot.objectSnapshot.entities, [{ id: "entity-001", name: "Mara" }]);
});

test("readWorkInheritanceV22 rejects with forbidden when work owner does not match", async () => {
  const fetcher = createFetcher({
    "storyflow_work_inheritance_manifests": [manifestRow],
    "storyflow_works": [otherWorkRow],
  });

  await assert.rejects(
    readWorkInheritanceV22({ fetcher, ownerId: OWNER, workId: WORK }),
    (err) => err instanceof InheritanceV22Error && err.code === "forbidden",
  );
});

// ============================================================
// 8. bindWorkToUniverseV22 rejects empty ownerId (unauthenticated)
// ============================================================

test("bindWorkToUniverseV22 rejects empty ownerId with unauthenticated", async () => {
  const fetcher = createFetcher();

  await assert.rejects(
    bindWorkToUniverseV22({ fetcher, ...BIND_PARAMS, ownerId: "" }),
    (err) => err instanceof InheritanceV22Error && err.code === "unauthenticated",
  );

  // No fetcher calls should have been made.
  assert.equal(fetcher.calls.length, 0);
});

// ============================================================
// 9. bindWorkToUniverseV22 rejects empty workId (validation_failed)
// ============================================================

test("bindWorkToUniverseV22 rejects empty workId with validation_failed", async () => {
  const fetcher = createFetcher();

  await assert.rejects(
    bindWorkToUniverseV22({ fetcher, ...BIND_PARAMS, workId: "" }),
    (err) => err instanceof InheritanceV22Error && err.code === "validation_failed",
  );

  assert.equal(fetcher.calls.length, 0);
});

// ============================================================
// 10. bindWorkToUniverseV22 rejects unknown relation (validation_failed)
// ============================================================

test("bindWorkToUniverseV22 rejects unknown relation with validation_failed", async () => {
  const fetcher = createFetcher();

  await assert.rejects(
    bindWorkToUniverseV22({ fetcher, ...BIND_PARAMS, relation: "fanfic" }),
    (err) => err instanceof InheritanceV22Error && err.code === "validation_failed",
  );

  assert.equal(fetcher.calls.length, 0);
});

// ============================================================
// 11. bindWorkToUniverseV22 rejects unknown canonPolicy (validation_failed)
// ============================================================

test("bindWorkToUniverseV22 rejects unknown canonPolicy with validation_failed", async () => {
  const fetcher = createFetcher();

  await assert.rejects(
    bindWorkToUniverseV22({ fetcher, ...BIND_PARAMS, canonPolicy: "loose" }),
    (err) => err instanceof InheritanceV22Error && err.code === "validation_failed",
  );

  assert.equal(fetcher.calls.length, 0);
});
