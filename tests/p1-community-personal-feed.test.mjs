import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { searchPersonalCommunityFeed } from "../lib/server/v2/community/search.ts";

const row = (id, createdAt) => ({
  id,
  source_type: "project",
  source_id: `source-${id}`,
  source_version: null,
  publisher_id: "owner-1",
  title: id,
  summary: "",
  cover_url: null,
  visibility: "public",
  status: "active",
  invite_token_hash: null,
  created_at: createdAt,
  updated_at: createdAt,
  idempotency_key: id,
  follow_count: 0,
  reaction_count: 0,
  bookmark_count: 0,
  comment_count: 0,
  project_id: null,
  work_id: null,
  work_type: null,
  universe_id: null,
});

test("personal feed calls the database RPC with limit+1 and emits a stable cursor", async () => {
  const calls = [];
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    if (path.includes("/rpc/list_community_personal_feed")) {
      return [
        row("00000000-0000-0000-0000-000000000003", "2026-08-31T03:00:00Z"),
        row("00000000-0000-0000-0000-000000000002", "2026-08-31T02:00:00Z"),
        row("00000000-0000-0000-0000-000000000001", "2026-08-31T01:00:00Z"),
      ];
    }
    return [];
  };
  const result = await searchPersonalCommunityFeed(fetcher, { section: "saved", viewerId: "viewer-1", limit: 2 });
  assert.equal(result.items.length, 2);
  assert.equal(result.hasMore, true);
  assert.ok(result.nextCursor);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.p_section, "saved");
  assert.equal(body.p_limit, 3);
});

test("personal feed sends decoded cursor fields back to the RPC", async () => {
  let firstBody;
  const fetcher = async (path, init = {}) => {
    if (!path.includes("/rpc/list_community_personal_feed")) return [];
    firstBody = JSON.parse(init.body);
    return [];
  };
  const cursor = Buffer.from(JSON.stringify({ createdAt: "2026-08-31T02:00:00Z", id: "00000000-0000-0000-0000-000000000002" })).toString("base64url");
  await searchPersonalCommunityFeed(fetcher, { section: "following", viewerId: "viewer-1", cursor, limit: 20, query: "Mara" });
  assert.equal(firstBody.p_cursor_created_at, "2026-08-31T02:00:00Z");
  assert.equal(firstBody.p_cursor_id, "00000000-0000-0000-0000-000000000002");
  assert.equal(firstBody.p_query, "Mara");
});

test("DiscoveryFeed no longer joins fixed 100/200 item lists in the browser", () => {
  const source = readFileSync(new URL("../components/v2/community/DiscoveryFeed.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /limit=100/);
  assert.doesNotMatch(source, /limit=200/);
  assert.doesNotMatch(source, /filterFollowedItems|filterSavedItems/);
  assert.match(source, /section, limit: "20"/);
});

test("personal feed migration performs Follow/Bookmark filtering in PostgreSQL", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260831010000_community_personal_feed_cursor.sql", import.meta.url), "utf8");
  assert.match(sql, /list_community_personal_feed/);
  assert.match(sql, /storyflow_follows/);
  assert.match(sql, /storyflow_bookmarks/);
  assert.match(sql, /publication\.created_at DESC, publication\.id DESC/);
  assert.match(sql, /REVOKE ALL.*authenticated/i);
});

test("personal feed compares UUID follow targets without invalid text casts", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260831010000_community_personal_feed_cursor.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /follow\.target_id\s*=\s*publication\.(?:id|publisher_id|universe_id|source_id)::text/);
  assert.match(sql, /follow\.target_id = publication\.id/);
  assert.match(sql, /follow\.target_id = publication\.publisher_id/);
});
