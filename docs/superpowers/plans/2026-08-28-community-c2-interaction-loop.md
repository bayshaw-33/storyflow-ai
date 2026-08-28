# Kiikis C2 社区互动与创作回流闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 C0/C1 社区发现页升级为可评论、可回复、可收取通知，并能从真实 publication 回到真实 Work/Universe/Asset 能力的互动闭环。

**Architecture:** 保留现有 publication、评论服务、`creative_events` 通知事件和 grant/marketplace API，不新增第二套社区数据模型。新增通知 HTTP 边界和两个局部客户端组件；详情页服务端继续负责 publication/source/权限，客户端只负责评论、已读和动作反馈。任何没有真实后端能力的回流动作都以 disabled + 原因呈现。

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase PostgREST service fetch, Node `node:test`, Playwright.

## Global Constraints

- 所有写操作继续由认证态注入 author、recipient、owner，不信任客户端身份字段。
- 评论、通知已读、回流申请必须幂等；不使用 fixture、假通知、假评论或假授权结果。
- `creative_events` append-only；通知已读只写 `storyflow_notification_reads`。
- 社区隐藏只隐藏 publication，不删除 Project、Universe、Work、Actor 或 Asset。
- C2 不扩展举报、屏蔽、审核、申诉的产品范围；治理体验留在 C3。
- C2 不新增数据库迁移；若实现中发现必须改库，停止该任务并先单独提交 forward migration 设计与生产迁移方案。
- 每个行为先写失败测试并确认失败，再写最小生产代码；每个任务完成后单独提交。

---

## 文件结构与职责

- `app/api/v2/community/notifications/route.ts`：当前用户通知列表、单条已读、全部已读 HTTP 边界。
- `lib/server/v2/community/comments.ts`：评论查询/创建/软删除的服务约束，不改变现有数据库模型。
- `components/v2/community/CommunityInteractionPanel.tsx`：publication 详情页评论树、回复、删除和局部状态。
- `components/v2/community/CommunityNotifications.tsx`：通知列表、未读数、已读和跳转。
- `components/v2/community/CommunityReturnActions.tsx`：Use/Remix/License 真实入口与 disabled 原因。
- `app/community/[publicationId]/page.tsx`：将服务端 publication 上下文交给局部客户端组件。
- `components/v2/community/DiscoveryFeed.tsx`、`CommunityNavigation.tsx`、`app/community/community.module.css`：通知入口、侧栏/抽屉和响应式布局。
- `tests/community-c22-interaction.test.mjs`：契约、服务和路由测试。
- `tests/community-c22-ui-contract.test.mjs`：UI 源码契约，验证入口、错误状态和真实 API。
- `e2e/community-c22-object-loop.spec.ts`：两账号互动、通知和回流入口的真实浏览器路径。

## Task 1: 先固定 C2 契约并制造红灯

**Files:**
- Create: `tests/community-c22-interaction.test.mjs`
- Create: `tests/community-c22-ui-contract.test.mjs`

**Interfaces:**
- Consumes: `lib/contracts/v2/comments.ts`, `lib/server/v2/community/comments.ts`, existing publication detail route.
- Produces: 明确要求 notification route、comment UI、notification UI 和回流 action 的测试红线。

- [ ] **Step 1: Write the failing contract tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseNotification, toCommentProjection } from "../lib/contracts/v2/comments.ts";

test("C2 notification route exposes authenticated list and idempotent read actions", async () => {
  const source = await readFile(new URL("../app/api/v2/community/notifications/route.ts", import.meta.url), "utf8");
  assert.match(source, /authenticateRequest/);
  assert.match(source, /listNotifications/);
  assert.match(source, /markNotificationRead/);
  assert.match(source, /markAllNotificationsRead/);
});

