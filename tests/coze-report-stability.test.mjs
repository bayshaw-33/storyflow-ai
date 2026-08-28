import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("已购演员页不因 SSR 缺少 cookie 直接重定向，并使用 auth retry 拉取", () => {
  const page = read("app/actors/purchased/page.tsx");
  const client = read("app/actors/purchased/PurchasedActorsClient.tsx");
  assert.match(client, /fetchWithAuthRetry/);
  assert.doesNotMatch(page, /if\s*\(!viewer\)\s*\{\s*redirect\("\/login"\)/s);
  assert.match(client, /getSupabaseBrowserClient/);
});

test("演员市场详情和购买操作使用请求级/浏览器级认证事实源", () => {
  const marketRoute = read("app/api/actors/[actorId]/market/route.ts");
  const detail = read("components/marketplace/ActorMarketDetail.tsx");
  const actorPage = read("app/actors/[actorId]/page.tsx");
  assert.match(marketRoute, /getViewerFromRequest/);
  assert.match(marketRoute, /getViewerFromRequest\(request\)/);
  assert.match(detail, /fetchWithAuthRetry/);
  assert.match(actorPage, /fetchWithAuthRetry/);
});

test("任务中心展示最后成功更新时间，并把任务操作纳入认证重试路径", () => {
  const taskCenter = read("components/v2/task-center/TaskCenter.tsx");
  assert.match(taskCenter, /lastUpdatedAt/);
  assert.match(taskCenter, /最后更新|Last updated/);
  assert.match(taskCenter, /fetchWithAuthRetry/);
  assert.doesNotMatch(taskCenter, /\?\s*\{\s*Authorization:\s*`Bearer \$\{session\.access_token\}`\s*\}:\s*\{\}\s*,\s*\n\s*\.\.\.\(session\?\.access_token/);
});

test("社区发现失败时提供可见的重新加载入口", () => {
  const feed = read("components/v2/community/DiscoveryFeed.tsx");
  assert.match(feed, /重新加载|Reload/);
  assert.match(feed, /onClick=.*loadMore|onClick=.*reload/s);
});
