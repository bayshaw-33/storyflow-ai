import assert from "node:assert/strict";
import test from "node:test";

const { CanonError, runCanonCheck, readCanonImpact, listStaleSnapshots } = await import("../../../lib/server/v2/canon/index.ts");

const universe = { id: "u-1", user_id: "user-1", team_id: null, name: "Glass Sea", updated_at: "2026-08-12T00:00:00Z" };
const facts = [
  { id: "fact-1", universe_id: "u-1", fact_text: "Mara is an engineer.", category: "character", importance: "critical", status: "canon", is_locked: true },
  { id: "fact-2", universe_id: "u-1", fact_text: "The harbor floods at dusk.", category: "timeline", importance: "medium", status: "canon", is_locked: true },
];

function createFetcher(overrides = {}) {
  const calls = [];
  const fetcher = async (path) => {
    calls.push(path);
    for (const [needle, value] of Object.entries(overrides)) {
      if (path.includes(needle)) return typeof value === "function" ? value(path) : value;
    }
    if (path.includes("storyflow_universes")) return [universe];
    if (path.includes("storyflow_canon_facts")) return facts;
    if (path.includes("storyflow_universe_entities")) return [{ id: "entity-1", universe_id: "u-1", type: "character", name: "Mara", summary: "Engineer", details_json: {}, status: "canon", updated_at: universe.updated_at }];
    if (path.includes("storyflow_universe_project_links")) return [{ id: "link-1", universe_id: "u-1", project_id: "project-1", updated_at: universe.updated_at }];
    if (path.includes("storyflow_projects")) return [{ id: "project-1", title: "Episode One", updated_at: universe.updated_at }];
    if (path.includes("storyflow_universe_inheritance_snapshots")) return [{ id: "snapshot-1", project_id: "project-1", universe_id: "u-1", universe_version: "2026-08-11T00:00:00Z", payload: { entities: [{ id: "entity-1" }] }, created_at: "2026-08-11T00:00:00Z" }];
    if (path.includes("storyflow_characters")) return [{ id: "character-1", project_id: "project-1", name: "Mara" }];
    if (path.includes("storyflow_scenes")) return [{ id: "scene-1", project_id: "project-1", location: "Harbor" }];
    if (path.includes("storyflow_production_projects")) return [{ id: "production-1", project_id: "project-1", title: "Storyboard" }];
    if (path.includes("storyflow_production_shots")) return [{ id: "shot-1", production_project_id: "production-1", scene_title: "Flood" }];
    if (path.includes("storyflow_assets")) return [{ id: "asset-1", project_id: "project-1", asset_type: "character" }];
    if (path.includes("storyflow_art_assets")) return [{ id: "art-1", project_id: "project-1", kind: "scene" }];
    throw new Error(`unexpected query: ${path}`);
  };
  fetcher.calls = calls;
  return fetcher;
}

test("Canon Check returns sourceable issues across required categories without a fixed score", async () => {
  const result = await runCanonCheck({ fetcher: createFetcher(), userId: "user-1", universeId: "u-1", input: { trigger: "script_finalized", target: { id: "target-1", text: "Mara is a doctor.", category: "character" } } });
  assert.equal("score" in result, false);
  assert.ok(result.issues.length > 0);
  assert.ok(result.issues.every((issue) => issue.target && issue.relatedCanon && issue.remediation));
  assert.equal(result.trigger, "script_finalized");
});

test("AI mode fails explicitly when no AI provider is configured", async () => {
  await assert.rejects(runCanonCheck({ fetcher: createFetcher(), userId: "user-1", universeId: "u-1", input: { mode: "ai", target: { text: "Mara is an engineer." } } }), (error) => error instanceof CanonError && error.code === "ai_unavailable");
});

test("impact analysis includes works, snapshots, characters, scenes, storyboards, and assets", async () => {
  const result = await readCanonImpact({ fetcher: createFetcher(), userId: "user-1", universeId: "u-1", entityId: "entity-1" });
  assert.equal(result.entityId, "entity-1");
  for (const dimension of ["works", "snapshots", "characters", "scenes", "storyboards", "assets"]) assert.ok(Array.isArray(result[dimension]));
  assert.equal(result.works[0].id, "project-1");
  assert.equal(result.snapshots[0].stale, true);
});

test("stale snapshot detection is read-only and reports the current Universe version", async () => {
  const fetcher = createFetcher();
  const result = await listStaleSnapshots({ fetcher, userId: "user-1", universeId: "u-1" });
  assert.equal(result.currentUniverseUpdatedAt, universe.updated_at);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].snapshotId, "snapshot-1");
  assert.equal(fetcher.calls.some((path) => path.includes("storyflow_canon_facts") && path.includes("PATCH")), false);
});
