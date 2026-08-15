/**
 * Phase 4 Task 4.5 — Source Work revisions (v2) & rights.
 *
 * Verifies:
 *   - Source Work is read-only: no edit/overwrite ops exposed
 *   - a revised file creates Source Version v2 (never overwrites v1)
 *   - v2 re-extraction produces an Universe Upgrade Proposal; U1 unchanged
 *
 * Run: node --test tests/server-v2/universe-import/revisions.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createSourceVersion,
  buildUpgradeProposal,
  sourceWorkIsReadOnly,
} from "../../../lib/server/v2/universe-import/finalize.ts";

const OWNER = "owner-001";

function makeRows() {
  return {
    works: [{ id: "work-src", owner_id: OWNER, work_type: "source", project_id: null, is_primary: false }],
    sourceWorks: [{ work_id: "work-src", owner_id: OWNER, title: "原作", rights_state: "private" }],
    sourceVersions: [
      { id: "sv-1", source_work_id: "work-src", version_no: 1, file_hashes: ["h1"], rights_declaration: { basis: "own_work" }, manifest: { hash: "h1" }, created_by: OWNER, created_at: "2026-08-15T00:00:00Z" },
    ],
    upgradeProposals: [],
  };
}

test("source work exposes no edit/overwrite surface", () => {
  assert.equal(sourceWorkIsReadOnly(), true);
});

test("revised file creates Source Version v2; v1 untouched", () => {
  const rows = makeRows();
  const v2 = createSourceVersion(rows, {
    sourceWorkId: "work-src",
    fileHashes: ["h2"],
    rightsDeclaration: { basis: "own_work" },
    manifest: { hash: "h2" },
    createdBy: OWNER,
  });
  assert.equal(v2.versionNo, 2);
  assert.equal(rows.sourceVersions.length, 2);
  assert.equal(rows.sourceVersions[0].file_hashes[0], "h1", "v1 untouched");
  // v3 follows
  const v3 = createSourceVersion(rows, {
    sourceWorkId: "work-src",
    fileHashes: ["h3"],
    rightsDeclaration: { basis: "own_work" },
    manifest: { hash: "h3" },
    createdBy: OWNER,
  });
  assert.equal(v3.versionNo, 3);
});

test("identical hash cannot create a new version (re-upload is not a revision)", () => {
  const rows = makeRows();
  assert.throws(
    () =>
      createSourceVersion(rows, {
        sourceWorkId: "work-src",
        fileHashes: ["h1"],
        rightsDeclaration: { basis: "own_work" },
        manifest: { hash: "h1" },
        createdBy: OWNER,
      }),
    /相同|identical|conflict/i,
  );
});

test("v2 builds an Upgrade Proposal; U1 pointer unchanged until user publishes U2", () => {
  const rows = makeRows();
  const v2 = createSourceVersion(rows, {
    sourceWorkId: "work-src",
    fileHashes: ["h2"],
    rightsDeclaration: { basis: "own_work" },
    manifest: { hash: "h2" },
    createdBy: OWNER,
  });
  const proposal = buildUpgradeProposal(rows, {
    universeId: "universe-1",
    currentUniverseVersionId: "uv-1",
    sourceVersion: v2,
    ownerId: OWNER,
  });
  assert.equal(proposal.kind, "universe_upgrade");
  assert.equal(proposal.fromVersionId, "uv-1");
  assert.equal(proposal.sourceVersionId, v2.id);
  assert.equal(proposal.status, "pending_review");
  // U1 pointer untouched: no version row added to universe versions here
  assert.equal(rows.upgradeProposals.length, 1);
});
