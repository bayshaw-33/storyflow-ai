import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("C0 community feed uses the new section model and real feed endpoint", async () => {
  const source = await read("components/v2/community/DiscoveryFeed.tsx");
  assert.match(source, /COMMUNITY_SECTIONS/);
  assert.match(source, /\/api\/v2\/community\/feed/);
  assert.match(source, /aria-label=/);
  assert.match(source, /following/);
  assert.match(source, /saved/);
});

test("C0 publication card exposes source context and a stable detail target", async () => {
  const source = await read("components/v2/community/PublicationCard.tsx");
  assert.match(source, /getPublicationDetailHref/);
  assert.match(source, /sourceVersion/);
  assert.match(source, /allowedActions/);
  assert.match(source, /\/community\//);
});

test("C0 community page keeps a real unavailable state instead of fake content", async () => {
  const source = await read("app/community/CommunityPlaceholderClient.tsx");
  assert.match(source, /role="status"/);
  assert.match(source, /重试|Retry/);
  assert.doesNotMatch(source, /fixture|demo/i);
});
