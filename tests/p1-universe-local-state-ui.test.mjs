import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../components/v2/community/UniverseCommunityPage.tsx", import.meta.url), "utf8");
const entities = readFileSync(new URL("../components/v2/community/UniverseEntitiesSection.tsx", import.meta.url), "utf8");

test("Universe object cards expose owner-only Work local override actions", () => {
  assert.match(entities, /onEditLocalOverride/);
  assert.match(entities, /onProposeLocalOverride/);
  assert.match(entities, /isOwner/);
});

test("Universe page saves local overrides through the owner-scoped API with revision CAS", () => {
  assert.match(page, /\/api\/v2\/works\/\$\{encodeURIComponent\(selectedWorkId\)\}\/local-states/);
  assert.match(page, /expectedRevision/);
  assert.match(page, /method: existingOverlay \? "PATCH" : "POST"/);
});

test("Canon promotion uses an explicit confirmation and proposal endpoint", () => {
  assert.match(page, /不会直接修改 Canon/);
  assert.match(page, /local-states\/\$\{encodeURIComponent\(overlay\.id\)\}\/propose/);
  assert.match(page, /pending_review|等待 Universe Inbox 审核/);
});
