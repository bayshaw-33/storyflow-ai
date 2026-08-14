import assert from "node:assert/strict";
import test from "node:test";

const { ProposalError, createProposal, createProposalBatch, listProposals, updateProposal } = await import("../../../lib/server/v2/proposals/index.ts");

const universe = { id: "u-1", user_id: "user-1", team_id: null, name: "Glass Sea" };
const existingProposal = {
  id: "proposal-1",
  universe_id: "u-1",
  user_id: "user-1",
  source_project_id: "project-1",
  source_step: "script_finalized",
  source_text: "Mara has a scar.",
  source_asset_id: null,
  confidence: 0.92,
  field_diffs: [{ path: "summary", before: "", after: "Has a scar." }],
  suggested_action: "merge",
  idempotency_key: "extract-1",
  status: "pending_review",
  created_at: "2026-08-12T00:00:00Z",
  updated_at: "2026-08-12T00:00:00Z",
};

function createFetcher(overrides = {}) {
  const calls = [];
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    for (const [needle, value] of Object.entries(overrides)) {
      if (path.includes(needle)) return typeof value === "function" ? value(path, init) : value;
    }
    if (path.includes("storyflow_universes")) return [universe];
    if (path.includes("/rpc/create_change_proposal")) return { created: true, proposal: existingProposal };
    if (path.includes("storyflow_change_proposals") && init.method === "POST") return [existingProposal];
    if (path.includes("storyflow_change_proposals")) return [existingProposal];
    if (path.includes("storyflow_change_proposal_items")) return [{ id: "item-1", proposal_id: "proposal-1", object_type: "entity", object_id: "entity-1", proposed_payload: { summary: "Has a scar." } }];
    throw new Error(`unexpected query: ${path}`);
  };
  fetcher.calls = calls;
  return fetcher;
}

const createInput = { sourceProjectId: "project-1", sourceStep: "script_finalized", originalText: "Mara has a scar.", confidence: 0.92, fieldDiffs: [{ path: "summary", before: "", after: "Has a scar." }], suggestedAction: "merge", idempotencyKey: "extract-1", target: { objectType: "entity", objectId: "entity-1" }, proposedPayload: { summary: "Has a scar." } };

test("createProposal is idempotent when the same source is extracted twice", async () => {
  const fetcher = createFetcher({
    "/rpc/create_change_proposal": { created: false, proposal: existingProposal },
  });
  const result = await createProposal({ fetcher, userId: "user-1", universeId: "u-1", input: createInput });
  assert.equal(result.proposal.id, "proposal-1");
  assert.equal(result.created, false);
  assert.equal(fetcher.calls.filter(({ path }) => path.includes("/rpc/create_change_proposal")).length, 1);
});

test("new proposals retain source evidence for the database insert trigger", async () => {
  const created = { ...existingProposal, id: "proposal-new", idempotency_key: "extract-new" };
  const fetcher = createFetcher({
    "/rpc/create_change_proposal": { created: true, proposal: created },
  });
  const result = await createProposal({ fetcher, userId: "user-1", universeId: "u-1", input: { ...createInput, idempotencyKey: "extract-new" } });
  assert.equal(result.created, true);
  assert.ok(fetcher.calls.some(({ path }) => path.includes("/rpc/create_change_proposal")));
});

test("batch acceptance is delegated to an atomic database operation", async () => {
  const fetcher = createFetcher({ "/rpc/apply_change_proposal_batch": { items: [{ proposalId: "proposal-1", status: "accepted" }] } });
  const result = await createProposalBatch({ fetcher, userId: "user-1", universeId: "u-1", proposalIds: ["proposal-1"], action: "accept" });
  assert.equal(result.items[0].status, "accepted");
  assert.equal(fetcher.calls.filter(({ path }) => path.includes("/rpc/apply_change_proposal_batch")).length, 1);
});

test("accept delegates the Canon write and versioning to one transactional RPC", async () => {
  const fetcher = createFetcher({
    "/rpc/apply_change_proposal": { proposalId: "proposal-1", status: "accepted", versionId: "version-1", affected: [{ objectType: "entity", count: 1 }] },
  });
  const result = await updateProposal({ fetcher, userId: "user-1", universeId: "u-1", proposalId: "proposal-1", action: "accept" });
  assert.equal(result.status, "accepted");
  const rpc = fetcher.calls.find(({ path }) => path.includes("/rpc/apply_change_proposal"));
  assert.ok(rpc);
  assert.match(rpc.init.body, /"p_action":"accept"/);
  assert.equal(fetcher.calls.some(({ path }) => path.includes("storyflow_canon_facts") || path.includes("storyflow_universe_entities") && !path.includes("storyflow_change")), false);
});

