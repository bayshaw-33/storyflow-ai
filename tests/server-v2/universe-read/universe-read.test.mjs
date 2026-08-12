import assert from "node:assert/strict";
import test from "node:test";

const {
  V2UniverseError,
  listUniverses,
  readUniverse,
  readUniverseEntities,
  readUniverseWorks,
  readUniverseHealth,
  toUniverseDto,
} = await import("../../../lib/server/v2/universe/index.ts");

const universeRow = {
  id: "u-1",
  name: "The Glass Sea",
  description: "A drowned city.",
  card_summary: "A drowned city.",
  status: "active",
  updated_at: "2026-08-12T00:00:00Z",
  user_id: "user-1",
  team_id: "team-1",
  metadata: { tags: ["fantasy"] },
  genre: "fantasy",
};

function createFetcher(overrides = {}) {
  const calls = [];
  const fetcher = async (path) => {
    calls.push(path);
    for (const [needle, value] of Object.entries(overrides)) {
      if (path.includes(needle)) return typeof value === "function" ? value(path) : value;
    }
    if (path.includes("storyflow_team_members")) return [{ team_id: "team-1", role: "editor" }];
    if (path.includes("storyflow_universes")) return [universeRow];
    if (path.includes("storyflow_universe_entities")) return [
      { id: "e-1", universe_id: "u-1", type: "character", name: "Mara", summary: "Engineer", status: "canon", updated_at: universeRow.updated_at },
      { id: "e-2", universe_id: "u-1", type: "location", name: "Harbor", summary: "A flooded harbor", status: "draft", updated_at: universeRow.updated_at },
    ];
    if (path.includes("storyflow_universe_inbox_items")) return [{ id: "inbox-1", universe_id: "u-1", status: "pending", item_type: "character", title: "New character", confidence: 0.8, updated_at: universeRow.updated_at }];
    if (path.includes("storyflow_universe_project_links")) return [{ id: "link-1", universe_id: "u-1", project_id: "p-1", project_role: "main_season", updated_at: universeRow.updated_at }];
    if (path.includes("storyflow_projects")) return [{ id: "p-1", title: "Episode One", workflow_type: "script", status: "draft", updated_at: universeRow.updated_at }];
    if (path.includes("storyflow_canon_facts")) return [{ id: "fact-1", universe_id: "u-1", is_locked: true }];
    if (path.includes("storyflow_universe_relationships")) return [{ id: "r-1", universe_id: "u-1" }];
    if (path.includes("storyflow_universe_timeline_events")) return [{ id: "t-1", universe_id: "u-1" }];
    if (path.includes("storyflow_canon_check_reports")) return [{ id: "report-1", universe_id: "u-1", issues_json: [{ severity: "critical" }] }];
    throw new Error(`unexpected query: ${path}`);
  };
  fetcher.calls = calls;
  return fetcher;
}

test("toUniverseDto excludes database ownership, metadata, and storage fields", () => {
  const dto = toUniverseDto(universeRow);
  assert.deepEqual(dto, {
    id: "u-1",
    name: "The Glass Sea",
    summary: "A drowned city.",
    status: "draft",
    visibility: "team",
    currentVersion: "legacy",
    updatedAt: "2026-08-12T00:00:00Z",
  });
  assert.doesNotMatch(JSON.stringify(dto), /user_id|team_id|metadata|storage_path|prompt|provider/i);
});

test("listUniverses reads cloud data and aggregates child counts without per-universe queries", async () => {
  const fetcher = createFetcher();
  const result = await listUniverses({ fetcher, userId: "user-1", search: "glass", limit: 20 });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].workCount, 1);
  assert.equal(result.items[0].characterCount, 1);
  assert.equal(result.items[0].locationCount, 1);
  assert.equal(result.items[0].pendingInboxCount, 1);
  assert.ok(fetcher.calls.some((path) => path.includes("storyflow_team_members")));
  assert.equal(fetcher.calls.filter((path) => path.includes("storyflow_universes")).length, 1);
  assert.doesNotMatch(JSON.stringify(result), /user_id|team_id|storage_path|prompt|provider/i);
});

test("empty Universe reads return an empty result, while unauthorized reads throw forbidden", async () => {
  const emptyFetcher = createFetcher({ storyflow_universes: [] });
  const empty = await listUniverses({ fetcher: emptyFetcher, userId: "user-1" });
  assert.deepEqual(empty.items, []);

  const forbiddenFetcher = createFetcher({ storyflow_universes: [{ ...universeRow, user_id: "other", team_id: null }] });
  await assert.rejects(
    readUniverse({ fetcher: forbiddenFetcher, userId: "user-1", universeId: "u-1" }),
    (error) => error instanceof V2UniverseError && error.code === "forbidden",
  );
});

test("detail, entities, works and health all expose v2-safe read models", async () => {
  const fetcher = createFetcher();
  const detail = await readUniverse({ fetcher, userId: "user-1", universeId: "u-1" });
  const entities = await readUniverseEntities({ fetcher, userId: "user-1", universeId: "u-1" });
  const works = await readUniverseWorks({ fetcher, userId: "user-1", universeId: "u-1" });
  const health = await readUniverseHealth({ fetcher, userId: "user-1", universeId: "u-1" });
  assert.equal(detail.universe.id, "u-1");
  assert.equal(entities.items[0].kind, "character");
  assert.equal(works.items[0].name, "Episode One");
  assert.equal(health.dimensions.length, 6);
  assert.ok(health.dimensions.every((dimension) => Array.isArray(dimension.todos)));
  assert.equal("score" in health, false);
  assert.doesNotMatch(JSON.stringify({ detail, entities, works, health }), /user_id|team_id|storage_path|prompt|provider/i);
});
