import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/20260719000000_evidence_ledger.sql", import.meta.url);

test("evidence ledger migration enforces append-only, scoped server writes", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.storyflow_evidence_cases/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.storyflow_evidence_events/i);
  assert.match(sql, /UNIQUE \(case_id, sequence_number\)/i);
  assert.match(sql, /UNIQUE \(case_id, idempotency_key\)/i);
  assert.match(sql, /ALTER TABLE public\.storyflow_evidence_events ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.storyflow_evidence_events FROM authenticated/i);
  assert.match(sql, /evidence_events_immutable/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.append_evidence_event/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.append_evidence_event[\s\S]*TO service_role/i);
});
