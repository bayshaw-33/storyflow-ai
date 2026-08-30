import assert from "node:assert/strict";
import { test } from "node:test";
import { readCommunityUniverse } from "../lib/server/v2/community/universe.ts";

const universe = {
  id: "u-1",
  user_id: "owner-1",
  team_id: null,
  name: "The Glass City",
  description: "A city that remembers every dream.",
  card_summary: "A city that remembers every dream.",
  genre: "speculative drama",
  default_language: "English",
  target_markets: ["Global"],
  tone: "melancholic",
  status: "active",
  metadata: { tags: ["memory", "city"] },
  updated_at: "2026-08-28T00:00:00Z",
};

const rows = {
  universe,
  publication: [{ id: "pub-u-1", source_version: "v2" }],
  projectPublications: [{ id: "pub-project-1", source_type: "project", source_id: "project-1", source_version: "work-v1" }],
  links: [{ id: "link-1", universe_id: "u-1", project_id: "project-1", project_role: "main_season", updated_at: universe.updated_at }],
  projects: [{ id: "project-1", title: "Glass City Season One", workflow_type: "script", status: "draft", owner_id: "owner-1", updated_at: universe.updated_at }],
  works: [{ id: "work-1", project_id: "project-1", work_type: "script", status: "draft", updated_at: universe.updated_at }],
  entities: [
    { id: "entity-1", universe_id: "u-1", type: "character", name: "Mara", summary: "A keeper of forgotten dreams.", status: "canon", updated_at: universe.updated_at },
    { id: "entity-2", universe_id: "u-1", type: "location", name: "The Archive", summary: "A draft location.", status: "draft", updated_at: universe.updated_at },
  ],
  versions: [
    { id: "version-2", version_no: 2, content_hash: "hash-2", created_at: universe.updated_at },
    { id: "version-1", version_no: 1, content_hash: "hash-1", created_at: "2026-08-27T00:00:00Z" },
  ],
  voices: [{ id: "voice-1", universe_entity_id: "entity-1", actor_profile_id: "actor-1", voice_label: "Mara voice", voice_provider: "gmi", language: "en", status: "ready", updated_at: universe.updated_at }],
  actors: [{ id: "actor-1", name: "Mara Actor", status: "ready", visibility: "private", updated_at: universe.updated_at }],
  actorPublications: [{ id: "pub-actor-1", source_type: "actor", source_id: "actor-1", source_version: "actor-v1" }],
  assets: [{ id: "asset-1", universe_entity_id: "entity-1", kind: "character", name: "Mara portrait", description: "Approved portrait.", status: "published", updated_at: universe.updated_at }],
  assetPublications: [{ id: "pub-asset-1", source_type: "asset", source_id: "asset-1", source_version: "asset-v1" }],
  timelines: [
    { id: "event-1", title: "The first memory", description: "Canon event.", date_label: "Day 1", status: "canon", is_canon: true, updated_at: universe.updated_at },
    { id: "event-2", title: "Possible ending", description: "Draft event.", date_label: "Later", status: "draft", is_canon: false, updated_at: universe.updated_at },
  ],
  overlays: [{ id: "overlay-1", work_id: "work-1", entity_type: "entity", entity_id: "entity-1", revision: 2, status: "active", updated_at: universe.updated_at }],
  candidates: [{ id: "candidate-1", item_type: "character", title: "New candidate", confidence: 0.76, status: "pending", updated_at: universe.updated_at }],
};

function createFetcher({ fail = [] } = {}) {
  const calls = [];
  const fetcher = async (path) => {
    calls.push(path);
    const source = fail.find((name) => path.includes(name));
    if (source) throw new Error(`missing optional source ${source}`);
    if (path.includes("storyflow_universes?")) return [rows.universe];
    if (path.includes("storyflow_publications?") && path.includes("source_type=eq.universe")) return rows.publication;
    if (path.includes("storyflow_universe_project_links")) return rows.links;
    if (path.includes("storyflow_projects?")) return rows.projects;
    if (path.includes("storyflow_works?")) return rows.works;
    if (path.includes("storyflow_universe_entities")) return rows.entities;
    if (path.includes("storyflow_universe_versions")) return rows.versions;
    if (path.includes("storyflow_character_voice_profiles")) return rows.voices;
    if (path.includes("storyflow_character_appearance_variants")) return [{ actor_id: "actor-1" }];
    if (path.includes("storyflow_actor_profiles")) return rows.actors;
    if (path.includes("storyflow_art_assets")) return rows.assets;
    if (path.includes("storyflow_universe_timeline_events")) return rows.timelines;
    if (path.includes("storyflow_work_local_states")) return rows.overlays;
    if (path.includes("storyflow_universe_inbox_items")) return rows.candidates;
    if (path.includes("source_type=eq.project")) return rows.projectPublications;
    if (path.includes("source_type=eq.actor")) return rows.actorPublications;
    if (path.includes("source_type=eq.asset")) return rows.assetPublications;
    return [];
  };
  return { calls, fetcher };
}

test("C1 public Universe projection separates public canon from owner-only working context", async () => {
  const { fetcher } = createFetcher();
  const result = await readCommunityUniverse(fetcher, { universeId: "u-1", viewerId: "visitor-1" });

  assert.equal(result.access, "public");
  assert.equal(result.universe.publicationId, "pub-u-1");
  assert.deepEqual(result.entities.map((item) => item.status), ["canon"]);
  assert.equal(result.works.length, 1);
  assert.equal(result.works[0].visibility, "public");
  assert.equal(result.candidates.length, 0);
  assert.equal(result.localOverlays.length, 0);
  assert.equal(result.actors.length, 1);
  assert.equal(result.voices.length, 1);
  assert.equal(result.assets.length, 1);
  assert.equal(result.timeline.length, 1);
  assert.equal(result.versions.length, 1);
  assert.equal(result.degraded, false);
});

test("C1 owner projection exposes draft candidates and local overlays without patch payloads", async () => {
  const { fetcher } = createFetcher();
  const result = await readCommunityUniverse(fetcher, { universeId: "u-1", viewerId: "owner-1" });

  assert.equal(result.access, "owner");
  assert.deepEqual(result.entities.map((item) => item.status), ["canon", "draft"]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.localOverlays.length, 1);
  assert.equal(result.localOverlays[0].revision, 2);
  assert.equal(result.localOverlays[0].workId, "work-1");
  assert.equal(result.localOverlays[0].projectId, "project-1");
  assert.equal(result.works[0].primaryWorkId, "work-1");
  assert.equal("patch" in result.localOverlays[0], false);
  assert.equal(result.versions.length, 2);
});

test("C1 optional Universe sources set degraded instead of becoming fixture content", async () => {
  const { fetcher } = createFetcher({ fail: ["storyflow_character_voice_profiles"] });
  const result = await readCommunityUniverse(fetcher, { universeId: "u-1", viewerId: "visitor-1" });

  assert.equal(result.degraded, true);
  assert.ok(result.degradedSources.includes("voice_profiles"));
  assert.deepEqual(result.voices, []);
});
