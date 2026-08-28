import assert from "node:assert/strict";
import { test } from "node:test";
import { listCommunityFeed } from "../lib/server/v2/community/discovery.ts";

const row = {
  id: "pub-1",
  source_type: "universe",
  source_id: "u-1",
  source_version: "u-v2",
  publisher_id: "user-1",
  title: "The Glass City",
  summary: "A city that remembers every dream.",
  cover_url: "https://example.com/glass-city.png",
  visibility: "public",
  status: "active",
  invite_token_hash: null,
  created_at: "2026-08-28T00:00:00Z",
  updated_at: "2026-08-28T00:00:00Z",
  idempotency_key: "pub-1",
  follow_count: 4,
  reaction_count: 8,
  bookmark_count: 2,
  comment_count: 1,
};

test("C0 community feed returns public source context and allowed actions", async () => {
  let requestUrl = "";
  const fetcher = async (url) => {
    requestUrl = url;
    return [row];
  };

  const items = await listCommunityFeed(fetcher, {
    section: "universes",
    viewerId: "user-2",
    limit: 12,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].sourceType, "universe");
  assert.equal(items[0].sourceId, "u-1");
  assert.equal(items[0].sourceVersion, "u-v2");
  assert.equal(items[0].contentKind, "universe");
  assert.ok(items[0].allowedActions.includes("view"));
  assert.ok(items[0].allowedActions.includes("follow"));
  assert.match(requestUrl, /source_type=eq\.universe/);
  assert.match(requestUrl, /source_type/);
  assert.match(requestUrl, /source_id/);
  assert.match(requestUrl, /source_version/);
});

test("C0 community feed filters work sources without changing the legacy discover query", async () => {
  let requestUrl = "";
  const fetcher = async (url) => {
    requestUrl = url;
    return [];
  };

  await listCommunityFeed(fetcher, { section: "works", limit: 20 });
  assert.match(requestUrl, /source_type=in\.%28project%2Cepisode%2Cscene%29/);
  assert.match(requestUrl, /limit=20/);
});
