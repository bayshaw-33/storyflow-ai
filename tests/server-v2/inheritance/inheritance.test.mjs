import assert from "node:assert/strict";
import test from "node:test";

const {
  InheritanceError,
  bindUniverse,
  unbindUniverse,
  createInheritanceSnapshot,
  readInheritanceSnapshot,
  diffInheritanceSnapshot,
} = await import("../../../lib/server/v2/inheritance/index.ts");

const project = { id: "project-1", owner_id: "user-1", universe_id: null, title: "Episode One", updated_at: "2026-08-12T00:00:00Z" };
const universe = { id: "universe-1", user_id: "user-1", team_id: null, name: "The Glass Sea", updated_at: "2026-08-12T00:00:00Z" };
const link = { id: "link-1", universe_id: "universe-1", project_id: "project-1", user_id: "user-1", project_role: "main_season", inheritance_settings: {}, created_at: "2026-08-12T00:00:00Z", updated_at: "2026-08-12T00:00:00Z" };
const snapshot = { id: "snapshot-1", project_id: "project-1", universe_id: "universe-1", universe_version: "2026-08-12T00:00:00Z", payload: { entities: [{ id: "character-1", name: "Mara" }] }, created_at: "2026-08-12T00:00:00Z", updated_at: "2026-08-12T00:00:00Z" };

function createFetcher(overrides = {}) {
  const calls = [];
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    for (const [needle, value] of Object.entries(overrides)) {
      if (path.includes(needle)) return typeof value === "function" ? value(path, init) : value;
    }
    if (path.includes("storyflow_projects")) return [project];
    if (path.includes("storyflow_universes")) return [universe];
    if (path.includes("storyflow_universe_project_links")) return [link];
    if (path.includes("storyflow_universe_binding_history")) return [];
    if (path.includes("storyflow_universe_inheritance_snapshots")) return [snapshot];
    if (path.includes("storyflow_universe_entities")) return [{ id: "character-1", universe_id: "universe-1", type: "character", name: "Mara", summary: "Engineer", status: "canon", updated_at: universe.updated_at }];
    throw new Error(`unexpected query: ${path}`);
  };
  fetcher.calls = calls;
  return fetcher;
}

test("bindUniverse is idempotent and never creates a second primary link", async () => {
  const fetcher = createFetcher();
  const result = await bindUniverse({ fetcher, userId: "user-1", projectId: "project-1", universeId: "universe-1" });
  assert.equal(result.link.id, "link-1");
  assert.equal(result.created, false);
  assert.equal(fetcher.calls.filter(({ path }) => path.includes("storyflow_universe_project_links") && path.includes("project_id=eq")).length, 1);
});

test("bindUniverse rejects a project that already has another primary Universe", async () => {
  const fetcher = createFetcher({ storyflow_universe_project_links: [{ ...link, universe_id: "universe-2" }] });
  await assert.rejects(
    bindUniverse({ fetcher, userId: "user-1", projectId: "project-1", universeId: "universe-1" }),
    (error) => error instanceof InheritanceError && error.code === "conflict",
  );
});

test("new team binding requires active membership and records binding history", async () => {
  const fetcher = createFetcher({
    storyflow_universes: [{ ...universe, user_id: "team-owner", team_id: "team-1" }],
    storyflow_universe_project_links: (path, init) => init.method === "POST" ? [link] : [],
    storyflow_team_members: [{ team_id: "team-1" }],
  });
  const result = await bindUniverse({ fetcher, userId: "user-1", projectId: "project-1", universeId: "universe-1" });
  assert.equal(result.created, true);
  const membership = fetcher.calls.find(({ path }) => path.includes("storyflow_team_members"));
  const filters = new URL(membership.path, "https://database.test").searchParams;
  assert.equal(filters.get("team_id"), "eq.team-1");
  assert.equal(filters.get("user_id"), "eq.user-1");
  assert.equal(filters.get("status"), "eq.active");
  const history = fetcher.calls.find(({ path, init }) => path.includes("storyflow_universe_binding_history") && init.method === "POST");
  assert.ok(history);
  assert.deepEqual(JSON.parse(history.init.body), {
    project_id: "project-1", universe_id: "universe-1", user_id: "user-1",
    action: "bound", source_link_id: "link-1",
  });
});

