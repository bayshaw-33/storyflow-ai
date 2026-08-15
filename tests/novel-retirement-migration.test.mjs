import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260829000000_K22_retire_novel_data.sql", import.meta.url),
  "utf8",
);

test("novel retirement migration is scoped to explicit structured markers", () => {
  assert.match(migration, /p\.workflow_type = 'novel'/);
  assert.match(migration, /p\.data ->> 'contentType' = 'novel'/);
  assert.match(migration, /DELETE FROM public\.storyflow_projects AS p[\s\S]*p\.id IN \(SELECT id FROM _kiikis_retired_novel_projects\)/);
  assert.match(migration, /DISABLE TRIGGER evidence_events_immutable/);
  assert.match(migration, /DISABLE TRIGGER trg_block_delete_work_versions/);
  assert.match(migration, /storyflow_generations/);
  assert.match(migration, /storyflow_versions/);
  assert.match(migration, /preserved_universes/);
  assert.match(migration, /preserved_assets/);
  assert.doesNotMatch(migration, /DELETE FROM public\.storyflow_projects\s*;/);
  assert.doesNotMatch(migration, /ILIKE|title\s*=|description\s*=|content\s*=/i);
});

test("novel retirement migration blocks reintroduction without changing other defaults", () => {
  assert.match(migration, /storyflow_projects_no_novel_workflow_check/);
  assert.match(migration, /document_type SET DEFAULT 'script'/);
  assert.match(migration, /document_type IN \('worldbuilding', 'character_bible', 'outline', 'script', 'localization', 'director_notes'\)/);
});