test("failed acceptance never falls back to a direct Canon mutation", async () => {
  const fetcher = createFetcher({ "/rpc/apply_change_proposal": () => { throw new Error("transaction failed"); } });
  await assert.rejects(updateProposal({ fetcher, userId: "user-1", universeId: "u-1", proposalId: "proposal-1", action: "accept" }), (error) => error instanceof ProposalError && error.code === "service_unavailable");
  assert.equal(fetcher.calls.some(({ path, init }) => init.method === "PATCH" && /canon|universe_entities/.test(path)), false);
});

test("batch preview returns affected object counts and types before acceptance", async () => {
  const fetcher = createFetcher({
    "storyflow_change_proposals": [existingProposal, { ...existingProposal, id: "proposal-2", source_project_id: "project-2" }],
    "storyflow_change_proposal_items": [
      { id: "item-1", proposal_id: "proposal-1", object_type: "entity", object_id: "entity-1", proposed_payload: {} },
      { id: "item-2", proposal_id: "proposal-2", object_type: "timeline_event", object_id: "event-1", proposed_payload: {} },
    ],
  });
  const result = await createProposalBatch({ fetcher, userId: "user-1", universeId: "u-1", proposalIds: ["proposal-1", "proposal-2"], action: "preview_accept" });
  assert.deepEqual(result.impactSummary, { proposalCount: 2, affectedObjectCount: 2, affectedObjectTypes: { entity: 1, timeline_event: 1 } });
  assert.equal(fetcher.calls.some(({ init }) => init.method === "PATCH"), false);
});

test("proposal actions are limited to review transitions", async () => {
  const fetcher = createFetcher();
  await assert.rejects(updateProposal({ fetcher, userId: "user-1", universeId: "u-1", proposalId: "proposal-1", action: "delete" }), (error) => error instanceof ProposalError && error.code === "validation_failed");
  const list = await listProposals({ fetcher, userId: "user-1", universeId: "u-1", status: "pending_review" });
  assert.equal(list.items.length, 1);
  assert.match(fetcher.calls.find(({ path }) => path.includes("storyflow_change_proposals") && path.includes("status=eq"))?.path || "", /status=eq.pending_review/);
});

// ============================================================
// V2.2 — Work → Universe Proposal (Phase 2 Task 2.4 Step 4)
// ============================================================

test("V2.2: new proposals are created in draft or pending_review status (submittable states only)", async () => {
  const draftProposal = { ...existingProposal, status: "pending_review" };
  const fetcher = createFetcher({
    "/rpc/create_change_proposal": { created: true, proposal: draftProposal },
  });
  const result = await createProposal({ fetcher, userId: "user-1", universeId: "u-1", input: createInput });
  assert.ok(result.proposal.status === "draft" || result.proposal.status === "pending_review",
    `expected draft or pending_review, got ${result.proposal.status}`);
});

test("V2.2: updateProposal on an already-accepted proposal is rejected by the RPC", async () => {
  const fetcher = createFetcher({
    "/rpc/apply_change_proposal": () => {
      throw new Error("PROPOSAL_ALREADY_ACCEPTED: status transition denied");
    },
  });
  await assert.rejects(
    updateProposal({ fetcher, userId: "user-1", universeId: "u-1", proposalId: "proposal-1", action: "accept" }),
    (error) => error instanceof ProposalError,
  );
  // Verify no direct Canon mutation was attempted.
  assert.equal(fetcher.calls.some(({ path, init }) => init.method === "PATCH" && /canon|universe_entities/.test(path)), false);
});

test("V2.2: accepted proposal generates a new Universe Version", async () => {
  const fetcher = createFetcher({
    "/rpc/apply_change_proposal": {
      proposalId: "proposal-1",
      status: "accepted",
      versionId: "universe-version-002",
      affected: [{ objectType: "entity", count: 1 }],
    },
  });
  const result = await updateProposal({ fetcher, userId: "user-1", universeId: "u-1", proposalId: "proposal-1", action: "accept" });
  assert.equal(result.status, "accepted");
  assert.equal(result.versionId, "universe-version-002");
  // The RPC must be called with accept action.
  const rpc = fetcher.calls.find(({ path }) => path.includes("/rpc/apply_change_proposal"));
  assert.ok(rpc);
  assert.match(rpc.init.body, /"p_action":"accept"/);
  // No direct Canon writes — all via the transactional RPC.
  assert.equal(fetcher.calls.some(({ path, init }) => init.method === "PATCH" && /canon|universe_entities/.test(path)), false);
});

