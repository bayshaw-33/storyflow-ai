import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { generateContentId } from "../lib/exports/content-id.ts";

const root = new URL("../", import.meta.url);
const complianceRoute = readFileSync(new URL("app/api/compliance/export/route.ts", root), "utf8");
const jobsRoute = readFileSync(new URL("app/api/production/jobs/route.ts", root), "utf8");
const jobsHook = readFileSync(new URL("lib/production/hooks.ts", root), "utf8");
const hardeningMigration = readFileSync(
  new URL("supabase/migrations/20260718030000_harden_compliance_trust_boundaries.sql", root),
  "utf8",
);

test("formal export route never reads client-submitted trusted facts", () => {
  for (const field of [
    "jurisdictionProfile",
    "aiGenerated",
    "aiModified",
    "providerCode",
    "contentId",
    "modelProvider",
    "modelName",
    "modelVersion",
    "projectId",
    "episodeId",
    "syntheticVoice",
    "voiceLicenseStatus",
    "referenceRightsStatus",
  ]) {
    assert.doesNotMatch(complianceRoute, new RegExp(`(?:text|bool|optional)Field\\(form, ["']${field}["']\\)`));
  }
  assert.match(complianceRoute, /serverContentId\(inputBytes\)/);
});

test("authenticated clients cannot submit trusted job completion fields", () => {
  assert.doesNotMatch(jobsRoute, /handleUpdate/);
  assert.doesNotMatch(jobsHook, /updateJob:/);
});

test("Export Request content ID requires a server-computed SHA-256", () => {
  const payloadHash = "ab".repeat(32);
  const seed = { exportType: "json", sourceKind: "project_json", providerCode: "KIIKIS", payloadHash };
  assert.equal(generateContentId(seed), `cid_${payloadHash}`);
  assert.throws(() => generateContentId({ ...seed, payloadHash: "client-value" }), /CONTENT_ID_SOURCE_HASH_REQUIRED/);
});

test("RLS hardening makes trusted tables service-write only", () => {
  for (const table of [
    "storyflow_generation_jobs",
    "storyflow_compliance_profiles",
    "storyflow_ai_label_records",
    "storyflow_export_compliance_runs",
    "storyflow_exports",
  ]) {
    assert.match(
      hardeningMigration,
      new RegExp(`REVOKE INSERT, UPDATE, DELETE ON public\\.${table} FROM authenticated;`),
    );
  }
  assert.match(hardeningMigration, /TO authenticated\s+USING \(owner_id = \(SELECT auth\.uid\(\)\)\)/);
});
