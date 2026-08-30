import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const interaction = readFileSync(
  new URL("../components/v2/community/CommunityInteractionPanel.tsx", import.meta.url),
  "utf8",
);
const notifications = readFileSync(
  new URL("../components/v2/community/CommunityNotifications.tsx", import.meta.url),
  "utf8",
);
const commentsRoute = readFileSync(
  new URL("../app/api/v2/community/publications/[id]/comments/route.ts", import.meta.url),
  "utf8",
);
const notificationsRoute = readFileSync(
  new URL("../app/api/v2/community/notifications/route.ts", import.meta.url),
  "utf8",
);

test("comment API returns a bounded page and an explicit next offset", () => {
  assert.match(commentsRoute, /limit:\s*limit \+ 1/);
  assert.match(commentsRoute, /hasMore/);
  assert.match(commentsRoute, /nextOffset/);
});

test("notification API returns a bounded page and an explicit next offset", () => {
  assert.match(notificationsRoute, /limit \+ 1/);
  assert.match(notificationsRoute, /hasMore/);
  assert.match(notificationsRoute, /nextOffset/);
});

test("comment panel appends de-duplicated pages and exposes bilingual load more", () => {
  assert.doesNotMatch(interaction, /limit=50&offset=0/);
  assert.match(interaction, /useI18n/);
  assert.match(interaction, /appendUnique/);
  assert.match(interaction, /nextOffset/);
  assert.match(interaction, /加载更多评论/);
  assert.match(interaction, /Load more comments/);
});

test("notification panel appends de-duplicated pages and exposes bilingual load more", () => {
  assert.doesNotMatch(notifications, /limit=50&offset=0/);
  assert.match(notifications, /useI18n/);
  assert.match(notifications, /appendUnique/);
  assert.match(notifications, /nextOffset/);
  assert.match(notifications, /加载更多通知/);
  assert.match(notifications, /Load more notifications/);
});
