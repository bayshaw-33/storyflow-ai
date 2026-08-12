import assert from "node:assert/strict";
import test from "node:test";

const contracts = await import("../../lib/contracts/v2/index.ts");

test("freezes the alpha contract version", () => {
  assert.equal(contracts.CONTRACT_VERSION, "2.0.0-alpha.1");
  assert.doesNotThrow(() => contracts.assertContractVersion("2.0.0-alpha.1"));
  assert.throws(() => contracts.assertContractVersion("2.0.0-alpha.2"), /invalid_contract_version/);
});

test("contains the lifecycle states from the PRD", () => {
  assert.deepEqual(contracts.CHANGE_PROPOSAL_STATUSES, [
    "draft", "pending_review", "accepted", "edited_and_accepted", "rejected", "deferred",
  ]);
  assert.deepEqual(contracts.GENERATION_JOB_STATUSES, [
    "draft", "pending_confirm", "queued", "running", "result_ingesting", "completed",
    "partial_failure", "failed", "cancelled",
  ]);
  assert.deepEqual(contracts.ASSET_STATUSES, ["draft", "ready", "published", "suspended", "archived"]);
  assert.deepEqual(contracts.USAGE_GRANT_STATUSES, [
    "pending", "active", "expired", "revoked_for_new_use", "cancelled", "disputed",
  ]);
});

test("exposes stable error codes for API consumers", () => {
  assert.deepEqual(contracts.V2_ERROR_CODES, [
    "unauthenticated", "forbidden", "not_found", "conflict", "validation_failed",
    "service_unavailable", "provider_degraded", "invalid_contract_version",
  ]);
});

test("provides normal, empty, and error fixtures for each core object", async () => {
  const fixtures = await import("../../tests/fixtures/kiikis-v2/index.ts");
  for (const objectName of [
    "universe", "universeEntity", "canonFact", "relationship", "timelineEvent", "project", "inheritanceSnapshot", "changeProposal", "asset", "assetVersion",
    "generationJob", "modelDecision", "actor", "character", "portrayal", "licenseOffer",
    "usageGrant", "evidenceEvent",
  ]) {
    assert.ok(fixtures.normal[objectName], `${objectName} normal fixture is missing`);
    assert.ok(objectName in fixtures.empty, `${objectName} empty fixture is missing`);
    assert.ok(objectName in fixtures.errors, `${objectName} error fixture is missing`);
  }
});