test("C2 deleted comment projection keeps the row but hides its body", () => {
  const projection = toCommentProjection({
    id: "comment-1", publication_id: "pub-1", parent_comment_id: null,
    author_id: "user-1", body: "private body", deleted_at: "2026-08-28T00:00:00Z",
    deleted_by: "user-1", frozen_at: null, frozen_by: null, frozen_reason: null,
    moderation_id: null, created_at: "2026-08-28T00:00:00Z",
    updated_at: "2026-08-28T00:00:00Z", idempotency_key: "comment-1",
  });
  assert.equal(projection.deleted, true);
  assert.equal(projection.body, "");
});

test("C2 notification parser preserves a real publication link", () => {
  const notification = parseNotification({
    id: "event-1", owner_id: "user-1", event_type: "notification_comment",
    actor_type: "user", actor_id: "user-2", created_at: "2026-08-28T00:00:00Z",
    payload: { title: "有人评论了你的作品", body: "打开查看", resource_type: "publication", resource_id: "pub-1" },
  });
  assert.equal(notification.linkUrl, "/community/pub-1");
});
```

- [ ] **Step 2: Run the tests and confirm the failure is about the missing C2 surface**

Run: `node --test tests/community-c22-interaction.test.mjs tests/community-c22-ui-contract.test.mjs`

Expected: the notification route test fails because `app/api/v2/community/notifications/route.ts` does not exist; no unrelated TypeScript or import error is accepted.

- [ ] **Step 3: Add the UI contract assertions and keep them red**

The UI test must read these exact files and assert the future boundaries:

```js
test("C2 detail UI uses real comment API and exposes local retry", async () => {
  const source = await read("components/v2/community/CommunityInteractionPanel.tsx");
  assert.match(source, /api\\/v2\\/community\\/publications/);
  assert.match(source, /parentCommentId/);
  assert.match(source, /重试|Retry/);
  assert.match(source, /idempotencyKey/);
});

test("C2 notification UI uses the community notification route", async () => {
  const source = await read("components/v2/community/CommunityNotifications.tsx");
  assert.match(source, /api\\/v2\\/community\\/notifications/);
  assert.match(source, /read_all|全部标记已读/);
  assert.match(source, /linkUrl/);
});
```

- [ ] **Step 4: Commit the red tests**

```bash
git add tests/community-c22-interaction.test.mjs tests/community-c22-ui-contract.test.mjs
git commit -m "test(community): define C2 interaction contracts"
```

## Task 2: 补齐通知 API，并固定评论边界

**Files:**
- Create: `app/api/v2/community/notifications/route.ts`
- Modify: `app/api/v2/community/publications/[id]/comments/route.ts`
- Modify: `lib/server/v2/community/comments.ts`
- Modify: `lib/server/v2/community/notifications.ts`
- Test: `tests/community-c22-interaction.test.mjs`

**Interfaces:**
- Consumes: `listNotifications`, `markNotificationRead`, `markAllNotificationsRead`, `createComment`, `listComments`.
- Produces: `GET /api/v2/community/notifications` and `POST /api/v2/community/notifications`；评论 POST 需要稳定幂等键，评论回复必须属于同一 publication。

- [ ] **Step 1: Extend tests for exact route behavior**

```js
test("C2 notification route authenticates and supports list/read/read_all", async () => {
  const source = await read("app/api/v2/community/notifications/route.ts");
  assert.match(source, /authenticateRequest/);
  assert.match(source, /listNotifications/);
  assert.match(source, /markNotificationRead/);
  assert.match(source, /markAllNotificationsRead/);
  assert.match(source, /unreadCount/);
});

