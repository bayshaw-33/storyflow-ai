import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeCommunityCursor,
  encodeCommunityCursor,
  searchCommunityFeed,
} from "../lib/server/v2/community/search.ts";

const row = {
  id: "pub-2",
  source_type: "project",
  source_id: "project-2",
  source_version: "v3",
  publisher_id: "creator-2",
  title: "Glass City Season Two",
  summary: "A work about memory.",
  cover_url: null,
  visibility: "public",
  status: "active",
  invite_token_hash: null,
  created_at: "2026-08-28T00:00:00Z",
  updated_at: "2026-08-28T00:00:00Z",
  idempotency_key: "pub-2",
  follow_count: 0,
  reaction_count: 0,
  bookmark_count: 0,
  comment_count: 0,
};

test("C1 search uses a stable keyset cursor and returns a next cursor", async () => {
  const requestUrls = [];
  const fetcher = async (url) => {
    requestUrls.push(url);
    return [row, { ...row, id: "pub-1", created_at: "2026-08-27T00:00:00Z" }];
  };

  const result = await searchCommunityFeed(fetcher, {
    query: "memory",
    section: "works",
    limit: 1,
    viewerId: "visitor-1",
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.hasMore, true);
  assert.ok(result.nextCursor);
  assert.deepEqual(decodeCommunityCursor(result.nextCursor), {
    createdAt: row.created_at,
    id: row.id,
  });
  const publicationRequest = requestUrls.find((url) => url.includes("storyflow_publications"));
  assert.ok(publicationRequest);
  assert.match(publicationRequest, /source_type=in\.%28project%2Cepisode%2Cscene%29/);
  assert.match(publicationRequest, /order=created_at\.desc%2Cid\.desc/);
  assert.match(publicationRequest, /and=/);
  assert.match(publicationRequest, /or%3D/);
  assert.match(publicationRequest, /limit=2/);
});

test("C1 search cursor excludes newer rows and invalid cursor is a validation error", async () => {
  let requestUrl = "";
  const cursor = encodeCommunityCursor({ createdAt: row.created_at, id: row.id });
  const fetcher = async (url) => {
    requestUrl = url;
    return [];
  };

  const result = await searchCommunityFeed(fetcher, { cursor, limit: 20 });
  assert.equal(result.hasMore, false);
  assert.equal(result.nextCursor, null);
  assert.match(requestUrl, /created_at/);
  assert.match(requestUrl, /id/);

  await assert.rejects(
    () => searchCommunityFeed(fetcher, { cursor: "not-a-cursor" }),
    (error) => error.code === "validation_failed",
  );
});
