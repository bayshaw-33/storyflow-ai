import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260717152816_storyboard_stable_state.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/migrations/rollback/20260717152816_storyboard_stable_state.sql", import.meta.url),
  "utf8",
);

test("stable storyboard migration scopes the RPC and uses revision/CAS", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.save_storyboard_state/);
  assert.match(migration, /p_expected_revision integer/);
  assert.match(migration, /REVISION_CONFLICT:%/);
  assert.match(migration, /owner_id = p_owner_id/);
  assert.match(migration, /source_unit_id = p_source_unit_id/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.save_storyboard_state[\s\S]*TO service_role/);
});

test("deleting a scene tombstones its shots without deleting other scenes", () => {
  assert.match(
    migration,
    /UPDATE public\.storyflow_production_shots\s+SET deleted_at = now\(\)[\s\S]*scene_id IN \(\s*SELECT id FROM public\.storyflow_production_scenes/,
  );
});

test("rollback is non-destructive for creator data", () => {
  assert.doesNotMatch(rollback, /DROP TABLE|DROP COLUMN|DELETE FROM/i);
});