test("C2 comment route keeps client idempotency key instead of generating a retry-unsafe timestamp key", async () => {
  const source = await read("app/api/v2/community/publications/[id]/comments/route.ts");
  assert.match(source, /body\\.idempotencyKey/);
  assert.doesNotMatch(source, /Date\\.now\\(\\)/);
});
```

- [ ] **Step 2: Run the focused tests and confirm the route assertions fail**

Run: `node --test tests/community-c22-interaction.test.mjs`

Expected: failure for the missing notification route and timestamp-based comment idempotency.

- [ ] **Step 3: Implement the minimal notification route**

The route must use the authenticated user and return this shape:

```ts
const user = await authenticateRequest(request);
const items = await listNotifications(serviceFetch, user.id, { limit, offset, unreadOnly });
return NextResponse.json({
  success: true,
  contractVersion: "kiikis.community.notification/1",
  items,
  unreadCount: items.filter((item) => !item.read).length,
});
```

For POST, accept only `{ action: "read", eventId }` and `{ action: "read_all" }`; reject all other actions with `validation_failed` and status 400. Call `markNotificationRead` or `markAllNotificationsRead`, and return `{ success: true, marked }`.

- [ ] **Step 4: Make comment retry behavior deterministic**

Require a non-empty `body.idempotencyKey` in the comments POST route. Pass the exact key to `createComment`; do not synthesize a key with `Date.now()`. Keep `parentCommentId` optional and let the service/DB reject a parent that is not in the same publication.

- [ ] **Step 5: Run the focused tests and commit the green API slice**

Run: `node --test tests/community-c22-interaction.test.mjs`

Expected: all C2 interaction tests pass.

```bash
git add app/api/v2/community/notifications/route.ts app/api/v2/community/publications/'[id]'/comments/route.ts lib/server/v2/community/comments.ts lib/server/v2/community/notifications.ts tests/community-c22-interaction.test.mjs
git commit -m "feat(community): expose notification API and safe comment retries"
```

## Task 3: 实现 publication 详情页评论与回复

**Files:**
- Create: `components/v2/community/CommunityInteractionPanel.tsx`
- Modify: `app/community/[publicationId]/page.tsx`
- Modify: `app/community/community.module.css`
- Test: `tests/community-c22-ui-contract.test.mjs`

**Interfaces:**
- Consumes: server-rendered publication/context/allowedActions and `/api/v2/community/publications/[id]/comments`.
- Produces: client component props `{ publicationId: string; viewerId: string | null; canComment: boolean }`; comments remain local to the detail page.

- [ ] **Step 1: Add the failing UI expectations for detail integration**

```js
test("C2 publication detail mounts interaction panel with auth state", async () => {
  const source = await read("app/community/[publicationId]/page.tsx");
  assert.match(source, /CommunityInteractionPanel/);
  assert.match(source, /viewerId/);
});
```

- [ ] **Step 2: Run the UI test and confirm it fails**

Run: `node --test tests/community-c22-ui-contract.test.mjs`

Expected: failure because the detail page does not import or render `CommunityInteractionPanel`.

- [ ] **Step 3: Implement the minimum comment panel**

The component must:

1. Load `GET /api/v2/community/publications/${publicationId}/comments?limit=50&offset=0` on mount.
2. Group replies by `parentCommentId` for rendering; do not flatten away the relationship.
3. Generate one `crypto.randomUUID()` idempotency key per submit attempt and preserve it while retrying.
4. POST `{ body, parentCommentId, idempotencyKey }` and append only the returned server comment.
5. Disable submit while pending and show a local error with a retry button on load failure.
6. For the author, call `DELETE /api/v2/community/comments/${comment.id}` and replace the item with the returned projection/state; never remove the row from the UI.
7. For anonymous viewers, show a login action instead of a comment form.

- [ ] **Step 4: Mount it without squeezing the existing source context**

Render the panel after the existing source block in `app/community/[publicationId]/page.tsx`, passing `publicationId`, `viewer?.id ?? null`, and `detail.allowedActions.includes("comment")`. Keep the object summary, source/version, rights and contribution blocks unchanged.

- [ ] **Step 5: Add responsive styles and verify**

Add only scoped classes for the interaction panel, comment rows, reply indent, input, local error and retry button. On narrow screens, use one column and keep the source context above comments.

Run: `node --test tests/community-c22-ui-contract.test.mjs`

Expected: all UI contract tests pass.

```bash
git add components/v2/community/CommunityInteractionPanel.tsx app/community/'[publicationId]'/page.tsx app/community/community.module.css tests/community-c22-ui-contract.test.mjs
git commit -m "feat(community): add publication comments and replies"
```

## Task 4: 实现通知中心与未读状态

**Files:**
- Create: `components/v2/community/CommunityNotifications.tsx`
- Modify: `components/v2/community/DiscoveryFeed.tsx`
- Modify: `components/v2/community/CommunityNavigation.tsx`
- Modify: `app/community/community.module.css`
- Test: `tests/community-c22-ui-contract.test.mjs`

**Interfaces:**
- Consumes: `/api/v2/community/notifications`, `CommunityNotification`, existing community navigation.
- Produces: notification button with unread count and panel states loading/empty/error/ready/marking-read.

- [ ] **Step 1: Add the failing notification integration assertion**

```js
test("C2 community shell exposes a notification entry point", async () => {
  const source = `${await read("components/v2/community/DiscoveryFeed.tsx")}\\n${await read("components/v2/community/CommunityNavigation.tsx")}`;
  assert.match(source, /CommunityNotifications/);
  assert.match(source, /通知|Notifications/);
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `node --test tests/community-v22-ui-contract.test.mjs tests/community-c22-ui-contract.test.mjs`

Expected: failure because no notification component is imported by the community shell.

- [ ] **Step 3: Implement notification loading and read actions**

Use these client behaviors:

```ts
const response = await fetchWithAuthRetry("/api/v2/community/notifications?limit=50&offset=0");
const json = (await response.json()) as { items?: CommunityNotification[]; unreadCount?: number; error?: string };
```

For a notification with `linkUrl`, POST `{ action: "read", eventId: notification.id }`, update only that item to `read: true`, then use `router.push(notification.linkUrl)`. If marking read fails, keep the item visible and show a retryable error. “全部标记已读” calls `{ action: "read_all" }` and refreshes from the server.

- [ ] **Step 4: Integrate it into the existing community shell**

Add a single visible entry point in the feed header or side rail. The panel may be an inline section or dialog, but it must not replace the existing feed navigation. Anonymous viewers see a sign-in prompt; no notification fixture is rendered.

- [ ] **Step 5: Verify the UI contract and commit**

Run: `node --test tests/community-c22-ui-contract.test.mjs`

Expected: all UI contract tests pass.

```bash
git add components/v2/community/CommunityNotifications.tsx components/v2/community/DiscoveryFeed.tsx components/v2/community/CommunityNavigation.tsx app/community/community.module.css tests/community-c22-ui-contract.test.mjs
git commit -m "feat(community): add notification center"
```

## Task 5: 对齐真实 Use/Remix/License 回流入口

**Files:**
- Create: `components/v2/community/CommunityReturnActions.tsx`
- Modify: `lib/contracts/v2/community.ts`
- Modify: `lib/client/v2/community/view-model.ts`
- Modify: `app/community/[publicationId]/page.tsx`
- Modify: `components/v2/community/PublicationCard.tsx`
- Test: `tests/community-c22-interaction.test.mjs`, `tests/community-c22-ui-contract.test.mjs`

**Interfaces:**
- Consumes: `allowedActions`, `projectId`, `workId`, `workType`, `sourceType`, `universeId`, existing `/api/v2/grants`, `/api/v2/marketplace/grants`, asset license-offer routes.
- Produces: action descriptors `{ id: "apply_use" | "remix" | "license"; enabled: boolean; href?: string; reason?: string }`; no action reports success until a real response exists.

- [ ] **Step 1: Add failing assertions for honest action availability**

```js
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
```

- [ ] **Step 2: Run and confirm red**

Run: `node --test tests/community-c22-interaction.test.mjs tests/community-c22-ui-contract.test.mjs`

Expected: failure because the action component is absent.

- [ ] **Step 3: Implement action descriptors from server truth**

Keep `apply_use` as the only currently executable community action unless the source context resolves to a real grant/marketplace route. For `remix` and `license`, render a disabled button with a rights-based reason when no real endpoint or offer exists. Use same-origin links for known Work/Universe/Actor/Asset routes and preserve `sourceVersion` in the visible context.

- [ ] **Step 4: Add real apply-use handoff without fake completion**

On `apply_use`, open a small target-Project selection flow. Submit only to the existing grant/usage-grant route with a stable idempotency key. Keep the action in “submitted/pending” until the server returns a grant/application identifier; show server errors verbatim through the established error mapping.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/community-c22-interaction.test.mjs tests/community-c22-ui-contract.test.mjs`

Expected: all C2 focused tests pass.

```bash
git add components/v2/community/CommunityReturnActions.tsx lib/contracts/v2/community.ts lib/client/v2/community/view-model.ts app/community/'[publicationId]'/page.tsx components/v2/community/PublicationCard.tsx tests/community-c22-interaction.test.mjs tests/community-c22-ui-contract.test.mjs
git commit -m "feat(community): connect honest creation return actions"
```

## Task 6: 真实闭环验证与交付

**Files:**
- Create: `e2e/community-c22-object-loop.spec.ts`
- Modify: `CODEX_REPORT.md`

- [ ] **Step 1: Write the E2E flow before running it**

The test must use configured authenticated accounts and a real publication; it must not seed fixture rows. The assertions are:

```ts
await pageA.goto(`/community/${publicationId}`);
await expect(pageA.getByRole("heading", { name: publicationTitle })).toBeVisible();
await pageB.getByRole("textbox", { name: /评论|comment/i }).fill("继续做下去");
await pageB.getByRole("button", { name: /发送|post/i }).click();
await expect(pageB.getByText("继续做下去")).toBeVisible();
await pageA.goto("/community");
await pageA.getByRole("button", { name: /通知|notifications/i }).click();
await expect(pageA.getByText(/评论|comment/i)).toBeVisible();
await pageA.getByText(publicationTitle).click();
await expect(pageA).toHaveURL(new RegExp(`/community/${publicationId}`));
```

- [ ] **Step 2: Run focused tests and typecheck**

```bash
node --test tests/community-c22-interaction.test.mjs tests/community-c22-ui-contract.test.mjs tests/community-c22-acceptance-gaps.test.mjs tests/community-route-filter-validation.test.mjs tests/community-v20-*.test.mjs tests/community-v21-*.test.mjs
npx tsc --noEmit
```

Expected: focused C2 and existing C0/C1 tests pass; TypeScript exits 0.

- [ ] **Step 3: Run production build**

Run: `pnpm build`

Expected: Next.js production build succeeds with no new error; existing non-blocking asset/autoprefixer warnings may be recorded but not hidden.

- [ ] **Step 4: Run the authenticated browser flow when credentials are available**

Run: `pnpm exec playwright test e2e/community-c22-object-loop.spec.ts --project=chromium`. If the configured accounts or a real publication are unavailable, record the exact blocker in `CODEX_REPORT.md`; do not replace the flow with fixtures.

- [ ] **Step 5: Record evidence and commit delivery report**

Update `CODEX_REPORT.md` with changed files, focused test counts, build result, E2E result or blocker, and explicit “no production migration” evidence. Then run:

```bash
git diff --check
git status --short
git add e2e/community-c22-object-loop.spec.ts CODEX_REPORT.md
git commit -m "test(community): verify C2 object interaction loop"
```

- [ ] **Step 6: Handoff**

Push `codex/c2-community-loop` for review. Do not merge or deploy production from this feature branch until the C2 acceptance result is available; if accepted, merge to `main`, verify Supabase migration status is unchanged, then deploy Vercel production and smoke-test `/community` plus one real publication detail URL.
