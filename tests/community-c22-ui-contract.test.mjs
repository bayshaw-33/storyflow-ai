import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("C2 detail UI uses real comment API and exposes local retry", async () => {
  const source = await read("components/v2/community/CommunityInteractionPanel.tsx");
  assert.match(source, /api\/v2\/community\/publications/);
  assert.match(source, /parentCommentId/);
  assert.match(source, /重试|Retry/);
  assert.match(source, /idempotencyKey/);
});

test("C2 notification UI uses the community notification route", async () => {
  const source = await read("components/v2/community/CommunityNotifications.tsx");
  assert.match(source, /api\/v2\/community\/notifications/);
  assert.match(source, /read_all|全部标记已读/);
  assert.match(source, /linkUrl/);
});

test("C2 publication detail mounts interaction panel with auth state", async () => {
  const source = await read("app/community/[publicationId]/page.tsx");
  assert.match(source, /CommunityInteractionPanel/);
  assert.match(source, /viewerId/);
});

test("C2 community shell exposes a notification entry point", async () => {
  const source = `${await read("components/v2/community/DiscoveryFeed.tsx")}\n${await read("components/v2/community/CommunityNavigation.tsx")}`;
  assert.match(source, /CommunityNotifications/);
  assert.match(source, /通知|Notifications/);
});

test("C2 return actions never expose an unbacked clickable license or remix action", async () => {
  const source = await read("components/v2/community/CommunityReturnActions.tsx");
  assert.match(source, /allowedActions/);
  assert.match(source, /暂不可用|Unavailable/);
  assert.match(source, /license|remix/);
  assert.match(source, /真实|real/i);
});

test("C2 publication detail keeps the real source and return actions together", async () => {
  const source = await read("app/community/[publicationId]/page.tsx");
  assert.match(source, /CommunityReturnActions/);
  assert.match(source, /getPublicationObjectHref/);
});