test("team non-member is rejected before any link or history write", async () => {
  const fetcher = createFetcher({
    storyflow_universes: [{ ...universe, user_id: "team-owner", team_id: "team-1" }],
    storyflow_team_members: [],
  });
  await assert.rejects(
    bindUniverse({ fetcher, userId: "user-1", projectId: "project-1", universeId: "universe-1" }),
    (error) => error instanceof InheritanceError && error.code === "forbidden",
  );
  assert.equal(fetcher.calls.some(({ path }) => path.includes("storyflow_universe_project_links")), false);
  assert.equal(fetcher.calls.some(({ init }) => init.method === "POST"), false);
});

test("Universe owner does not need team membership for an existing binding", async () => {
  const fetcher = createFetcher({ storyflow_universes: [{ ...universe, team_id: "team-1" }] });
  const result = await bindUniverse({ fetcher, userId: "user-1", projectId: "project-1", universeId: "universe-1" });
  assert.equal(result.created, false);
  assert.equal(fetcher.calls.some(({ path }) => path.includes("storyflow_team_members")), false);
  assert.equal(fetcher.calls.some(({ init }) => init.method === "POST"), false);
});

test("membership lookup failure fails closed without writing a binding", async () => {
  const fetcher = createFetcher({
    storyflow_universes: [{ ...universe, user_id: "team-owner", team_id: "team-1" }],
    storyflow_team_members: () => { throw new Error("membership unavailable"); },
  });
  await assert.rejects(
    bindUniverse({ fetcher, userId: "user-1", projectId: "project-1", universeId: "universe-1" }),
    (error) => error instanceof InheritanceError && error.code === "service_unavailable",
  );
  assert.equal(fetcher.calls.some(({ init }) => init.method === "POST"), false);
});

test("createInheritanceSnapshot freezes the current Universe payload", async () => {
  const fetcher = createFetcher({ storyflow_universe_inheritance_snapshots: (path, init) => init.method === "POST" ? [snapshot] : [] });
  const result = await createInheritanceSnapshot({ fetcher, userId: "user-1", projectId: "project-1" });
  assert.equal(result.snapshot.id, "snapshot-1");
  const insert = fetcher.calls.find(({ path, init }) => path.includes("storyflow_universe_inheritance_snapshots") && init.method === "POST");
  assert.ok(insert);
  assert.match(insert.init.body, /character-1/);
});

test("read and diff expose field-level changes without replacing the project snapshot", async () => {
  const fetcher = createFetcher({
    storyflow_universe_inheritance_snapshots: [snapshot],
    storyflow_universe_entities: [
      { id: "character-1", universe_id: "universe-1", type: "character", name: "Mara Updated", summary: "Engineer", status: "canon", updated_at: "2026-08-13T00:00:00Z" },
      { id: "location-1", universe_id: "universe-1", type: "location", name: "Harbor", summary: "Flooded", status: "draft", updated_at: "2026-08-13T00:00:00Z" },
    ],
  });
  const current = await readInheritanceSnapshot({ fetcher, userId: "user-1", projectId: "project-1" });
  const diff = await diffInheritanceSnapshot({ fetcher, userId: "user-1", projectId: "project-1" });
  assert.equal(current.snapshot.id, "snapshot-1");
  assert.ok(diff.fields.some((field) => field.path.includes("character-1")));
  assert.ok(diff.fields.some((field) => field.path.includes("location-1")));
  assert.equal(diff.upgradeRequired, true);
});

test("unbind keeps historical link and snapshot records", async () => {
  const fetcher = createFetcher();
  const result = await unbindUniverse({ fetcher, userId: "user-1", projectId: "project-1" });
  assert.equal(result.unbound, true);
  const patch = fetcher.calls.find(({ path, init }) => path.includes("storyflow_universe_project_links") && init.method === "PATCH");
  assert.ok(patch);
  assert.match(patch.init.body, /unbound_at/);
  const history = fetcher.calls.find(({ path, init }) => path.includes("storyflow_universe_binding_history") && init.method === "POST");
  assert.ok(history);
  assert.match(history.init.body, /"action":"unbound"/);
});
