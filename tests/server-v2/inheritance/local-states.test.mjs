import assert from "node:assert/strict";
import test from "node:test";

import {
  InheritanceLocalStateError,
  listLocalStates,
  proposeLocalState,
  upsertLocalState,
} from "../../../lib/server/v2/inheritance/local-states.ts";

const OWNER = "owner-1";
const WORK = "work-1";
const PROJECT = "project-1";
const UNIVERSE = "universe-1";
const MANIFEST = "manifest-1";

const work = { id: WORK, owner_id: OWNER, project_id: PROJECT };
const manifest = {
  id: MANIFEST,
  work_id: WORK,
  universe_id: UNIVERSE,
  is_active: true,
};
const snapshot = {
  object_snapshot: {
    entities: [{ id: "entity-1", name: "Mara", summary: "Canon" }],
  },
};
const state = {
  id: "state-1",
  work_id: WORK,
  base_manifest_id: MANIFEST,
  entity_type: "entity",
  entity_id: "entity-1",
  patch_json: { note: "Mara hides the map in this Work." },
  revision: 1,
  status: "active",
  created_by: OWNER,
  created_at: "2026-08-30T00:00:00Z",
  updated_at: "2026-08-30T00:00:00Z",
};

function createFetcher(overrides = {}) {
  const calls = [];
  const entries = Object.entries(overrides);
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    for (const [needle, value] of entries) {
      if (path.includes(needle)) return typeof value === "function" ? value(path, init) : value;
    }
    return [];
  };
  fetcher.calls = calls;
  return fetcher;
}

function baseFetcher(extra = {}) {
  return createFetcher({
    "storyflow_works?": [work],
    "storyflow_work_inheritance_manifests": [manifest],
    "storyflow_work_inheritance_snapshots": [snapshot],
    ...extra,
  });
}

test("local state create verifies Work owner and inherited snapshot membership", async () => {
  const fetcher = baseFetcher({
    "storyflow_work_local_states": (path, init) => {
      if (init.method === "POST") return [state];
      return [];
    },
  });

  const result = await upsertLocalState({
    fetcher,
    ownerId: OWNER,
    workId: WORK,
    entityType: "entity",
    entityId: "entity-1",
    note: "Mara hides the map in this Work.",
  });

  assert.equal(result.created, true);
  assert.equal(result.state.revision, 1);
  const insert = fetcher.calls.find((call) => call.path === "/rest/v1/storyflow_work_local_states");
  assert.ok(insert);
  const body = JSON.parse(insert.init.body);
  assert.equal(body.base_manifest_id, MANIFEST);
  assert.deepEqual(body.patch_json, { note: "Mara hides the map in this Work." });
});

test("local state create rejects an object outside the immutable inheritance snapshot", async () => {
  const fetcher = baseFetcher();
  await assert.rejects(
    upsertLocalState({
      fetcher,
      ownerId: OWNER,
      workId: WORK,
      entityType: "entity",
      entityId: "missing-entity",
      note: "Invented object",
    }),
    (error) => error instanceof InheritanceLocalStateError && error.code === "validation_failed",
  );
  assert.equal(fetcher.calls.some((call) => call.init.method === "POST"), false);
});

test("local state update uses revision CAS and increments exactly once", async () => {
  const fetcher = baseFetcher({
    "storyflow_work_local_states": (path, init) => {
      if (init.method === "PATCH") return [{ ...state, patch_json: { note: "Updated" }, revision: 2 }];
      return [state];
    },
  });

  const result = await upsertLocalState({
    fetcher,
    ownerId: OWNER,
    workId: WORK,
    entityType: "entity",
    entityId: "entity-1",
    note: "Updated",
    expectedRevision: 1,
  });

  assert.equal(result.created, false);
  assert.equal(result.state.revision, 2);
  const update = fetcher.calls.find((call) => call.init.method === "PATCH");
  assert.match(update.path, /revision=eq\.1/);
  assert.equal(JSON.parse(update.init.body).revision, 2);
});

test("local state stale revision returns conflict instead of overwriting", async () => {
  const fetcher = baseFetcher({
    "storyflow_work_local_states": (path, init) => init.method === "PATCH" ? [] : [state],
  });
  await assert.rejects(
    upsertLocalState({
      fetcher,
      ownerId: OWNER,
      workId: WORK,
      entityType: "entity",
      entityId: "entity-1",
      note: "Stale update",
      expectedRevision: 1,
    }),
    (error) => error instanceof InheritanceLocalStateError && error.code === "conflict",
  );
});

test("local state list returns owner-only patches for the requested Work", async () => {
  const fetcher = baseFetcher({ "storyflow_work_local_states": [state] });
  const result = await listLocalStates({ fetcher, ownerId: OWNER, workId: WORK });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].patch, state.patch_json);
  assert.ok(fetcher.calls.some((call) => call.path.includes(`work_id=eq.${WORK}`)));
});

test("propose local state creates an idempotent pending proposal without mutating Canon", async () => {
  const proposalRow = {
    id: "proposal-1",
    universe_id: UNIVERSE,
    user_id: OWNER,
    source_project_id: PROJECT,
    source_step: "script",
    source_text: state.patch_json.note,
    source_reference: { kind: "decision", label: "Work local override r1" },
    confidence: 1,
    field_diffs: [],
    suggested_action: "review_local_override",
    idempotency_key: "work-local:state-1:r1",
    status: "pending_review",
    created_at: "2026-08-30T01:00:00Z",
    updated_at: "2026-08-30T01:00:00Z",
  };
  const fetcher = baseFetcher({
    "storyflow_work_local_states": [state],
    "storyflow_project_steps": [{ step_key: "script" }],
    "storyflow_universes": [{ id: UNIVERSE, user_id: OWNER, team_id: null }],
    "/rpc/create_change_proposal": { created: true, proposal: proposalRow },
  });

  const result = await proposeLocalState({ fetcher, ownerId: OWNER, workId: WORK, stateId: state.id });

  assert.equal(result.created, true);
  assert.equal(result.proposal.status, "pending_review");
  const rpc = fetcher.calls.find((call) => call.path.includes("/rpc/create_change_proposal"));
  const body = JSON.parse(rpc.init.body);
  assert.equal(body.p_idempotency_key, "work-local:state-1:r1");
  assert.equal(body.p_source_project_id, PROJECT);
  assert.equal(body.p_items[0].objectId, "entity-1");
  assert.equal(fetcher.calls.some((call) => call.init.method === "PATCH" && call.path.includes("universe")), false);
});