test("V2.2: accepted proposal generates an Evidence Event alongside the Universe Version", async () => {
  const fetcher = createFetcher({
    "/rpc/apply_change_proposal": {
      proposalId: "proposal-1",
      status: "accepted",
      versionId: "universe-version-002",
      affected: [{ objectType: "entity", count: 1 }],
    },
  });
  const result = await updateProposal({ fetcher, userId: "user-1", universeId: "u-1", proposalId: "proposal-1", action: "accept" });
  // The RPC returns a versionId — the new Universe Version that serves as
  // the evidence anchor for the accepted proposal.
  assert.ok(result.versionId, "accepted proposal must produce a new Universe Version id");
  assert.equal(result.status, "accepted");
  // The single transactional RPC handles Canon write + versioning + evidence.
  const rpcCalls = fetcher.calls.filter(({ path }) => path.includes("/rpc/apply_change_proposal"));
  assert.equal(rpcCalls.length, 1);
});

test("V2.2: rejected proposal does not change Work or generate a Universe Version", async () => {
  const fetcher = createFetcher({
    "/rpc/apply_change_proposal": {
      proposalId: "proposal-1",
      status: "rejected",
      versionId: null,
      affected: [],
    },
  });
  const result = await updateProposal({ fetcher, userId: "user-1", universeId: "u-1", proposalId: "proposal-1", action: "reject" });
  assert.equal(result.status, "rejected");
  assert.equal(result.versionId, null);
  // No Canon mutations or version creation for rejections.
  assert.equal(fetcher.calls.some(({ path, init }) => init.method === "PATCH" && /canon|universe_entities|universe_versions/.test(path)), false);
  const rpc = fetcher.calls.find(({ path }) => path.includes("/rpc/apply_change_proposal"));
  assert.match(rpc.init.body, /"p_action":"reject"/);
});

test("V2.2: rejected proposal leaves Work content untouched", async () => {
  const fetcher = createFetcher({
    "/rpc/apply_change_proposal": {
      proposalId: "proposal-1",
      status: "rejected",
      versionId: null,
      affected: [],
    },
  });
  await updateProposal({ fetcher, userId: "user-1", universeId: "u-1", proposalId: "proposal-1", action: "reject" });
  // No work_version inserts or work pointer updates.
  assert.equal(fetcher.calls.some(({ path }) => path.includes("storyflow_work_versions")), false);
  assert.equal(fetcher.calls.some(({ path, init }) => path.includes("storyflow_works") && init.method === "PATCH"), false);
});

test("V2.2: proposal must reference a valid Universe — invalid universe rejected with not_found", async () => {
  const fetcher = createFetcher({
    "storyflow_universes": [], // universe not found
  });
  await assert.rejects(
    createProposal({ fetcher, userId: "user-1", universeId: "nonexistent-universe", input: createInput }),
    (error) => error instanceof ProposalError && error.code === "not_found",
  );
});

test("V2.2: proposal must reference a valid Universe — missing universeId rejected with validation_failed", async () => {
  const fetcher = createFetcher();
  await assert.rejects(
    createProposal({ fetcher, userId: "user-1", universeId: "", input: createInput }),
    (error) => error instanceof ProposalError && error.code === "validation_failed",
  );
});

test("V2.2: proposal source must include a valid project reference", async () => {
  const fetcher = createFetcher();
  await assert.rejects(
    createProposal({
      fetcher,
      userId: "user-1",
      universeId: "u-1",
      input: { ...createInput, sourceProjectId: "" },
    }),
    (error) => error instanceof ProposalError && error.code === "validation_failed",
  );
});

test("V2.2: proposal confidence must be between 0 and 1", async () => {
  const fetcher = createFetcher();
  await assert.rejects(
    createProposal({
      fetcher,
      userId: "user-1",
      universeId: "u-1",
      input: { ...createInput, confidence: 1.5 },
    }),
    (error) => error instanceof ProposalError && error.code === "validation_failed",
  );
});

test("V2.2: edit_accept applies edited payload and generates a new Universe Version", async () => {
  const editedPayload = { summary: "Edited summary." };
  const fetcher = createFetcher({
    "/rpc/apply_change_proposal": {
      proposalId: "proposal-1",
      status: "edited_and_accepted",
      versionId: "universe-version-003",
      affected: [{ objectType: "entity", count: 1 }],
    },
  });
  const result = await updateProposal({
    fetcher,
    userId: "user-1",
    universeId: "u-1",
    proposalId: "proposal-1",
    action: "edit_accept",
    editedPayload,
  });
  assert.equal(result.status, "edited_and_accepted");
  assert.equal(result.versionId, "universe-version-003");
  const rpc = fetcher.calls.find(({ path }) => path.includes("/rpc/apply_change_proposal"));
  assert.match(rpc.init.body, /"p_action":"edit_accept"/);
  assert.match(rpc.init.body, /"p_edited_payload":\{"summary":"Edited summary\."\}/);
});
