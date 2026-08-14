/**
 * Phase 1 Task 1.1 — Work History contracts RED→GREEN.
 *
 * Verifies:
 *   - KIIKIS_22_CONTRACT_VERSION = "2.2.0-alpha.1"
 *   - Legacy CONTRACT_VERSION in index.ts remains "2.0.0-alpha.1"
 *   - WorkVersionV22 parser rejects: empty workId, illegal kind, missing hash,
 *     finalized without provenance
 *   - ConversationMessageV22 parser rejects: illegal role, missing idempotencyKey
 *   - GenerationRequestSnapshotV22 parser rejects: illegal operation
 *   - GenerationCandidateV22 parser rejects: illegal status, applied without
 *     appliedVersionId
 *   - Type guards return false for invalid input without throwing
 *
 * Run: node --test tests/contracts-v22/work-history.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  KIIKIS_22_CONTRACT_VERSION,
  WORK_VERSION_KINDS,
  WORK_VERSION_SOURCES,
  CONVERSATION_ROLES,
  GENERATION_OPERATIONS,
  CANDIDATE_STATUSES,
  WorkHistoryContractError,
  assertWorkVersion,
  isWorkVersion,
  assertConversationMessage,
  assertGenerationRequest,
  assertGenerationCandidate,
  assertKiikis22ContractVersion,
} from "../../lib/contracts/v2/work-history.ts";

import { CONTRACT_VERSION } from "../../lib/contracts/v2/index.ts";

// ============================================================
// 1. Contract version constants
// ============================================================

test("KIIKIS_22_CONTRACT_VERSION = 2.2.0-alpha.1", () => {
  assert.equal(KIIKIS_22_CONTRACT_VERSION, "2.2.0-alpha.1");
});

test("legacy CONTRACT_VERSION in index.ts remains 2.0.0-alpha.1 (additive)", () => {
  assert.equal(CONTRACT_VERSION, "2.0.0-alpha.1");
});

test("assertKiikis22ContractVersion accepts 2.2.0-alpha.1, rejects others", () => {
  assert.doesNotThrow(() => assertKiikis22ContractVersion("2.2.0-alpha.1"));
  assert.throws(
    () => assertKiikis22ContractVersion("2.0.0-alpha.1"),
    (err) => err instanceof WorkHistoryContractError && err.code === "invalid_contract_version",
  );
  assert.throws(
    () => assertKiikis22ContractVersion("3.0.0"),
    (err) => err instanceof WorkHistoryContractError && err.code === "invalid_contract_version",
  );
});

// ============================================================
// 2. WorkVersionV22 parser
// ============================================================

function makeValidVersion(overrides = {}) {
  return {
    id: "ver-001",
    workId: "work-001",
    parentVersionId: null,
    kind: "editing_draft",
    contentSchema: "kiikis.script/1",
    content: { scenes: [] },
    contentHash: "a".repeat(64),
    source: "manual",
    sourceMessageIds: [],
    sourceJobId: null,
    createdAt: "2026-08-14T10:00:00+08:00",
    ...overrides,
  };
}

test("assertWorkVersion: valid editing_draft accepted", () => {
  const v = makeValidVersion();
  assert.doesNotThrow(() => assertWorkVersion(v));
});

test("assertWorkVersion: valid checkpoint accepted", () => {
  const v = makeValidVersion({ kind: "checkpoint" });
  assert.doesNotThrow(() => assertWorkVersion(v));
});

test("assertWorkVersion: valid finalized with sourceMessageIds accepted", () => {
  const v = makeValidVersion({
    kind: "finalized",
    source: "ai",
    sourceMessageIds: ["msg-001"],
  });
  assert.doesNotThrow(() => assertWorkVersion(v));
});

test("assertWorkVersion: valid finalized with sourceJobId accepted", () => {
  const v = makeValidVersion({
    kind: "finalized",
    source: "ai",
    sourceJobId: "job-001",
  });
  assert.doesNotThrow(() => assertWorkVersion(v));
});

test("assertWorkVersion: rejects empty workId", () => {
  const v = makeValidVersion({ workId: "" });
  assert.throws(() => assertWorkVersion(v), /workId must be non-empty/);
});

test("assertWorkVersion: rejects illegal kind", () => {
  const v = makeValidVersion({ kind: "draft" });
  assert.throws(() => assertWorkVersion(v), /Unsupported kind/);
});

test("assertWorkVersion: rejects missing contentHash", () => {
  const v = makeValidVersion({ contentHash: "" });
  assert.throws(() => assertWorkVersion(v), /contentHash must be non-empty/);
});

test("assertWorkVersion: rejects finalized without provenance (no sourceMessageIds, no sourceJobId)", () => {
  const v = makeValidVersion({ kind: "finalized", source: "manual" });
  assert.throws(
    () => assertWorkVersion(v),
    /finalized version requires provenance/,
  );
});

test("assertWorkVersion: rejects invalid createdAt", () => {
  const v = makeValidVersion({ createdAt: "not-a-date" });
  assert.throws(() => assertWorkVersion(v), /createdAt must be a valid ISO string/);
});

test("assertWorkVersion: rejects non-array sourceMessageIds", () => {
  const v = makeValidVersion({ sourceMessageIds: "msg-001" });
  assert.throws(() => assertWorkVersion(v), /sourceMessageIds must be string\[\]/);
});

test("isWorkVersion: returns false for invalid input without throwing", () => {
  assert.equal(isWorkVersion(null), false);
  assert.equal(isWorkVersion({}), false);
  assert.equal(isWorkVersion(makeValidVersion({ workId: "" })), false);
  assert.equal(isWorkVersion(makeValidVersion()), true);
});

test("WORK_VERSION_KINDS contains editing_draft, checkpoint, finalized", () => {
  assert.deepEqual([...WORK_VERSION_KINDS], ["editing_draft", "checkpoint", "finalized"]);
});

test("WORK_VERSION_SOURCES contains manual, ai, import, restore", () => {
  assert.deepEqual([...WORK_VERSION_SOURCES], ["manual", "ai", "import", "restore"]);
});

// ============================================================
// 3. ConversationMessageV22 parser
// ============================================================

function makeValidMessage(overrides = {}) {
  return {
    id: "msg-001",
    workId: "work-001",
    threadId: "thread-001",
    role: "user",
    content: "Hello",
    baseVersionId: null,
    idempotencyKey: "idem-001",
    createdAt: "2026-08-14T10:00:00+08:00",
    ...overrides,
  };
}

test("assertConversationMessage: valid user message accepted", () => {
  assert.doesNotThrow(() => assertConversationMessage(makeValidMessage()));
});

test("assertConversationMessage: valid assistant message accepted", () => {
  assert.doesNotThrow(() =>
    assertConversationMessage(makeValidMessage({ role: "assistant" })),
  );
});

test("assertConversationMessage: rejects illegal role", () => {
  assert.throws(
    () => assertConversationMessage(makeValidMessage({ role: "bot" })),
    /Unsupported role/,
  );
});

test("assertConversationMessage: rejects missing idempotencyKey", () => {
  assert.throws(
    () => assertConversationMessage(makeValidMessage({ idempotencyKey: "" })),
    /idempotencyKey must be non-empty/,
  );
});

test("CONVERSATION_ROLES contains user, assistant, system", () => {
  assert.deepEqual([...CONVERSATION_ROLES], ["user", "assistant", "system"]);
});

// ============================================================
// 4. GenerationRequestSnapshotV22 parser
// ============================================================

function makeValidRequest(overrides = {}) {
  return {
    id: "req-001",
    workId: "work-001",
    baseVersionId: "ver-001",
    messageIds: ["msg-001"],
    contextPacketId: null,
    operation: "discuss",
    idempotencyKey: "idem-001",
    createdAt: "2026-08-14T10:00:00+08:00",
    ...overrides,
  };
}

test("assertGenerationRequest: valid discuss accepted", () => {
  assert.doesNotThrow(() => assertGenerationRequest(makeValidRequest()));
});

test("assertGenerationRequest: valid generate accepted", () => {
  assert.doesNotThrow(() =>
    assertGenerationRequest(makeValidRequest({ operation: "generate" })),
  );
});

test("assertGenerationRequest: rejects illegal operation", () => {
  assert.throws(
    () => assertGenerationRequest(makeValidRequest({ operation: "translate" })),
    /Unsupported operation/,
  );
});

test("assertGenerationRequest: rejects empty baseVersionId", () => {
  assert.throws(
    () => assertGenerationRequest(makeValidRequest({ baseVersionId: "" })),
    /baseVersionId must be non-empty/,
  );
});

test("GENERATION_OPERATIONS contains discuss, propose_change, generate, update", () => {
  assert.deepEqual([...GENERATION_OPERATIONS], ["discuss", "propose_change", "generate", "update"]);
});

// ============================================================
// 5. GenerationCandidateV22 parser
// ============================================================

function makeValidCandidate(overrides = {}) {
  return {
    id: "cand-001",
    requestId: "req-001",
    workId: "work-001",
    status: "ready",
    content: { scenes: [] },
    contentHash: "b".repeat(64),
    appliedVersionId: null,
    createdAt: "2026-08-14T10:00:00+08:00",
    appliedAt: null,
    ...overrides,
  };
}

test("assertGenerationCandidate: valid ready accepted", () => {
  assert.doesNotThrow(() => assertGenerationCandidate(makeValidCandidate()));
});

test("assertGenerationCandidate: valid applied with appliedVersionId accepted", () => {
  assert.doesNotThrow(() =>
    assertGenerationCandidate(
      makeValidCandidate({
        status: "applied",
        appliedVersionId: "ver-002",
        appliedAt: "2026-08-14T11:00:00+08:00",
      }),
    ),
  );
});

test("assertGenerationCandidate: rejects illegal status", () => {
  assert.throws(
    () => assertGenerationCandidate(makeValidCandidate({ status: "pending" })),
    /Unsupported status/,
  );
});

test("assertGenerationCandidate: rejects applied without appliedVersionId", () => {
  assert.throws(
    () => assertGenerationCandidate(makeValidCandidate({ status: "applied" })),
    /applied candidate must have appliedVersionId/,
  );
});

test("assertGenerationCandidate: rejects applied without appliedAt", () => {
  assert.throws(
    () =>
      assertGenerationCandidate(
        makeValidCandidate({
          status: "applied",
          appliedVersionId: "ver-002",
          appliedAt: null,
        }),
      ),
    /applied candidate must have valid appliedAt/,
  );
});

test("CANDIDATE_STATUSES contains ready, applied, rejected, superseded", () => {
  assert.deepEqual([...CANDIDATE_STATUSES], ["ready", "applied", "rejected", "superseded"]);
});

// ============================================================
// 6. WorkHistoryContractError shape
// ============================================================

test("WorkHistoryContractError: code and field preserved", () => {
  const err = new WorkHistoryContractError("validation_failed", "bad input", "workId");
  assert.equal(err.name, "WorkHistoryContractError");
  assert.equal(err.code, "validation_failed");
  assert.equal(err.field, "workId");
  assert.match(err.message, /bad input/);
});

test("WorkHistoryContractError: immutable_violation code supported", () => {
  const err = new WorkHistoryContractError("immutable_violation", "cannot update finalized");
  assert.equal(err.code, "immutable_violation");
});

test("WorkHistoryContractError: state_transition_denied code supported", () => {
  const err = new WorkHistoryContractError("state_transition_denied", "ready → ready not allowed");
  assert.equal(err.code, "state_transition_denied");
});
